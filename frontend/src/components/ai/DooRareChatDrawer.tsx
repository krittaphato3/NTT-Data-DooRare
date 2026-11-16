import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getStoredToken } from '../../services/apiFetch';
import { streamAiChat, type ChatMessage, type RouteContext } from '../../services/aiChatApi';
import { DooRareBotAvatar } from './DooRareBotAvatar';
import { MarkdownContent } from '../common/MarkdownContent';
import { ToolExecutionLogCard, formatToolPurpose, type ToolLogEntry } from './ToolExecutionLogCard';
import { ThinkingAccordion } from './ThinkingAccordion';
import { AnswerInsights } from './AnswerInsights';
import { ClarifyPanel } from './ClarifyPanel';
import { Icon, type IconName } from '../common/icons';
import {
  loadSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
  groupSessionsByDate,
  type ChatSession,
  type DisplayChatMessage,
} from '../../services/chatSessionStore';
import './chatDrawer.css';

interface ProposalCardProps {
  proposal: {
    type: string;
    title: string;
    description: string;
    summary: Record<string, unknown>;
    targetId?: string;
    actionApi: {
      endpoint: string;
      method: string;
      payload: Record<string, unknown>;
    };
  };
  initialStatus?: 'pending' | 'approved' | 'declined' | 'failed';
  targetId?: string;
  targetRequestNo?: string;
  onActionComplete: (
    status: 'approved' | 'declined' | 'failed',
    msg: string,
    data?: { id?: string; requestNo?: string },
  ) => void;
  onNavigateProposal?: (targetUrl: string, targetId?: string) => void;
}

