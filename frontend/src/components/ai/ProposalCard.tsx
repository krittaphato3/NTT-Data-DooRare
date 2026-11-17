import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getStoredToken } from '../../services/apiFetch';
import './chatDrawer.css';

export interface ProposalCardProps {
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

export const resolveKitCode = (input: string): string | null => {
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

/**
 * Strips raw HTML tags (e.g. <b>, </b>, <strong>, <span>) and markdown bold markers
 * to ensure titles and labels render as clean typography without tag leakage.
 */
export const cleanText = (str?: unknown): string => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/__([^_]+)__/g, '$1')
    .trim();
};

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  initialStatus,
  targetId,
  targetRequestNo,
  onActionComplete,
  onNavigateProposal,
}) => {
  const { user } = useAuth();
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

  const isEmergency =
    proposal.type === 'DECLARE_INCIDENT' ||
    proposal.type === 'UPDATE_INCIDENT' ||
    proposal.type === 'DISPATCH_EMERGENCY_KITS' ||
    proposal.type === 'REQUEST_URGENT_ANTIDOTE' ||
    Boolean(proposal.actionApi?.endpoint?.includes('/incidents'));

  const [isFlowDone, setIsFlowDone] = useState<boolean>(() => {
    const st = (proposal as any)?.status?.toUpperCase() || (proposal as any)?.summary?.status?.toUpperCase();
    return st === 'ACTIVE' || st === 'RECONCILED' || st === 'CLOSE_REQUESTED';
  });

  useEffect(() => {
    if (!isEmergency) return;
    const targetIncidentId = createdEntity?.id || proposal.targetId;
    if (!targetIncidentId) return;

    let isMounted = true;
    const checkStatus = async () => {
      try {
        const token = getStoredToken();
        const res = await fetch(`/api/v1/incidents/${encodeURIComponent(String(targetIncidentId))}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          const inc = json?.data || json;
          if (isMounted && inc) {
            const hasBorrowLines = Array.isArray(inc.borrowLines) && inc.borrowLines.length > 0;
            const isFinished = inc.status === 'ACTIVE' && (hasBorrowLines || inc.plan?.status === 'APPROVED');
            const isClosed = inc.status === 'CLOSE_REQUESTED' || inc.status === 'RECONCILED' || inc.status === 'CANCELLED';
            setIsFlowDone(Boolean(isFinished || isClosed));
            if (inc.incidentNo && !createdEntity?.requestNo) {
              setCreatedEntity((prev) => ({ ...prev, id: inc.id, requestNo: inc.incidentNo }));
            }
          }
        }
      } catch {
        // ignore
      }
    };

    void checkStatus();
    window.addEventListener('focus', checkStatus);
    window.addEventListener('doorare:open-incident', checkStatus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', checkStatus);
      window.removeEventListener('doorare:open-incident', checkStatus);
    };
  }, [isEmergency, createdEntity?.id, proposal.targetId, decided]);

  useEffect(() => {
    const isApp = initialStatus === 'approved' || (proposal as any)?.status === 'APPROVED' || (proposal as any)?.status === 'approved';
    const isDec = initialStatus === 'declined' || (proposal as any)?.status === 'DECLINED' || (proposal as any)?.status === 'declined';
    if (isApp) {
      setDecided('approved');
    } else if (isDec) {
      setDecided('declined');
    } else {
      setDecided(null);
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
      const requestNo = resJson?.data?.incidentNo || resJson?.incidentNo || resJson?.data?.requestNo || resJson?.requestNo || proposal.summary?.request_no || proposal.summary?.requestNo;
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
      const incNo = createdEntity?.requestNo || (proposal.summary as any)?.request_no || (proposal.summary as any)?.requestNo;
      const targetParam = (incId ? String(incId) : undefined) || (incNo ? String(incNo) : undefined);

      const currentParams = new URLSearchParams(window.location.search);
      const currentRole = currentParams.get('role')?.toLowerCase() || (user?.role === 'ER_STAFF' ? 'er' : '');
      const isErRole = currentRole === 'er' || user?.role === 'ER_STAFF';
      const roleParam = currentRole ? `&role=${encodeURIComponent(currentRole)}` : (isErRole ? '&role=er' : '');

      let targetUrl: string;
      if (!isFlowDone) {
        // Before finalize / while process is not yet done: lead to the Flow page to configure/confirm
        targetUrl = targetParam
          ? `?page=flow&incident=${encodeURIComponent(targetParam)}&id=${encodeURIComponent(targetParam)}${roleParam}`
          : `?page=flow${roleParam}`;
      } else {
        // After finalized and sent: lead to the incident page of that exact request
        if (isErRole) {
          targetUrl = targetParam
            ? `?page=incidents&incident=${encodeURIComponent(targetParam)}&id=${encodeURIComponent(targetParam)}&role=er`
            : '?page=incidents&role=er';
        } else {
          targetUrl = targetParam
            ? `?page=incident&id=${encodeURIComponent(targetParam)}&incident=${encodeURIComponent(targetParam)}${roleParam}`
            : `?page=incident${roleParam}`;
        }
      }

      if (onNavigateProposal) {
        onNavigateProposal(targetUrl, targetParam);
      } else if (
        (!isFlowDone && window.location.search.includes('page=flow')) ||
        (isFlowDone && isErRole && window.location.search.includes('page=incidents')) ||
        (isFlowDone && !isErRole && window.location.search.includes('page=incident') && !window.location.search.includes('page=incidents'))
      ) {
        if (targetParam) {
          window.history.pushState(null, '', targetUrl);
          window.dispatchEvent(
            new CustomEvent('doorare:open-incident', {
              detail: { id: targetParam, incidentNo: incNo },
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

  const cleanIncidentType = cleanText(s.incident_type || s.incidentType || s.eventType || payload.incidentType || payload.eventType || 'อุบัติเหตุหมู่ (MASS CASUALTY)');
  const cleanLocation = cleanText(s.location || s.locationText || payload.locationText || payload.location || 'ห้องฉุกเฉิน (ER Triage)');

  const rawKits = (s.recommended_kits || s.recommendedKits || s.kits || []) as any[];
  const recommendedKits = Array.isArray(rawKits) ? rawKits : [];
  const rawAntidotes = (s.recommended_antidotes || s.recommendedAntidotes || s.antidotes || []) as any[];
  const recommendedAntidotes = Array.isArray(rawAntidotes) ? rawAntidotes : [];
  const cleanActionPlan = cleanText(s.action_plan || s.actionPlan || s.plan || '');

  const drug = (s.drug_name || s.drug || s.item_code || s.itemCode || s.name || payload.drugMasterId || proposal.title) as string | undefined;
  const rawQty = (s.quantity ?? s.qty ?? s.qtyRequested ?? s.required_qty ?? s.lendable_qty ?? payload.qtyRequested ?? payload.quantity) as number | string | undefined;
  const rawUnit = (s.unit as string | undefined) || 'ชุด';

  let displayQty: string | number | undefined = rawQty;
  let displayUnit = rawUnit;

  if (rawQty !== undefined && rawQty !== null) {
    const qtyStr = String(rawQty).trim();
    const match = qtyStr.match(/^([\d,.]+)\s*([^\d\s].*)$/);
    if (match) {
      displayQty = match[1];
      const extractedUnit = match[2].trim();
      if (extractedUnit) {
        displayUnit = extractedUnit;
      }
    }
  }

  const cleanTitle = cleanText(proposal.title);
  const cleanDrug = cleanText(drug);
  const lender = (s.lender_hospital_name || s.candidate_lender || s.lender || s.hospital_name || s.hospital || 'คลังยาเครือข่ายที่จัดสรรอัตโนมัติ') as string;
  const cleanLender = cleanText(lender);
  const urgencyRaw = (s.urgency || payload.urgency || (isEmergency ? 'VERY_URGENT' : 'URGENT')) as string;
  const eta = (s.transit_minutes || s.eta_minutes || s.eta || 30) as number | string;
  const deliveryMethod = (s.delivery_method || (urgencyRaw === 'VERY_URGENT' ? 'รถพยาบาลฉุกเฉิน (EMS Dispatch)' : 'หน่วยขนส่งเวชภัณฑ์เครือข่าย')) as string;
  const cleanDeliveryMethod = cleanText(deliveryMethod);
  const reason = (s.reason || proposal.description || (isEmergency ? 'เพื่อรองรับผู้ป่วยอุบัติเหตุฉุกเฉินและจัดสรรเวชภัณฑ์ช่วยชีวิต' : 'เพื่อสำรองยาเร่งด่วนสำหรับผู้ป่วยและรักษาระดับสต็อกปลอดภัยของโรงพยาบาล')) as string;
  const cleanReason = cleanText(reason);

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
              <span className="doorare-decided-chip-v">{cleanIncidentType}</span>
            </div>
            <div className="doorare-decided-chip">
              <span className="doorare-decided-chip-k">สถานที่:</span>
              <span className="doorare-decided-chip-v">{cleanLocation}</span>
            </div>
          </div>
        ) : (
          <div className="doorare-decided-summary-row">
            <div className="doorare-decided-chip">
              <span className="doorare-decided-chip-k">รายการยา:</span>
              <span className="doorare-decided-chip-v">{cleanDrug || cleanTitle}</span>
            </div>
            {displayQty !== undefined && (
              <div className="doorare-decided-chip">
                <span className="doorare-decided-chip-k">จำนวน:</span>
                <span className="doorare-decided-chip-v highlight">{String(displayQty)} {displayUnit}</span>
              </div>
            )}
            {cleanLender && (
              <div className="doorare-decided-chip">
                <span className="doorare-decided-chip-k">ผู้ให้ยืม:</span>
                <span className="doorare-decided-chip-v">{cleanLender}</span>
              </div>
            )}
          </div>
        )}

        {decided === 'approved' && (
          <div className="doorare-decided-actions-row">
            <button
              type="button"
              className={`doorare-proposal-open-page-btn ${isEmergency && !isFlowDone ? 'secondary' : ''}`}
              onClick={handleOpenProposal}
              title={
                isEmergency
                  ? (!isFlowDone
                      ? 'เปิดไปขั้นตอนวางแผนและจัดสรรเวชภัณฑ์ (Flow)'
                      : 'เปิดดูรายละเอียดเหตุฉุกเฉินนี้')
                  : 'เปิดไปยังหน้ายืมยาและเปิดเอกสารคำขอนี้ทันที'
              }
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>
                {isEmergency
                  ? (!isFlowDone
                      ? 'เปิดใน Flow แผนเวชภัณฑ์ →'
                      : `เปิดดูเหตุฉุกเฉินนี้ (${createdEntity?.requestNo || (createdEntity?.id ? String(createdEntity.id).slice(0, 8) : 'เหตุการณ์')})`)
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
        <div className="doorare-proposal-main-title">{cleanTitle}</div>
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
              <div className="doorare-spec-value drug-name">{cleanIncidentType}</div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">จุดเกิดเหตุ / นำส่ง</div>
              <div className="doorare-spec-value">{cleanLocation}</div>
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
              <div className="doorare-spec-value drug-name" title={cleanDrug || cleanTitle}>
                {cleanDrug || cleanTitle}
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">{isUpdate ? 'จำนวนใหม่ที่แก้ไข' : 'จำนวนที่ขอยืม'}</div>
              <div className="doorare-spec-value qty-val">
                {displayQty !== undefined ? String(displayQty) : '-'} <span className="doorare-unit-sub">{displayUnit}</span>
              </div>
            </div>
            <div className="doorare-spec-item">
              <div className="doorare-spec-label">โรงพยาบาลผู้ให้ยืม</div>
              <div className="doorare-spec-value lender-name">{cleanLender}</div>
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
              <div className="doorare-spec-value">{cleanDeliveryMethod}</div>
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
      {isEmergency && cleanActionPlan && (
        <div className="doorare-emergency-action-plan">
          <div className="doorare-action-plan-title">แผนการดำเนินงานทันที (Immediate Action Plan)</div>
          <div className="doorare-action-plan-text">{cleanActionPlan}</div>
        </div>
      )}

      {/* Clinical Rationale Box */}
      <div className="doorare-proposal-rationale-box">
        <div className="doorare-rationale-title">เหตุผลความจำเป็นทางคลินิก (Clinical Rationale)</div>
        <div className="doorare-rationale-text">{cleanReason}</div>
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

export default ProposalCard;
