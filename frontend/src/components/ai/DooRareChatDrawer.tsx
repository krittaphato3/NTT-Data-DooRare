import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getStoredToken } from '../../services/apiFetch';
import { streamAiChat, type ChatMessage, type RouteContext } from '../../services/aiChatApi';
import { DooRareBotAvatar } from './DooRareBotAvatar';
import { MarkdownContent } from '../common/MarkdownContent';
import { ToolExecutionLogCard, type ToolLogEntry } from './ToolExecutionLogCard';
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
    actionApi: {
      endpoint: string;
      method: string;
      payload: Record<string, unknown>;
    };
  };
  initialStatus?: 'pending' | 'approved' | 'declined' | 'failed';
  onActionComplete: (status: 'approved' | 'declined' | 'failed', msg: string) => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({ proposal, initialStatus, onActionComplete }) => {
  const [loading, setLoading] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'declined' | null>(() =>
    initialStatus === 'approved' || initialStatus === 'declined' ? initialStatus : null,
  );
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

      const payload = {
        ...proposal.actionApi.payload,
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
      if (resJson?.id || resJson?.data?.id) {
        const createdId = resJson.id || resJson.data.id;
        window.dispatchEvent(new CustomEvent('doorare:incident-created', { detail: { id: createdId } }));
      }
      setIsDuplicateConflict(false);
      setDecided('approved');
      onActionComplete('approved', `ดำเนินการสำเร็จ: ${proposal.title}`);
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

  const s = proposal.summary || {};
  const payload = proposal.actionApi?.payload || {};

  const drug = (s.drug_name || s.drug || s.item_code || s.itemCode || s.name || payload.drugMasterId || proposal.title) as string | undefined;
  const qty = (s.quantity ?? s.qty ?? s.required_qty ?? s.lendable_qty ?? payload.quantity) as number | string | undefined;
  const unit = (s.unit || 'ชุด') as string;
  const lender = (s.lender_hospital_name || s.candidate_lender || s.lender || s.hospital_name || s.hospital || 'คลังยาเครือข่ายที่จัดสรรอัตโนมัติ') as string;
  const urgencyRaw = (s.urgency || payload.urgency || 'URGENT') as string;
  const eta = (s.transit_minutes || s.eta_minutes || s.eta || 30) as number | string;
  const deliveryMethod = (s.delivery_method || (urgencyRaw === 'VERY_URGENT' ? 'รถพยาบาลฉุกเฉิน (EMS Dispatch)' : 'หน่วยขนส่งเวชภัณฑ์เครือข่าย')) as string;
  const reason = (s.reason || proposal.description || 'เพื่อสำรองยาเร่งด่วนสำหรับผู้ป่วยและรักษาระดับสต็อกปลอดภัยของโรงพยาบาล') as string;

  let urgencyLabel = 'ด่วน (URGENT)';
  let urgencyClass = 'urgent';
  if (urgencyRaw === 'VERY_URGENT' || urgencyRaw === 'ด่วนมาก' || urgencyRaw === 'ด่วนที่สุด') {
    urgencyLabel = 'ด่วนมาก (VERY_URGENT)';
    urgencyClass = 'very-urgent';
  } else if (urgencyRaw === 'ROUTINE' || urgencyRaw === 'ปกติ') {
    urgencyLabel = 'ปกติ (ROUTINE)';
    urgencyClass = 'routine';
  }

  if (decided) {
    return (
      <div className={`doorare-chat-proposal-card formal decided-${decided}`}>
        <div className="doorare-decided-header">
          <div className={`doorare-decided-icon ${decided}`}>
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
              {decided === 'approved' ? 'อนุมัติคำขอยืมยาเรียบร้อยแล้ว (Order Approved)' : 'ปฏิเสธคำขอยืมยานี้แล้ว (Order Declined)'}
            </div>
            <div className="doorare-decided-subtitle">
              {decided === 'approved'
                ? 'ระบบได้ส่งคำสั่งขอยืมยาเข้าระบบเครือข่าย MedSupply Link และบันทึก Audit Trail เรียบร้อยแล้ว'
                : 'คำขอนี้ถูกยกเลิกโดยเภสัชกรผู้ควบคุม จะไม่มีการสร้างเอกสารเบิกยืมข้ามโรงพยาบาล'}
            </div>
          </div>
        </div>
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
      </div>
    );
  }

  return (
    <div className="doorare-chat-proposal-card formal">
      {/* Top Banner */}
      <div className="doorare-proposal-header-formal">
        <div className="doorare-proposal-header-left">
          <div className="doorare-proposal-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <div className="doorare-proposal-meta-title">ใบเสนอคำขอยืมยาทางการแพทย์ (Clinical Order Proposal)</div>
            <div className="doorare-proposal-main-title">{proposal.title}</div>
          </div>
        </div>
        <span className="doorare-proposal-status-chip pending">
          รอการอนุมัติ (Pending Authorization)
        </span>
      </div>

      {/* Structured Clinical Specification Grid */}
      <div className="doorare-proposal-spec-grid">
        <div className="doorare-spec-item">
          <div className="doorare-spec-label">รายการยา & รูปแบบ</div>
          <div className="doorare-spec-value drug-name" title={drug || proposal.title}>
            {drug || proposal.title}
          </div>
        </div>
        <div className="doorare-spec-item">
          <div className="doorare-spec-label">จำนวนที่ขอยืม</div>
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
      </div>

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
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => {
      setCopiedMsgId((cur) => (cur === msgId ? null : cur));
    }, 2000);
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

  const handleSend = async (textToSend?: string) => {
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

    setDisplayMessages((prev) => [...prev, userMsg, assistantPlaceholder]);

    setIsStreaming(true);
    setActiveTool(null);

    // One controller per turn: the stop button and closing the drawer abort this request (SSE read + server ReAct loop).
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // API messages payload for the backend
    const apiMessages: ChatMessage[] = [
      ...displayMessages
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
            setActiveTool(`กำลังค้นหาข้อมูลด้วย: ${tool.name}...`);
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
                        ? `${m.content}\n\n⚠️ ขออภัย เกิดข้อผิดพลาด: ${errMsg}`
                        : `⚠️ ขออภัย เกิดข้อผิดพลาด: ${errMsg}`,
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

              {/* Quit button stays the same visually (✕), but acts as minimize */}
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

                    {msg.content ? (
                      <div className={`doorare-chat-bubble ${msg.role}`}>
                        <MarkdownContent content={msg.content} />
                        {msg.role === 'assistant' && (
                          <div className="doorare-bubble-actions">
                            <button
                              type="button"
                              className="doorare-bubble-copy-btn"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              title="คัดลอกคำตอบ"
                            >
                              {copiedMsgId === msg.id ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
                            </button>
                          </div>
                        )}
                      </div>
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
                        onActionComplete={(status) => {
                          setDisplayMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, proposalStatus: status } : m,
                            ),
                          );
                        }}
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
              ประมวลผลด้วย AI เพื่อความปลอดภัยทางคลินิก · โปรดตรวจสอบความถูกต้องของข้อมูล
            </div>
          </div>
      </div>
    </div>
  </>
);
};