const resolveKitCode = (input: string): string | null => {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  const upper = s.toUpperCase();
  const validCodes = ['TRAUMA_RESUS', 'INTUBATION', 'IV_SET', 'BURN', 'CHEST_TUBE', 'SPLINT', 'MINOR_WOUND'];
  if (validCodes.includes(upper)) return upper;
  if (s.includes('ชุดช่วยชีวิต') || upper.includes('TRAUMA') || upper.includes('RESUS')) return 'TRAUMA_RESUS';
  if (s.includes('ท่อช่วยหายใจ') || upper.includes('INTUBAT')) return 'INTUBATION';
  if (s.includes('สารน้ำ') || upper.includes('IV')) return 'IV_SET';
  if (s.includes('ไฟไหม้') || upper.includes('BURN')) return 'BURN';
  if (s.includes('ระบายทรวงอก') || upper.includes('CHEST') || upper.includes('TUBE') || upper.includes('ICD')) return 'CHEST_TUBE';
  if (s.includes('ดามกระดูก') || s.includes('พันแผล') || upper.includes('SPLINT')) return 'SPLINT';
  if (s.includes('แผลเล็ก') || upper.includes('MINOR')) return 'MINOR_WOUND';
  return null;
};

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  initialStatus,
  targetId,
  targetRequestNo,
  onActionComplete,
  onNavigateProposal,
}) => {
  const [loading, setLoading] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'declined' | null>(() => {
    if (initialStatus === 'approved' || initialStatus === 'declined') return initialStatus;
    const propStatus = (proposal as any)?.status?.toLowerCase();
    if (propStatus === 'approved' || propStatus === 'declined') return propStatus;
    return null;
  });
  const [createdEntity, setCreatedEntity] = useState<{ id?: string; requestNo?: string } | null>(() => {
    const propReqNo = targetRequestNo || (proposal as any)?.requestNo || (proposal as any)?.summary?.request_no || (proposal as any)?.summary?.requestNo;
    const propId = targetId || (proposal as any)?.targetId || (proposal as any)?.id || (proposal as any)?.summary?.id;
    if (propReqNo || propId) {
      return { id: propId, requestNo: propReqNo };
    }
    return null;
  });

  useEffect(() => {
    const isApp = initialStatus === 'approved' || (proposal as any)?.status === 'APPROVED' || (proposal as any)?.status === 'approved';
    const isDec = initialStatus === 'declined' || (proposal as any)?.status === 'DECLINED' || (proposal as any)?.status === 'declined';
    if (isApp) {
      setDecided('approved');
    } else if (isDec) {
      setDecided('declined');
    }
  }, [initialStatus, proposal]);

  useEffect(() => {
    const propReqNo = targetRequestNo || (proposal as any)?.requestNo || (proposal as any)?.summary?.request_no || (proposal as any)?.summary?.requestNo;
    const propId = targetId || (proposal as any)?.targetId || (proposal as any)?.id;
    if (propReqNo || propId) {
      setCreatedEntity((prev) => ({
        id: propId || prev?.id,
        requestNo: propReqNo || prev?.requestNo,
      }));
    }
  }, [targetId, targetRequestNo, proposal]);

  // Auto-reconciliation: If loaded from history without saved status, check if the borrow request
  // already exists in the backend so it doesn't revert to unapproved.
  useEffect(() => {
    if (decided !== null) return;
    const isBorrow =
      proposal.type === 'CREATE_BORROW_REQUEST' ||
      proposal.actionApi?.endpoint?.includes('/borrow-requests');
    if (!isBorrow) return;

    const token = getStoredToken();
    const payload = proposal.actionApi?.payload || {};
    const s = proposal.summary || {};
    const drugName = String(s.drug_name || s.drug || s.item_code || proposal.title || '').toLowerCase();
    const payloadDmId = (payload.drugMasterId || (payload.items as any)?.[0]?.drugMasterId) as string | undefined;

    fetch('/api/v1/borrow-requests?role=borrower', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        const items: any[] = data.items || data.data || (Array.isArray(data) ? data : []);
        const matched = items.find((item) => {
          const itemDmId = item.drug?.id || item.drugMasterId;
          const matchDm = payloadDmId && itemDmId && payloadDmId === itemDmId;
          const itemDrugName = (item.drug?.name || item.drug?.genericName || item.drug || '').toLowerCase();
          const matchName =
            drugName &&
            itemDrugName &&
            (drugName.includes(itemDrugName) || itemDrugName.includes(drugName.split(' ')[0]));
          return matchDm || matchName;
        });

        if (matched) {
          const reqNo = matched.requestNo || matched.id;
          const uId = matched.id || matched.uuid;
          setDecided('approved');
          setCreatedEntity({ id: uId, requestNo: reqNo });
          onActionComplete('approved', `ดำเนินการสำเร็จ: ${proposal.title}`, { id: uId, requestNo: reqNo });
        }
      })
      .catch(() => {});
  }, [decided, proposal, onActionComplete]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  // Write routes (borrow requests, pool release, plan approval, emergency borrowing, allocation agent...) require an
  // Idempotency-Key; one key per card, so approving again after a network error never runs the action twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [isDuplicateConflict, setIsDuplicateConflict] = useState(false);

  const handleApprove = async (force = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Execute the proposal's action API (endpoint is already prefixed with /api/v1; send the session token)
      const token = getStoredToken();
      const currentKey = force ? crypto.randomUUID() : idempotencyKey;
      if (force) {
        setIdempotencyKey(currentKey);
      }

      let countsToSend = proposal.actionApi?.payload?.counts || proposal.actionApi?.payload?.patientCounts;
      if (!countsToSend || (typeof countsToSend === 'object' && Object.values(countsToSend).every((v: any) => Number(v) === 0))) {
        if (hasCasualties || redCount > 0 || yellowCount > 0 || greenCount > 0 || blackCount > 0) {
          countsToSend = {
            RED: redCount || (yellowCount === 0 && greenCount === 0 && blackCount === 0 ? totalCasualties : 0),
            YELLOW: yellowCount,
            GREEN: greenCount,
            BLACK: blackCount,
          };
        }
      }

      const setKits: Record<string, number> = {};
      for (const k of recommendedKits) {
        const rawCode = String(k.kitCode || k.code || k.kitName || k.name || '').trim();
        const code = resolveKitCode(rawCode);
        const q = Number(k.estimatedQuantity ?? k.qty ?? 1);
        if (code && q > 0) setKits[code] = q;
      }
      const setExtras: Record<string, number> = {};
      for (const a of recommendedAntidotes) {
        const id = a.drugMasterId || a.id;
        const isUuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const q = Number(a.qty ?? a.availableQuantity ?? 1);
        if (id && isUuid && q > 0) setExtras[id] = q;
      }
      const editsToSend =
        Object.keys(setKits).length > 0 || Object.keys(setExtras).length > 0
          ? { packOverrides: {}, removeKits: [], removeExtras: [], setKits, setExtras }
          : proposal.actionApi?.payload?.edits;

      const payload = {
        ...proposal.actionApi.payload,
        ...(countsToSend ? { counts: countsToSend, patientCounts: countsToSend } : {}),
        ...(editsToSend ? { edits: editsToSend } : {}),
        ...(force ? { force: true, confirmDuplicate: true, allowDuplicate: true } : {}),
      };

      const res = await fetch(proposal.actionApi.endpoint, {
        method: proposal.actionApi.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': currentKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        const message = problem.message || problem.title || `HTTP ${res.status}`;
        throw new Error(message);
      }

      const resJson = await res.json().catch(() => ({}));
      const createdId = resJson?.id || resJson?.data?.id || proposal.targetId;
      const requestNo = resJson?.data?.requestNo || resJson?.requestNo || proposal.summary?.request_no || proposal.summary?.requestNo;
      if (createdId || requestNo) {
        setCreatedEntity({ id: createdId, requestNo });
      }

      if (createdId) {
        if (typeof proposal.actionApi?.endpoint === 'string' && proposal.actionApi.endpoint.includes('/borrow-requests')) {
          // Auto-propose lender ladder so the request immediately moves from DRAFT to PENDING_APPROVAL / ESCALATED
          await fetch(`/api/v1/borrow-requests/${createdId}/propose`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': crypto.randomUUID(),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }).catch((err) => console.warn('Auto-propose failed:', err));
        }

        if (typeof proposal.actionApi?.endpoint === 'string' && proposal.actionApi.endpoint.includes('/incidents')) {
          // Auto-calculate plan for incident if not already generated, and kick off narrative agent
          const planBody = editsToSend ? { edits: editsToSend } : {};
          await fetch(`/api/v1/incidents/${createdId}/plan`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': crypto.randomUUID(),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(planBody),
          }).catch((err) => console.warn('Auto-plan calculation failed:', err));

          fetch(`/api/v1/incidents/${createdId}/plan/agent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': crypto.randomUUID(),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }).catch(() => {});
        }

        window.dispatchEvent(new CustomEvent('doorare:incident-created', { detail: { id: createdId } }));
      }
      setIsDuplicateConflict(false);
      setDecided('approved');
      onActionComplete('approved', `ดำเนินการสำเร็จ: ${proposal.title}`, { id: createdId, requestNo });
    } catch (err: any) {
      const msg = err.message || 'เกิดข้อผิดพลาดในการดำเนินการ';
      setErrorMsg(msg);
      const isConflict = msg.includes('ยังไม่ปิด') || msg.includes('CONFLICT') || msg.includes('409');
      if (isConflict) {
        setIsDuplicateConflict(true);
      } else {
        onActionComplete('failed', `ดำเนินการไม่สำเร็จ: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    setDecided('declined');
    onActionComplete('declined', `ปฏิเสธข้อเสนอ: ${proposal.title}`);
  };

  const handleOpenProposal = () => {
    const targetIdentifier = createdEntity?.requestNo || createdEntity?.id;
    const isBorrow =
      proposal.type === 'CREATE_BORROW_REQUEST' ||
      proposal.type === 'UPDATE_BORROW_REQUEST' ||
      proposal.actionApi?.endpoint?.includes('/borrow-requests');

    if (isBorrow) {
      const targetUrl = targetIdentifier
        ? `?page=requests&request=${encodeURIComponent(targetIdentifier)}`
        : '?page=requests';

      if (onNavigateProposal) {
        onNavigateProposal(targetUrl, targetIdentifier);
      } else if (window.location.search.includes('page=requests')) {
        if (targetIdentifier) {
          window.history.pushState(null, '', targetUrl);
          window.dispatchEvent(
            new CustomEvent('doorare:open-borrow-request', {
              detail: { id: targetIdentifier, requestNo: createdEntity?.requestNo },
            }),
          );
        }
      } else {
        window.location.href = targetUrl;
      }
      return;
    }

    if (proposal.actionApi?.endpoint?.includes('/incidents') || proposal.type?.includes('INCIDENT')) {
      const incId = createdEntity?.id || proposal.targetId;
      const targetUrl = incId ? `?page=incident&id=${encodeURIComponent(incId)}` : '?page=incident';
      if (onNavigateProposal) {
        onNavigateProposal(targetUrl, incId);
      } else if (window.location.search.includes('page=incident')) {
        if (incId) {
          window.history.pushState(null, '', targetUrl);
          window.dispatchEvent(
            new CustomEvent('doorare:open-incident', {
              detail: { id: incId },
            }),
          );
        }
      } else {
        window.location.href = targetUrl;
      }
      return;
    }

    if (proposal.actionApi?.endpoint?.includes('/pool')) {
      window.location.href = '?page=pool';
      return;
    }
    if (proposal.actionApi?.endpoint?.includes('/stock-alerts')) {
      window.location.href = '?page=alerts';
      return;
    }
  };

  const s = proposal.summary || {};
  const payload = proposal.actionApi?.payload || {};

  const isEmergency =
    proposal.type === 'DECLARE_INCIDENT' ||
    proposal.type === 'UPDATE_INCIDENT' ||
    proposal.type === 'DISPATCH_EMERGENCY_KITS' ||
    proposal.type === 'REQUEST_URGENT_ANTIDOTE' ||
    Boolean(proposal.actionApi?.endpoint?.includes('/incidents'));

  const isUpdate =
    proposal.type === 'UPDATE_BORROW_REQUEST' ||
    proposal.type === 'UPDATE_INCIDENT';

  const rawCounts = (s.triageCounts || s.counts || s.patientCounts || payload.counts || payload.patientCounts || {}) as Record<string, any>;
  const redCount = Number(s.triage_red ?? s.redCasualties ?? s.red ?? rawCounts.RED ?? rawCounts.red ?? 0);
  const yellowCount = Number(s.triage_yellow ?? s.yellowCasualties ?? s.yellow ?? rawCounts.YELLOW ?? rawCounts.yellow ?? 0);
  const greenCount = Number(s.triage_green ?? s.greenCasualties ?? s.green ?? rawCounts.GREEN ?? rawCounts.green ?? 0);
  const blackCount = Number(s.triage_black ?? s.blackCasualties ?? s.black ?? rawCounts.BLACK ?? rawCounts.black ?? 0);
  const totalCasualties = Number(s.total_casualties ?? s.totalCasualties ?? (redCount + yellowCount + greenCount + blackCount));
  const hasCasualties = totalCasualties > 0 || redCount > 0 || yellowCount > 0 || greenCount > 0;

  const incidentType = (s.incident_type || s.incidentType || s.eventType || payload.incidentType || payload.eventType || 'อุบัติเหตุหมู่ (MASS CASUALTY)') as string;
  const location = (s.location || s.locationText || payload.locationText || payload.location || 'ห้องฉุกเฉิน (ER Triage)') as string;

  const rawKits = (s.recommended_kits || s.recommendedKits || s.kits || []) as any[];
  const recommendedKits = Array.isArray(rawKits) ? rawKits : [];
  const rawAntidotes = (s.recommended_antidotes || s.recommendedAntidotes || s.antidotes || []) as any[];
  const recommendedAntidotes = Array.isArray(rawAntidotes) ? rawAntidotes : [];
  const actionPlan = (s.action_plan || s.actionPlan || s.plan || '') as string;

  const drug = (s.drug_name || s.drug || s.item_code || s.itemCode || s.name || payload.drugMasterId || proposal.title) as string | undefined;
  const qty = (s.quantity ?? s.qty ?? s.qtyRequested ?? s.required_qty ?? s.lendable_qty ?? payload.qtyRequested ?? payload.quantity) as number | string | undefined;
  const unit = (s.unit || 'ชุด') as string;
  const lender = (s.lender_hospital_name || s.candidate_lender || s.lender || s.hospital_name || s.hospital || 'คลังยาเครือข่ายที่จัดสรรอัตโนมัติ') as string;
  const urgencyRaw = (s.urgency || payload.urgency || (isEmergency ? 'VERY_URGENT' : 'URGENT')) as string;
  const eta = (s.transit_minutes || s.eta_minutes || s.eta || 30) as number | string;
  const deliveryMethod = (s.delivery_method || (urgencyRaw === 'VERY_URGENT' ? 'รถพยาบาลฉุกเฉิน (EMS Dispatch)' : 'หน่วยขนส่งเวชภัณฑ์เครือข่าย')) as string;
  const reason = (s.reason || proposal.description || (isEmergency ? 'เพื่อรองรับผู้ป่วยอุบัติเหตุฉุกเฉินและจัดสรรเวชภัณฑ์ช่วยชีวิต' : 'เพื่อสำรองยาเร่งด่วนสำหรับผู้ป่วยและรักษาระดับสต็อกปลอดภัยของโรงพยาบาล')) as string;

  let urgencyLabel = 'ด่วน (URGENT)';
  let urgencyClass = 'urgent';
  if (urgencyRaw === 'VERY_URGENT' || urgencyRaw === 'ด่วนมาก' || urgencyRaw === 'ด่วนที่สุด' || urgencyRaw === 'EMERGENCY') {
    urgencyLabel = isEmergency ? 'ระดับวิกฤตฉุกเฉิน (CRITICAL EMERGENCY)' : 'ด่วนมาก (VERY_URGENT)';
    urgencyClass = 'very-urgent';
  } else if (urgencyRaw === 'ROUTINE' || urgencyRaw === 'ปกติ') {
    urgencyLabel = 'ปกติ (ROUTINE)';
    urgencyClass = 'routine';
  }

  if (decided) {
    return (
      <div className={`doorare-chat-proposal-card formal decided-${decided} ${isEmergency ? 'emergency' : ''}`}>
        <div className="doorare-decided-header">
          <div className={`doorare-decided-icon ${decided} ${isEmergency ? 'emergency' : ''}`}>
            {decided === 'approved' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </div>
          <div className="doorare-decided-text-wrap">
            <div className={`doorare-decided-title ${decided}`}>
              {decided === 'approved'
                ? isEmergency
                  ? (proposal.type === 'UPDATE_INCIDENT' ? 'อัปเดตข้อมูลเหตุฉุกเฉินเรียบร้อยแล้ว (Incident Updated)' : 'อนุมัติเปิดเหตุฉุกเฉินและเริ่มแผนเวชภัณฑ์แล้ว (Incident Declared)')
                  : (isUpdate ? 'แก้ไขคำขอยืมยาเรียบร้อยแล้ว (Request Updated)' : 'อนุมัติคำขอยืมยาเรียบร้อยแล้ว (Order Approved)')
                : isEmergency
                  ? 'ยกเลิกคำสั่งเหตุฉุกเฉินนี้แล้ว (Incident Cancelled)'
                  : 'ปฏิเสธคำขอยืมยานี้แล้ว (Order Declined)'}
            </div>
            <div className="doorare-decided-subtitle">
              {decided === 'approved'
                ? isEmergency
                  ? 'ระบบได้ส่งต่อคำสั่งเตรียมชุดยาฉุกเฉิน บันทึกข้อมูลคัดแยก Triage และบันทึก Audit Trail เรียบร้อยแล้ว'
                  : 'ระบบได้ส่งคำสั่งขอยืมยาเข้าระบบเครือข่าย MedSupply Link และบันทึก Audit Trail เรียบร้อยแล้ว'
                : 'คำขอนี้ถูกยกเลิก จะไม่มีการดำเนินคำสั่งในระบบเครือข่าย'}
            </div>
          </div>
        </div>

        {isEmergency ? (
          <div className="doorare-decided-summary-row">
            {hasCasualties && (
              <div className="doorare-decided-chip">
                <span className="doorare-decided-chip-k">ผู้ป่วย:</span>
                <span className="doorare-decided-chip-v highlight">
                  🔴 {redCount} · 🟡 {yellowCount} · 🟢 {greenCount} {blackCount > 0 ? `· ⚫ ${blackCount}` : ''} (รวม {totalCasualties} คน)
                </span>
              </div>
            )}
            <div className="doorare-decided-chip">
              <span className="doorare-decided-chip-k">ประเภท:</span>
              <span className="doorare-decided-chip-v">{incidentType}</span>
            </div>
            <div className="doorare-decided-chip">
              <span className="doorare-decided-chip-k">สถานที่:</span>
              <span className="doorare-decided-chip-v">{location}</span>
            </div>
          </div>
        ) : (
          <div className="doorare-decided-summary-row">
            <div className="doorare-decided-chip">
              <span className="doorare-decided-chip-k">รายการยา:</span>
              <span className="doorare-decided-chip-v">{drug || proposal.title}</span>
            </div>
            {qty !== undefined && (
              <div className="doorare-decided-chip">
                <span className="doorare-decided-chip-k">จำนวน:</span>
                <span className="doorare-decided-chip-v highlight">{String(qty)} {unit}</span>
              </div>
            )}
            {lender && (
              <div className="doorare-decided-chip">
                <span className="doorare-decided-chip-k">ผู้ให้ยืม:</span>
                <span className="doorare-decided-chip-v">{lender}</span>
              </div>
            )}
          </div>
        )}

        {decided === 'approved' && (
          <div className="doorare-decided-actions-row">
            <button
              type="button"
              className="doorare-proposal-open-page-btn"
              onClick={handleOpenProposal}
              title={isEmergency ? 'เปิดดูเหตุฉุกเฉินนี้ในหน้า Incident Console' : 'เปิดไปยังหน้ายืมยาและเปิดเอกสารคำขอนี้ทันที'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>
                {isEmergency
                  ? `เปิดดูเหตุฉุกเฉินนี้ใน Incident Console ${createdEntity?.id ? `(${String(createdEntity.id).slice(0, 8)})` : ''}`
                  : `เปิดดูคำขอยืมนี้ในหน้ารายการ ${createdEntity?.requestNo ? `(${createdEntity.requestNo})` : ''}`}
              </span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`doorare-chat-proposal-card formal ${isEmergency ? 'emergency' : ''}`}>
      {/* Top Banner */}
      <div className="doorare-proposal-header-formal">
        <div className="doorare-proposal-header-top-row">
          <div className={`doorare-proposal-meta-tag ${isEmergency ? 'emergency' : ''}`}>
            <div className="doorare-proposal-icon-box">
              {isEmergency ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              )}
            </div>
            <span className={`doorare-proposal-meta-title ${isEmergency ? 'emergency' : ''}`}>
              {isEmergency
                ? (proposal.type === 'UPDATE_INCIDENT' ? 'ใบสั่งการแก้ไขข้อมูลเหตุฉุกเฉิน' : 'ใบสั่งการเหตุฉุกเฉินและแผนเวชภัณฑ์')
                : (isUpdate ? 'ใบเสนอขอแก้ไขคำขอยืมยา' : 'ใบเสนอคำขอยืมยาทางการแพทย์')}
            </span>
          </div>
          <span className={`doorare-proposal-status-chip ${isEmergency ? 'emergency' : 'pending'}`}>
            {isEmergency ? 'รออนุมัติสั่งการ (Emergency)' : (isUpdate ? 'รออนุมัติแก้ไข (Pending)' : 'รออนุมัติ (Pending)')}
          </span>
        </div>
        <div className="doorare-proposal-main-title">{proposal.title}</div>
      </div>

      {/* Emergency Triage Casualty Bar */}
      {isEmergency && hasCasualties && (
        <div className="doorare-emergency-triage-bar">
          <div className="doorare-triage-badge red">
            <span className="label">🔴 สีแดง:</span>
            <span className="count">{redCount} ราย</span>
          </div>
          <div className="doorare-triage-badge yellow">
            <span className="label">🟡 สีเหลือง:</span>
            <span className="count">{yellowCount} ราย</span>
          </div>
          <div className="doorare-triage-badge green">
            <span className="label">🟢 สีเขียว:</span>
            <span className="count">{greenCount} ราย</span>
          </div>
          {blackCount > 0 && (
            <div className="doorare-triage-badge black">
              <span className="label">⚫ สีดำ:</span>
              <span className="count">{blackCount} ราย</span>
            </div>
          )}
          <div className="doorare-triage-badge total">
            <span className="label">รวมผู้ป่วย:</span>
            <span className="count">{totalCasualties} คน</span>
          </div>
        </div>
      )}

      {/* Structured Clinical Specification Grid */}
      <div className="doorare-proposal-spec-grid">
        {isEmergency ? (
          <>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">ประเภทเหตุการณ์</div>
              <div className="doorare-spec-value drug-name">{incidentType}</div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">จุดเกิดเหตุ / นำส่ง</div>
              <div className="doorare-spec-value">{location}</div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">ประมาณการเวลาถึง รพ. (ETA)</div>
              <div className="doorare-spec-value">~{String(eta)} นาที</div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">ระดับความเร่งด่วน</div>
              <div className="doorare-spec-value">
                <span className={`doorare-urgency-pill ${urgencyClass}`}>
                  {urgencyLabel}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">รายการยา & รูปแบบ</div>
              <div className="doorare-spec-value drug-name" title={drug || proposal.title}>
                {drug || proposal.title}
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">{isUpdate ? 'จำนวนใหม่ที่แก้ไข' : 'จำนวนที่ขอยืม'}</div>
              <div className="doorare-spec-value qty-val">
                {qty !== undefined ? String(qty) : '-'} <span className="doorare-unit-sub">{unit}</span>
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">โรงพยาบาลผู้ให้ยืม</div>
              <div className="doorare-spec-value lender-name">{lender}</div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">ระดับความเร่งด่วน</div>
              <div className="doorare-spec-value">
                <span className={`doorare-urgency-pill ${urgencyClass}`}>
                  {urgencyLabel}
                </span>
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">เวลาขนส่งโดยประมาณ</div>
              <div className="doorare-spec-value">
                ~{String(eta)} นาที
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">ช่องทางขนส่งเวชภัณฑ์</div>
              <div className="doorare-spec-value">{deliveryMethod}</div>
            </div>
          </>
        )}
      </div>

      {/* Planned Stocks & Kits Supply Plan (for Emergency) */}
      {isEmergency && (recommendedKits.length > 0 || recommendedAntidotes.length > 0) && (
        <div className="doorare-emergency-supplies-box">
          <div className="doorare-supplies-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span>แผนจัดสรรชุดยาและเวชภัณฑ์ฉุกเฉิน (Emergency Stock & Kit Plan)</span>
          </div>
          {recommendedKits.length > 0 && (
            <div className="doorare-supplies-group">
              <div className="doorare-supplies-group-header">ชุดเวชภัณฑ์และชุดช่วยชีวิต (Kits):</div>
              <div className="doorare-supplies-chips">
                {recommendedKits.map((k: any, idx: number) => (
                  <div key={idx} className="doorare-supply-chip kit">
                    <span className="name">{k.kitName || k.name || k.kitCode || k.code}</span>
                    <span className="qty">× {k.estimatedQuantity ?? k.qty ?? 1} ชุด</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recommendedAntidotes.length > 0 && (
            <div className="doorare-supplies-group">
              <div className="doorare-supplies-group-header">เซรุ่มและยาแก้พิษเฉพาะทาง (Critical Antidotes / Medications):</div>
              <div className="doorare-supplies-chips">
                {recommendedAntidotes.map((a: any, idx: number) => (
                  <div key={idx} className="doorare-supply-chip antidote">
                    <span className="name">{a.antidoteName || a.name}</span>
                    <span className="qty">× {a.qty ?? a.availableQuantity ?? 1} {a.unit || 'vials'}</span>
                    {(a.hospitalName || a.hospital) && (
                      <span className="source">({a.hospitalName || a.hospital})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Plan / Next Steps */}
      {isEmergency && actionPlan && (
        <div className="doorare-emergency-action-plan">
          <div className="doorare-action-plan-title">แผนการดำเนินงานทันที (Immediate Action Plan)</div>
          <div className="doorare-action-plan-text">{actionPlan}</div>
        </div>
      )}

      {/* Clinical Rationale Box */}
      <div className="doorare-proposal-rationale-box">
        <div className="doorare-rationale-title">เหตุผลความจำเป็นทางคลินิก (Clinical Rationale)</div>
        <div className="doorare-rationale-text">{reason}</div>
      </div>

      {/* Safety & Compliance Verification Strip */}
      <div className="doorare-proposal-audit-strip">
        <div className="doorare-audit-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>ตรวจสอบสต็อกเครือข่ายแล้ว</span>
        </div>
        <div className="doorare-audit-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>คู่สัญญา รพ. ได้รับการรับรอง</span>
        </div>
        <div className="doorare-audit-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>บันทึก Audit Trail อัตโนมัติ</span>
        </div>
      </div>

      {/* Collapsible Raw JSON Data */}
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          className="doorare-proposal-details-toggle"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        >
          {showTechnicalDetails ? '▴ ซ่อนข้อมูลทางเทคนิค (JSON)' : '▾ ดูข้อมูลทางเทคนิค (JSON)'}
        </button>
      </div>

      {showTechnicalDetails && (
        <pre className="doorare-proposal-raw-json">
          <code>{JSON.stringify(proposal, null, 2)}</code>
        </pre>
      )}

      {isDuplicateConflict ? (
        <div className="doorare-proposal-conflict-banner">
          <div className="doorare-conflict-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="doorare-conflict-title">ตรวจพบคำขอยืมเดิมที่ยังไม่ปิดในระบบ</span>
          </div>
          <div className="doorare-conflict-desc">{errorMsg}</div>
          <div className="doorare-conflict-hint">
            ระบบตรวจพบคำขอยืมสำหรับยานี้ที่ยังดำเนินการอยู่ หากท่านต้องการสร้างคำขอยืมเพิ่มเติม กรุณากดยืนยันเพื่อส่งคำขอซ้ำอีกครั้ง
          </div>
        </div>
      ) : errorMsg ? (
        <div className="doorare-proposal-error-banner">
          {errorMsg}
        </div>
      ) : null}

      {/* Formal Action Buttons */}
      <div className="doorare-proposal-formal-actions">
        {isDuplicateConflict ? (
          <button
            type="button"
            className="doorare-formal-btn-approve force-confirm"
            onClick={() => handleApprove(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="doorare-tool-spinner" style={{ width: 14, height: 14 }} />
                <span>กำลังยืนยันส่งคำขอซ้ำ...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>ยืนยันส่งคำขอซ้ำอีกครั้ง (Confirm & Send Again)</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="doorare-formal-btn-approve"
            onClick={() => handleApprove(false)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="doorare-tool-spinner" style={{ width: 14, height: 14 }} />
                <span>กำลังส่งคำสั่งเข้าระบบ...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>ยืนยันอนุมัติคำขอยืม (Authorize & Approve)</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className="doorare-formal-btn-decline"
          onClick={handleDecline}
          disabled={loading}
        >
          <span>ปฏิเสธคำขอ (Decline)</span>
        </button>
      </div>
    </div>
  );
};

export const DooRareChatDrawer: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const [input, setInput] = useState('');
  const [displayMessages, setDisplayMessages] = useState<DisplayChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 2 * 1024 * 1024) {
      alert('ไฟล์มีขนาดใหญ่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setAttachedFile({
        name: file.name,
        size: file.size,
        content: text.slice(0, 50000),
      });
    };
    reader.readAsText(file);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAtBottomRef = useRef<boolean>(true);

  // Auto-grow textarea based on input content (up to 140px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(140, Math.max(42, textareaRef.current.scrollHeight))}px`;
    }
  }, [input]);

  // Track user scroll position so streaming does not yank viewport if user scrolled up
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
  };

  useEffect(() => {
    if (isAtBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [displayMessages, activeTool, proposals]);

  // Role and User-partitioned scope key for chat session isolation
  const userScope = user?.id ? `${user.role || 'USER'}_${user.id}` : user?.role || null;

  // Load active sessions (and auto-purge >24h) when drawer opens or user changes
  useEffect(() => {
    if (isOpen) {
      setSessions(loadSessions(userScope));
    }
  }, [isOpen, userScope]);

  // Persist session to 24h store
  const persistCurrentSession = (
    currentMessages: DisplayChatMessage[],
    currentProposals: any[],
    firstPrompt?: string,
  ) => {
    if (currentMessages.length === 0) return;
    const now = Date.now();
    const id = activeSessionIdRef.current || `sess_${now}`;
    if (!activeSessionIdRef.current) {
      activeSessionIdRef.current = id;
      setActiveSessionId(id);
    }

    const titleText =
      firstPrompt ||
      currentMessages.find((m) => m.role === 'user')?.content ||
      'บทสนทนาใหม่';
    const trimmedTitle =
      titleText.length > 36 ? `${titleText.slice(0, 36)}...` : titleText;

    const existingSession = sessions.find((s) => s.id === id);
    const sessionObj: ChatSession = {
      id,
      title: existingSession?.title || trimmedTitle,
      createdAt: existingSession?.createdAt || now,
      updatedAt: now,
      messages: currentMessages,
      proposals: currentProposals,
    };

    saveSession(sessionObj, userScope);
    setSessions(loadSessions(userScope));
  };

  // Session Actions
  const handleNewChat = () => {
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setDisplayMessages([]);
    setProposals([]);
    setActiveTool(null);
    setInput('');
    setShowSessionsDrawer(false);
  };

  const handleSelectSession = (session: ChatSession) => {
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    setDisplayMessages(session.messages || []);
    setProposals(session.proposals || []);
    setActiveTool(null);
    setShowSessionsDrawer(false);
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id, userScope);
    const updated = loadSessions(userScope);
    setSessions(updated);
    if (activeSessionId === id) {
      handleNewChat();
    }
  };

  const handleClearAll = () => {
    if (window.confirm('คุณต้องการล้างประวัติการสนทนาทั้งหมด (ภายใน 30 วัน) หรือไม่?')) {
      clearAllSessions(userScope);
      setSessions([]);
      handleNewChat();
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    // Strip leading attachment text if present
    const cleanText = text.replace(/^📎\s*\[[^\]]+\]\n?/, '').trim();
    navigator.clipboard.writeText(cleanText || text);
    setCopiedMsgId(msgId);
    setTimeout(() => {
      setCopiedMsgId((cur) => (cur === msgId ? null : cur));
    }, 2000);
  };

  const handleStartEdit = (msgId: string, currentContent: string) => {
    if (isStreaming) return;
    setEditingMsgId(msgId);
    const cleanText = currentContent.replace(/^📎\s*\[[^\]]+\]\n?/, '').trim();
    setEditText(cleanText || currentContent);
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditText('');
  };

  const handleSaveEdit = (msgId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed || isStreaming) return;
    const msgIndex = displayMessages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    // Cascade delete: all messages under the edited prompt are deleted
    const baseMessages = displayMessages.slice(0, msgIndex);
    setEditingMsgId(null);
    setEditText('');
    handleSend(trimmed, baseMessages);
  };

  const handleDeleteMessageCascade = (msgId: string) => {
    if (isStreaming) return;
    const msgIndex = displayMessages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    // Cascade delete: delete this prompt and all messages under it
    const updated = displayMessages.slice(0, msgIndex);
    setDisplayMessages(updated);

    if (activeSessionIdRef.current) {
      const curSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (curSession) {
        saveSession({ ...curSession, messages: updated, updatedAt: Date.now() }, userScope);
      }
    }
  };

  const handleRetry = (asstMsgId: string) => {
    if (isStreaming) return;
    const asstIndex = displayMessages.findIndex((m) => m.id === asstMsgId);
    if (asstIndex === -1) return;

    // Find the user message immediately preceding this assistant response
    let userIndex = -1;
    for (let i = asstIndex - 1; i >= 0; i--) {
      if (displayMessages[i].role === 'user') {
        userIndex = i;
        break;
      }
    }
    if (userIndex === -1) return;

    const retryPrompt = displayMessages[userIndex].content;
    const baseMessages = displayMessages.slice(0, userIndex);
    handleSend(retryPrompt, baseMessages);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setActiveTool(null);
  };

  // Handle drawer close / minimize
  const handleClose = () => {
    if (isFullScreen) {
      // In fullscreen mode, quit button acts as minimize to the mini card version
      setIsFullScreen(false);
    } else {
      // In mini card mode, quit button minimizes down to the floating launcher button
      setIsOpen(false);
    }
  };

  const handleNavigateProposal = (targetUrl: string, targetId?: string) => {
    if (isFullScreen) {
      setIsFullScreen(false);
    }
    setIsOpen(false);

    if (window.location.search.includes('page=requests')) {
      window.history.pushState(null, '', targetUrl);
      if (targetId) {
        window.dispatchEvent(
          new CustomEvent('doorare:open-borrow-request', { detail: { id: targetId } }),
        );
      }
    } else {
      window.location.href = targetUrl;
    }
  };

  // Context Auto-Injector: Extracts current window location, title, and query active ID
  const getRouteContext = (): RouteContext => {
    const params = new URLSearchParams(window.location.search);
    const activeId =
      params.get('id') ||
      params.get('incident') ||
      params.get('incidentId') ||
      params.get('request_id') ||
      params.get('plan_id') ||
      undefined;
    return {
      currentPath: window.location.pathname + window.location.search,
      pageTitle: document.title,
      hospitalId: user?.hospitalId || null,
      activeId,
      webSearchEnabled,
    };
  };

  const handleSend = async (textToSend?: string, customBaseMessages?: DisplayChatMessage[]) => {
    const rawPrompt = (textToSend || input).trim();
    if (!rawPrompt && !attachedFile) return;
    if (isStreaming) return;

    const prompt = rawPrompt;
    let fullPrompt = rawPrompt;
    let displayPrompt = rawPrompt;
    if (attachedFile) {
      fullPrompt = `[เอกสารแนบอ้างอิง: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${rawPrompt || 'ช่วยวิเคราะห์ข้อมูลจากไฟล์ที่แนบมานี้'}`;
      displayPrompt = `📎 [${attachedFile.name}]\n${rawPrompt || 'ช่วยวิเคราะห์ข้อมูลจากไฟล์ที่แนบมานี้'}`;
      setAttachedFile(null);
    }

    setInput('');
    const userMsg: DisplayChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: displayPrompt,
    };
    const assistantMsgId = `msg_asst_${Date.now()}`;
    const assistantPlaceholder: DisplayChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      isThinking: false,
      toolLogs: [],
    };

    const baseList = customBaseMessages ?? displayMessages;
    setDisplayMessages([...baseList, userMsg, assistantPlaceholder]);

    setIsStreaming(true);
    setActiveTool(null);

    // One controller per turn: the stop button and closing the drawer abort this request (SSE read + server ReAct loop).
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // API messages payload for the backend
    const apiMessages: ChatMessage[] = [
      ...baseList
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: fullPrompt },
    ];

    let assistantText = '';

    try {
      await streamAiChat(
        apiMessages,
        getRouteContext(),
        {
          onStatus: (_st) => {
            // Status update
          },
          onThought: (thoughtText) => {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      thought: (m.thought || '') + thoughtText,
                      isThinking: true,
                    }
                  : m,
              ),
            );
          },
          onToolStart: (tool) => {
            if (tool.name === 'ask_operator') {
              return;
            }
            const newLog: ToolLogEntry = {
              id: tool.id || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: tool.name,
              args: tool.args,
              status: 'running',
              startTime: Date.now(),
            };
            setActiveTool(`กำลังดำเนินการ: ${formatToolPurpose(tool.name)}...`);
            setDisplayMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantMsgId) {
                  const existingLogs = m.toolLogs || [];
                  if (existingLogs.some((l) => l.id === newLog.id)) return m;
                  return { ...m, toolLogs: [...existingLogs, newLog] };
                }
                return m;
              }),
            );
          },
          onToolEnd: (res) => {
            if (res.name === 'ask_operator') {
              setActiveTool(null);
              return;
            }
            setActiveTool(null);
            setDisplayMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantMsgId && m.toolLogs) {
                  const logs = m.toolLogs.map((log) => {
                    if (log.status === 'running' && (log.id === res.id || log.name === res.name || !res.id)) {
                      return {
                        ...log,
                        status:
                          res.success === false
                            ? res.needsInput
                              ? ('needs_input' as const)
                              : ('failed' as const)
                            : ('completed' as const),
                        result: res.data,
                        error: res.error,
                        durationMs: Date.now() - log.startTime,
                      };
                    }
                    return log;
                  });
                  return { ...m, toolLogs: logs };
                }
                return m;
              }),
            );
          },
          onToken: (token) => {
            assistantText += token;
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: assistantText, isThinking: false }
                  : m,
              ),
            );
          },
          onProposal: (proposal) => {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, proposal, proposalStatus: 'pending', isThinking: false }
                  : m,
              ),
            );
          },
          onQuestion: (questions) => {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, questions, isThinking: false } : m,
              ),
            );
          },
          onError: (errMsg) => {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      isThinking: false,
                      content: m.content
                        ? `${m.content}\n\n[เกิดข้อผิดพลาด]: ${errMsg}`
                        : `[เกิดข้อผิดพลาด]: ${errMsg}`,
                    }
                  : m,
              ),
            );
          },
          onDone: () => {
            setIsStreaming(false);
            setActiveTool(null);
            setDisplayMessages((prev) => {
              const updated = prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isThinking: false } : m,
              );
              persistCurrentSession(updated, proposals, prompt);
              return updated;
            });
          },
        },
        controller.signal,
      );
    } catch (e: any) {
      if (controller.signal.aborted) {
        // The operator stopped the answer (or closed the drawer): keep the partial text, it is not an error.
        setDisplayMessages((prev) => {
          const updated = prev.map((m) => (m.id === assistantMsgId ? { ...m, isThinking: false } : m));
          persistCurrentSession(updated, proposals, prompt);
          return updated;
        });
      } else {
        const errMsg = e?.message || 'เชื่อมต่อไม่สำเร็จ';
        setDisplayMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isThinking: false,
                  content: m.content
                    ? `${m.content}\n\n⚠️ ขออภัย เกิดข้อผิดพลาด: ${errMsg}`
                    : `⚠️ ขออภัย เกิดข้อผิดพลาด: ${errMsg}`,
                }
              : m,
          ),
        );
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setIsStreaming(false);
      setActiveTool(null);
    }
  };

  const handleQuickPrompt = (chipText: string) => {
    handleSend(chipText);
  };

  const starterCards = [
    ...(user?.role === 'ER_STAFF'
      ? [
          {
            icon: 'siren' as IconName,
            title: 'ตรวจสอบยาแก้พิษฉุกเฉิน',
            desc: 'ค้นหายาแก้พิษพร้อมใช้ในรัศมีขนส่ง 60 นาที',
            prompt: 'ตรวจสอบยาแก้พิษฉุกเฉิน (Antidote)',
          },
          {
            icon: 'box' as IconName,
            title: 'สรุปรายการของนอกเซ็ตอุบัติภัย',
            desc: 'จัดชุดยาและเวชภัณฑ์รับมืออุบัติเหตุกลุ่มชน',
            prompt: 'สรุปรายการของนอกเซ็ตอุบัติภัย',
          },
          {
            icon: 'truck' as IconName,
            title: 'ติดตามสถานะรถขนส่งด่วน',
            desc: 'ตรวจสอบพิกัดรถขนส่งและอุณหภูมิ Cold-Chain',
            prompt: 'ติดตามสถานะรถขนส่งด่วน',
          },
          {
            icon: 'layers' as IconName,
            title: 'ประเมินเกณฑ์ชุดยาฉุกเฉิน',
            desc: 'ตรวจสอบจำนวนชุดยาสำเร็จรูปในคลังฉุกเฉิน',
            prompt: 'ประเมินเกณฑ์ชุดยาฉุกเฉิน',
          },
        ]
      : [
          {
            icon: 'chart' as IconName,
            title: 'ตรวจสอบสต็อกยาใกล้ถึงจุด ROP',
            desc: 'วิเคราะห์ระดับสต็อกยาและบันไดคะแนน รพ. ให้ยืม',
            prompt: 'ตรวจสอบสต็อกยาใกล้ถึงจุด ROP',
          },
          {
            icon: 'hand' as IconName,
            title: 'ค้นหาแหล่งยืมยาใกล้ที่สุด',
            desc: 'ประเมินระยะทาง ค่า Si และปริมาณพร้อมให้ยืม',
            prompt: 'ค้นหา รพ. ที่มียาให้ยืมใกล้ที่สุด',
          },
          {
            icon: 'calx' as IconName,
            title: 'เช็คยาใกล้หมดอายุใน Pool',
            desc: 'ตรวจสอบลอตยาใกล้หมดอายุเพื่อวางแผนจัดสรร',
            prompt: 'เช็ครายการยาใกล้หมดอายุใน Pool',
          },
          {
            icon: 'inbox' as IconName,
            title: 'สรุปสถานะการยืมยาประจำวัน',
            desc: 'ดูภาพรวมคำขอยืมยาและการจัดส่งในเครือข่าย',
            prompt: 'คำนวณสรุปการยืมยาประจำวัน',
          },
        ]),
  ];

  return (
    <>
      {/* Floating Trigger Button (Hide when popup is open so it feels like a Messenger chat head) */}
      {!isOpen && (
        <button
          className="doorare-chat-trigger-btn"
          onClick={() => setIsOpen(true)}
          title="DooRare AI Copilot"
          aria-label="Open AI Copilot"
        >
          <span className="doorare-chat-pulse-badge" />
          <DooRareBotAvatar size={38} />
        </button>
      )}

      {/* Backdrop Overlay - Only active in Full Screen mode so normal popup does not block page */}
      {isFullScreen && (
        <div
          className={`doorare-chat-overlay ${isOpen ? 'open' : ''}`}
          onClick={handleClose}
        />
      )}

      {/* Messenger Floating Popup Window / Full Screen Container */}
      <div className={`doorare-chat-drawer ${isOpen ? 'open' : ''} ${isFullScreen ? 'fullscreen' : ''}`}>
        {/* Gemini-Inspired Mini Icon Rail when Fullscreen sidebar is collapsed */}
        {isFullScreen && isSidebarCollapsed && (
          <aside className="doorare-chat-mini-rail">
            <div className="doorare-mini-rail-top">
              <button
                type="button"
                className="doorare-mini-rail-btn brand"
                onClick={() => setIsSidebarCollapsed(false)}
                title="เปิดแถบด้านข้าง (Expand sidebar)"
              >
                <DooRareBotAvatar size={26} />
              </button>
              <button
                type="button"
                className="doorare-mini-rail-btn"
                onClick={handleNewChat}
                title="แชทใหม่ (New chat)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                type="button"
                className="doorare-mini-rail-btn"
                onClick={() => setIsSidebarCollapsed(false)}
                title="ประวัติการสนทนา (30 วัน)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            </div>
            <div className="doorare-mini-rail-bottom">
              <div
                className="doorare-mini-rail-avatar"
                title={`${user?.name || user?.roleTh || 'ผู้ใช้งาน'} • ${user?.hospitalName || 'DooRare'}`}
              >
                {(user?.name || user?.role || 'U')[0].toUpperCase()}
              </div>
            </div>
          </aside>
        )}

        {/* Previous Sessions Sidebar (Visible in Fullscreen OR when showSessionsDrawer is toggled in Drawer mode) */}
        {((isFullScreen && !isSidebarCollapsed) || (!isFullScreen && showSessionsDrawer)) && (
          <aside className={`doorare-chat-sidebar ${showSessionsDrawer && !isFullScreen ? 'drawer-overlay' : ''}`}>
            {/* Top Brand & Collapse Row */}
            <div className="doorare-chat-sidebar-top-bar">
              <div className="doorare-sidebar-brand">
                <DooRareBotAvatar size={24} />
                <span className="doorare-sidebar-brand-name">DooRare AI</span>
              </div>
              <button
                type="button"
                className="doorare-sidebar-toggle-btn"
                onClick={() => {
                  if (isFullScreen) {
                    setIsSidebarCollapsed(true);
                  } else {
                    setShowSessionsDrawer(false);
                  }
                }}
                title="ซ่อนแถบด้านข้าง (Collapse)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            </div>

            {/* New Chat Pill Button (Gemini-style) */}
            <div className="doorare-chat-sidebar-action-wrap">
              <button
                type="button"
                className="doorare-chat-new-chat-pill"
                onClick={handleNewChat}
                title="เริ่มการสนทนาใหม่"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>แชทใหม่</span>
              </button>
            </div>

            {/* Categorized Sessions Header with Clear button */}
            <div className="doorare-chat-sidebar-section-header">
              <span className="doorare-chat-sidebar-title-text">ประวัติการสนทนา</span>
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="doorare-chat-clear-history-btn"
                  onClick={handleClearAll}
                  title="ล้างประวัติการสนทนาทั้งหมด"
                >
                  ล้างทั้งหมด
                </button>
              )}
            </div>

            {/* Categorized Session Groups: Today, Yesterday, Previous 7 Days, Under 30 Days */}
            <div className="doorare-chat-session-list">
              {sessions.length === 0 ? (
                <div className="doorare-chat-session-empty">
                  <span>ไม่มีประวัติการสนทนาในช่วง 30 วันที่ผ่านมา</span>
                </div>
              ) : (
                groupSessionsByDate(sessions).map((group) => (
                  <div key={group.id} className="doorare-chat-session-group">
                    <div className="doorare-chat-session-group-title">{group.title}</div>
                    {group.items.map((s) => (
                      <div
                        key={s.id}
                        className={`doorare-chat-session-item ${s.id === activeSessionId ? 'active' : ''}`}
                        onClick={() => handleSelectSession(s)}
                        title={s.title}
                      >
                        <div className="doorare-chat-session-name">
                          {s.title}
                        </div>
                        <button
                          type="button"
                          className="doorare-chat-session-del-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(s.id);
                          }}
                          title="ลบการสนทนานี้"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* User Profile Footer (Exactly like Gemini in Image 2) */}
            <div className="doorare-chat-sidebar-user-footer">
              <div className="doorare-user-footer-avatar">
                {(user?.name || user?.role || 'U')[0].toUpperCase()}
              </div>
              <div className="doorare-user-footer-info">
                <div className="doorare-user-footer-name">
                  {user?.name || user?.roleTh || 'ผู้ใช้งาน'}
                </div>
                <div className="doorare-user-footer-sub">
                  {user?.hospitalName || 'เขตสุขภาพที่ 6'}
                </div>
              </div>
              <div className="doorare-user-footer-retention" title="ระบบจัดเก็บประวัติการสนทนาย้อนหลัง 30 วัน">
                30 วัน
              </div>
            </div>
          </aside>
        )}

        {/* Main Chat Column */}
        <div className="doorare-chat-main-col">
          {/* Header */}
          <div
            className="doorare-chat-header"
            onDoubleClick={() => setIsFullScreen((prev) => !prev)}
            title="ดับเบิ้ลคลิกเพื่อสลับขนาดหน้าต่าง"
          >
            <div className="doorare-chat-title-group">
              {isFullScreen && isSidebarCollapsed && (
                <button
                  type="button"
                  className="doorare-sidebar-toggle-btn in-header"
                  onClick={() => setIsSidebarCollapsed(false)}
                  title="เปิดแถบด้านข้าง (Expand sidebar)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </button>
              )}

              {!isFullScreen && (
                <button
                  type="button"
                  className={`doorare-chat-sessions-toggle-btn ${showSessionsDrawer ? 'active' : ''}`}
                  onClick={() => setShowSessionsDrawer((prev) => !prev)}
                  title="ดูประวัติการสนทนา (30 วัน)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {sessions.length > 0 && (
                    <span className="doorare-sessions-badge">{sessions.length}</span>
                  )}
                </button>
              )}

              <div className="doorare-chat-avatar">
                <DooRareBotAvatar size={28} />
              </div>
              <div className="doorare-chat-title-text-wrap">
                <div className="doorare-chat-title">DooRare Copilot</div>
              </div>
            </div>

            <div className="doorare-chat-header-actions">
              {/* Expand to Full Screen button (ONLY shown in Mini Card mode) */}
              {!isFullScreen && (
                <button
                  type="button"
                  className="doorare-chat-header-action-btn icon"
                  onClick={() => {
                    setIsFullScreen(true);
                    setShowSessionsDrawer(false);
                  }}
                  title="ขยายเต็มหน้าจอ (Full Screen)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              )}

              {/* Quit button stays the same visually (✕), but acts as minimize in fullscreen */}
              <button
                type="button"
                className="doorare-chat-close-btn"
                onClick={handleClose}
                title={isFullScreen ? 'ย่อเป็นหน้าต่างการ์ด (Minimize to Card)' : 'ปิดหน้าต่าง (Close)'}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div
            ref={chatContainerRef}
            className="doorare-chat-messages"
            onScroll={handleScroll}
          >
            {displayMessages.length === 0 && (
              <div className="doorare-chat-empty-state">
                <div className="doorare-empty-greeting">
                  เราจะเริ่มจากตรงไหนก่อนดี
                </div>
                <div className="doorare-empty-subgreeting">
                  ระบบผู้ช่วยอัจฉริยะเพื่อการจัดสรรและกระจายยาฉุกเฉิน เขตสุขภาพที่ 6
                </div>

                <div className="doorare-starter-grid">
                  {starterCards.map((card, idx) => (
                    <div
                      key={idx}
                      className="doorare-starter-card"
                      onClick={() => handleQuickPrompt(card.prompt)}
                    >
                      <div className="doorare-starter-icon-wrap">
                        <Icon name={card.icon} style={{ width: 18, height: 18 }} />
                      </div>
                      <div className="doorare-starter-content">
                        <div className="doorare-starter-title">{card.title}</div>
                        <div className="doorare-starter-desc">{card.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {displayMessages.map((msg) => (
              <div key={msg.id} className={`doorare-chat-msg-row ${msg.role}`}>
                <div className="doorare-msg-row-inner">
                  {msg.role === 'assistant' && (
                    <div className="doorare-msg-avatar">
                      <DooRareBotAvatar size={28} />
                    </div>
                  )}

                  <div className="doorare-msg-content-col">
                    {/* Harness Thinking / Chain-of-Thought Accordion - ONLY rendered when model generates thinking content */}
                    {msg.role === 'assistant' && Boolean(msg.thought && msg.thought.trim().length > 0) && (
                      <ThinkingAccordion
                        thought={msg.thought || ''}
                        isThinking={Boolean(msg.isThinking && isStreaming)}
                      />
                    )}

                    {/* Harness Tool Logs above assistant bubble (ask_operator is rendered strictly in ClarifyPanel below) */}
                    {msg.toolLogs &&
                      msg.toolLogs.filter((tool) => tool.name !== 'ask_operator').length > 0 && (
                      <div className="doorare-chat-tools-container">
                        {msg.toolLogs
                          .filter((tool) => tool.name !== 'ask_operator')
                          .map((tool) => (
                            <ToolExecutionLogCard key={tool.id} tool={tool} />
                          ))}
                      </div>
                    )}

                    {msg.role === 'user' && editingMsgId === msg.id ? (
                      <div className="doorare-chat-edit-wrapper">
                        <textarea
                          className="doorare-chat-edit-textarea"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(msg.id, editText);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                          rows={Math.max(2, Math.min(8, editText.split('\n').length))}
                        />
                        <div className="doorare-chat-edit-actions">
                          <button
                            type="button"
                            className="doorare-chat-edit-btn cancel"
                            onClick={handleCancelEdit}
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            className="doorare-chat-edit-btn submit"
                            onClick={() => handleSaveEdit(msg.id, editText)}
                            disabled={!editText.trim() || isStreaming}
                          >
                            ส่งใหม่
                          </button>
                        </div>
                      </div>
                    ) : msg.content ? (
                      <>
                        <div className={`doorare-chat-bubble ${msg.role}`}>
                          <MarkdownContent content={msg.content} />
                        </div>

                        {/* Action buttons on hover */}
                        {msg.role === 'user' && (
                          <div className="doorare-msg-action-bar user">
                            <button
                              type="button"
                              className="doorare-msg-action-btn"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              title="คัดลอกข้อความ (Copy)"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span style={{ color: '#16a34a' }}>คัดลอกแล้ว</span>
                                </>
                              ) : (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>คัดลอก</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="doorare-msg-action-btn"
                              onClick={() => handleStartEdit(msg.id, msg.content)}
                              title="แก้ไขข้อความ (Edit)"
                              disabled={isStreaming}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                              <span>แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              className="doorare-msg-action-btn delete"
                              onClick={() => handleDeleteMessageCascade(msg.id)}
                              title="ลบข้อความนี้และข้อความด้านล่างทั้งหมด (Delete)"
                              disabled={isStreaming}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              <span>ลบ</span>
                            </button>
                          </div>
                        )}

                        {msg.role === 'assistant' && (
                          <div className="doorare-msg-action-bar assistant">
                            <button
                              type="button"
                              className="doorare-msg-action-btn"
                              onClick={() => handleRetry(msg.id)}
                              title="ลองใหม่ / สร้างคำตอบใหม่ (Retry)"
                              disabled={isStreaming}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              <span>ลองใหม่</span>
                            </button>
                            <button
                              type="button"
                              className="doorare-msg-action-btn"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              title="คัดลอกคำตอบ (Copy)"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span style={{ color: '#16a34a' }}>คัดลอกแล้ว</span>
                                </>
                              ) : (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>คัดลอก</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : null}

                    {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (
                      <ClarifyPanel
                        questions={msg.questions}
                        disabled={isStreaming}
                        isAnswered={Boolean(msg.questionsAnswered)}
                        savedAnswers={msg.savedAnswers}
                        onSubmit={(answers) => {
                          setDisplayMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, questionsAnswered: true, savedAnswers: answers } : m,
                            ),
                          );
                          handleSend(`ตอบคำถาม: ${answers.map((a) => `${a.header}: ${a.answer}`).join(' | ')}`);
                        }}
                      />
                    )}

                    {msg.role === 'assistant' && msg.proposal && (
                      <ProposalCard
                        proposal={msg.proposal}
                        initialStatus={msg.proposalStatus}
                        targetId={msg.proposalTargetId}
                        targetRequestNo={msg.proposalRequestNo}
                        onActionComplete={(status, _text, data) => {
                          setDisplayMessages((prev) => {
                            const updated = prev.map((m) =>
                              m.id === msg.id
                                ? {
                                    ...m,
                                    proposalStatus: status,
                                    proposalTargetId: data?.id || m.proposalTargetId,
                                    proposalRequestNo: data?.requestNo || m.proposalRequestNo,
                                    proposal: m.proposal
                                      ? {
                                          ...m.proposal,
                                          status:
                                            status === 'approved'
                                              ? 'APPROVED'
                                              : status === 'declined'
                                                ? 'DECLINED'
                                                : m.proposal.status,
                                          targetId: data?.id || m.proposal.targetId,
                                          requestNo: data?.requestNo || m.proposal.requestNo,
                                        }
                                      : m.proposal,
                                  }
                                : m,
                            );
                            persistCurrentSession(updated, proposals);
                            return updated;
                          });
                        }}
                        onNavigateProposal={handleNavigateProposal}
                      />
                    )}

                    {msg.role === 'assistant' && msg.content && !isStreaming && (
                      <AnswerInsights content={msg.content} toolLogs={msg.toolLogs} onAsk={handleQuickPrompt} />
                    )}

                    {!msg.content && isStreaming && msg.role === 'assistant' && !msg.isThinking && !msg.thought ? (
                      <div className="doorare-typing-bubble" title="AI กำลังพิมพ์คำตอบ...">
                        <span className="doorare-typing-dot" />
                        <span className="doorare-typing-dot" />
                        <span className="doorare-typing-dot" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {/* Active Tool Indicator (Transient status pill) */}
            {activeTool && (
              <div className="doorare-chat-tool-indicator">
                <span className="doorare-tool-spinner" />
                <span>{activeTool}</span>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>

          {/* Input Area */}
          <div className="doorare-chat-input-area">
            <div className="doorare-input-capsule deepseek-style">
              {attachedFile && (
                <div className="doorare-attached-file-pill">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span className="doorare-file-name">{attachedFile.name}</span>
                  <span className="doorare-file-size">
                    ({attachedFile.size < 1024
                      ? `${attachedFile.size} B`
                      : attachedFile.size < 1024 * 1024
                        ? `${(attachedFile.size / 1024).toFixed(1)} KB`
                        : `${(attachedFile.size / (1024 * 1024)).toFixed(1)} MB`})
                  </span>
                  <button
                    type="button"
                    className="doorare-file-remove-btn"
                    onClick={() => setAttachedFile(null)}
                    title="ลบไฟล์แนบ"
                  >
                    ×
                  </button>
                </div>
              )}
              <textarea
                ref={textareaRef}
                className="doorare-input-textarea"
                placeholder="ถามข้อมูลยา สต็อก คำนวณเบิกยืม หรือขอให้ Copilot ช่วยดำเนินการ... (Shift+Enter เพื่อขึ้นบรรทัดใหม่)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                disabled={isStreaming}
              />
              <div className="doorare-input-bottom-bar deepseek-bar">
                {/* Left: Search pill (DeepSeek style) + hospital scope */}
                <div className="doorare-deepseek-left">
                  <button
                    type="button"
                    className={`doorare-deepseek-pill ${webSearchEnabled ? 'active' : ''}`}
                    onClick={() => setWebSearchEnabled((prev) => !prev)}
                    title={
                      webSearchEnabled
                        ? 'ค้นหาเว็บภายนอก: เปิดใช้งานอยู่ (คลิกเพื่อปิด)'
                        : 'ค้นหาเว็บภายนอก: ปิดอยู่ (คลิกเพื่อเปิด)'
                    }
                    disabled={isStreaming}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span>Search</span>
                  </button>

                  <div className="doorare-deepseek-scope" title={`สังกัด: ${user?.hospitalName || 'ส่วนกลาง เขตสุขภาพที่ 6'}`}>
                    <span className="doorare-badge-dot" />
                    <span className="doorare-scope-text">
                      {user?.hospitalName ? user.hospitalName : 'ส่วนกลาง เขตสุขภาพที่ 6'}
                    </span>
                  </div>
                </div>

                {/* Right: Paperclip attachment button + Circular Send button */}
                <div className="doorare-deepseek-right">
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    accept=".csv,.xlsx,.xls,.txt,.json,.md,.pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    className="doorare-deepseek-clip-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="แนบไฟล์อ้างอิง เช่น รายการสต็อก (CSV, Excel, TXT, JSON, PDF)"
                    disabled={isStreaming}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>

                  {isStreaming ? (
                    <button
                      type="button"
                      className="doorare-deepseek-send-btn streaming"
                      onClick={handleStopGeneration}
                      title="หยุดการตอบกลับ (Stop)"
                    >
                      <span className="doorare-deepseek-stop-square" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="doorare-deepseek-send-btn"
                      disabled={!input.trim() && !attachedFile}
                      onClick={() => handleSend()}
                      title="ส่งข้อความ (Enter)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5" />
                        <polyline points="5 12 12 5 19 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="doorare-chat-disclaimer">
              ระบบสนับสนุนการตัดสินใจทางคลินิก (CDSS) · ผู้ประกอบวิชาชีพต้องตรวจสอบความถูกต้องตามหลักวิชาการก่อนลงนามอนุมัติ
            </div>
          </div>
      </div>
    </div>
  </>
);
};
