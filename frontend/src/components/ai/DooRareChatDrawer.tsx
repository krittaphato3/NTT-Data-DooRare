import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { streamAiChat, type ChatMessage, type RouteContext } from '../../services/aiChatApi';
import { DooRareBotAvatar } from './DooRareBotAvatar';
import { MarkdownContent } from '../common/MarkdownContent';
import { ToolExecutionLogCard, type ToolLogEntry } from './ToolExecutionLogCard';
import { ThinkingAccordion } from './ThinkingAccordion';
import { Icon, type IconName } from '../common/icons';
import {
  loadSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
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
  onActionComplete: (msg: string) => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({ proposal, onActionComplete }) => {
  const [loading, setLoading] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'declined' | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      // Execute the proposal's action API
      await fetch(proposal.actionApi.endpoint, {
        method: proposal.actionApi.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal.actionApi.payload),
      });
      setDecided('approved');
      onActionComplete(`ดำเนินการสำเร็จ: ${proposal.title}`);
    } catch (err: any) {
      onActionComplete(`ดำเนินการไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    setDecided('declined');
    onActionComplete(`ปฏิเสธข้อเสนอ: ${proposal.title}`);
  };

  if (decided) {
    return (
      <div className="doorare-chat-proposal-card decided">
        <div className="doorare-proposal-header">
          {decided === 'approved' ? 'อนุมัติข้อเสนอเรียบร้อย' : 'ปฏิเสธข้อเสนอแล้ว'}
        </div>
        <div className="doorare-proposal-desc">{proposal.title}</div>
      </div>
    );
  }

  const s = proposal.summary || {};
  const drug = (s.drug || s.item_code || s.itemCode || s.drug_name || s.name) as string | undefined;
  const qty = (s.qty || s.quantity || s.required_qty || s.lendable_qty) as number | string | undefined;
  const lender = (s.lender_hospital_name || s.candidate_lender || s.lender || s.hospital_name || s.hospital) as string | undefined;
  const eta = (s.transit_minutes || s.eta_minutes || s.eta) as number | string | undefined;
  const score = (s.score || s.si || s.match_score) as number | string | undefined;

  return (
    <div className="doorare-chat-proposal-card">
      <div className="doorare-proposal-header">
        <span className="doorare-proposal-tag">ข้อเสนอเพื่อการตัดสินใจ (HITL Proposal)</span>
      </div>
      <div className="doorare-proposal-title">{proposal.title}</div>
      <div className="doorare-proposal-desc">{proposal.description}</div>

      {/* Structured Clinical Badges */}
      <div className="doorare-proposal-badges-grid">
        {drug && (
          <div className="doorare-prop-badge">
            <span className="doorare-prop-badge-k">รหัสยา:</span>
            <span className="doorare-prop-badge-v">{String(drug)}</span>
          </div>
        )}
        {qty !== undefined && (
          <div className="doorare-prop-badge">
            <span className="doorare-prop-badge-k">จำนวน:</span>
            <span className="doorare-prop-badge-v highlight">{String(qty)}</span>
          </div>
        )}
        {lender && (
          <div className="doorare-prop-badge">
            <span className="doorare-prop-badge-k">โรงพยาบาล:</span>
            <span className="doorare-prop-badge-v">{String(lender)}</span>
          </div>
        )}
        {eta !== undefined && (
          <div className="doorare-prop-badge">
            <span className="doorare-prop-badge-k">เวลาขนส่ง:</span>
            <span className="doorare-prop-badge-v">{String(eta)} นาที</span>
          </div>
        )}
        {score !== undefined && (
          <div className="doorare-prop-badge">
            <span className="doorare-prop-badge-k">คะแนน Si:</span>
            <span className="doorare-prop-badge-v">{String(score)}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          className="doorare-proposal-details-toggle"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        >
          {showTechnicalDetails ? '▴ ซ่อนข้อมูลดิบ (JSON)' : '▾ ดูข้อมูลทางเทคนิค (JSON)'}
        </button>
      </div>

      {showTechnicalDetails && (
        <pre className="doorare-proposal-raw-json">
          <code>{JSON.stringify(proposal.summary, null, 2)}</code>
        </pre>
      )}

      <div className="doorare-proposal-actions">
        <button
          type="button"
          className="doorare-proposal-btn-approve"
          onClick={handleApprove}
          disabled={loading}
        >
          {loading ? 'กำลังอนุมัติ...' : 'อนุมัติ (Approve)'}
        </button>
        <button
          type="button"
          className="doorare-proposal-btn-decline"
          onClick={handleDecline}
          disabled={loading}
        >
          ปฏิเสธ (Decline)
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

  // Load active sessions (and auto-purge >24h) when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSessions(loadSessions());
    }
  }, [isOpen]);

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

    saveSession(sessionObj);
    setSessions(loadSessions());
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
    deleteSession(id);
    const updated = loadSessions();
    setSessions(updated);
    if (activeSessionId === id) {
      handleNewChat();
    }
  };

  const handleClearAll = () => {
    if (window.confirm('คุณต้องการล้างประวัติการสนทนาทั้งหมดใน 24 ชั่วโมงหรือไม่?')) {
      clearAllSessions();
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

  // Handle drawer close
  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsOpen(false);
    setIsFullScreen(false);
    setShowSessionsDrawer(false);
    setIsStreaming(false);
  };

  // Context Auto-Injector: Extracts current window location, title, and query active ID
  const getRouteContext = (): RouteContext => {
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get('id') || params.get('request_id') || params.get('plan_id') || undefined;
    return {
      currentPath: window.location.pathname + window.location.search,
      pageTitle: document.title,
      hospitalId: user?.hospitalId || null,
      activeId,
    };
  };

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || isStreaming) return;

    setInput('');
    const userMsg: DisplayChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: prompt,
    };
    const assistantMsgId = `msg_asst_${Date.now()}`;
    const assistantPlaceholder: DisplayChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      isThinking: true,
      toolLogs: [],
    };

    const updatedDisplay = [...displayMessages, userMsg, assistantPlaceholder];
    setDisplayMessages(updatedDisplay);

    setIsStreaming(true);
    setActiveTool(null);

    // API messages payload for the backend
    const apiMessages: ChatMessage[] = [
      ...displayMessages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: prompt },
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
            setActiveTool(null);
            setDisplayMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantMsgId && m.toolLogs) {
                  const logs = m.toolLogs.map((log) => {
                    if (log.status === 'running' && (log.id === res.id || log.name === res.name || !res.id)) {
                      return {
                        ...log,
                        status: res.success === false ? ('failed' as const) : ('completed' as const),
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
            setProposals((prev) => [...prev, proposal]);
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
      );
    } catch (e: any) {
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
      {/* Floating Trigger Button */}
      <button
        className="doorare-chat-trigger-btn"
        onClick={() => setIsOpen(true)}
        title="DooRare AI Copilot"
        aria-label="Open AI Copilot"
      >
        <span className="doorare-chat-pulse-badge" />
        <DooRareBotAvatar size={38} />
      </button>

      {/* Backdrop Overlay */}
      <div
        className={`doorare-chat-overlay ${isOpen ? 'open' : ''}`}
        onClick={handleClose}
      />

      {/* Slide-out Drawer / Full Screen Container */}
      <div className={`doorare-chat-drawer ${isOpen ? 'open' : ''} ${isFullScreen ? 'fullscreen' : ''}`}>
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
                title="ซ่อนแถบด้านข้าง"
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

            {/* Quick Navigation Items (Gemini-style) */}
            <div className="doorare-sidebar-nav-items">
              <a
                href={user?.role === 'ER_STAFF' ? '?page=incidents' : '?page=requests'}
                className="doorare-sidebar-nav-link"
              >
                <Icon name="inbox" style={{ width: 15, height: 15 }} />
                <span>คำขอยืมยาฉุกเฉิน</span>
              </a>
              <a
                href="?page=alerts"
                className="doorare-sidebar-nav-link"
              >
                <Icon name="bell" style={{ width: 15, height: 15 }} />
                <span>แจ้งเตือนสต็อกยา</span>
              </a>
            </div>

            {/* Recent Chats Section */}
            <div className="doorare-chat-sidebar-section-header">
              <span className="doorare-chat-sidebar-title-text">ล่าสุด</span>
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="doorare-chat-clear-history-btn"
                  onClick={handleClearAll}
                  title="ล้างประวัติการสนทนาทั้งหมด"
                >
                  ล้าง
                </button>
              )}
            </div>

            <div className="doorare-chat-session-list">
              {sessions.length === 0 ? (
                <div className="doorare-chat-session-empty">
                  <span>ไม่มีประวัติการสนทนาใน 24 ชั่วโมงล่าสุด</span>
                </div>
              ) : (
                sessions.map((s) => (
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
                      title="ลบ"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
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
              <div className="doorare-user-footer-retention" title="ระบบล้างประวัติอัตโนมัติทุก 24 ชั่วโมง">
                24h
              </div>
            </div>
          </aside>
        )}

        {/* Main Chat Column */}
        <div className="doorare-chat-main-col">
          {/* Header */}
          <div className="doorare-chat-header">
            <div className="doorare-chat-title-group">
              {isFullScreen && isSidebarCollapsed && (
                <button
                  type="button"
                  className="doorare-sidebar-toggle-btn in-header"
                  onClick={() => setIsSidebarCollapsed(false)}
                  title="เปิดแถบด้านข้าง"
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
                  title="ดูประวัติการสนทนา (24 ชม.)"
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
                <DooRareBotAvatar size={32} />
              </div>
              <div>
                <div className="doorare-chat-title">DooRare AI Copilot</div>
                <span className="doorare-chat-context-badge">
                  {user?.roleTh || user?.role || 'Guest'}
                </span>
              </div>
            </div>

            <div className="doorare-chat-header-actions">
              <button
                type="button"
                className="doorare-chat-header-action-btn"
                onClick={handleNewChat}
                title="เริ่มแชทใหม่ (New Chat)"
              >
                ＋ แชทใหม่
              </button>

              <button
                type="button"
                className="doorare-chat-header-action-btn icon"
                onClick={() => {
                  setIsFullScreen((prev) => !prev);
                  setShowSessionsDrawer(false);
                }}
                title={
                  isFullScreen
                    ? 'ย่อหน้าต่าง (Minimize to Drawer)'
                    : 'ขยายเต็มหน้าจอ (Full Screen like ChatGPT / Claude / Gemini)'
                }
              >
                {isFullScreen ? '⤡ ย่อ' : '⛶ เต็มจอ'}
              </button>

              <button
                type="button"
                className="doorare-chat-close-btn"
                onClick={handleClose}
                title="ปิดหน้าต่างแชท"
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
                    {/* Harness Thinking / Chain-of-Thought Accordion */}
                    {msg.role === 'assistant' && (msg.thought || msg.isThinking) && (
                      <ThinkingAccordion
                        thought={msg.thought || ''}
                        isThinking={Boolean(msg.isThinking && isStreaming)}
                      />
                    )}

                    {/* Harness Tool Logs above assistant bubble */}
                    {msg.toolLogs && msg.toolLogs.length > 0 && (
                      <div className="doorare-chat-tools-container">
                        {msg.toolLogs.map((tool) => (
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
                    ) : isStreaming && msg.role === 'assistant' && !msg.isThinking && !msg.thought ? (
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

          {/* Render HITL Proposals */}
          {proposals.map((prop, idx) => (
            <ProposalCard
              key={idx}
              proposal={prop}
              onActionComplete={(msgText) => {
                setDisplayMessages((prev) => [
                  ...prev,
                  {
                    id: `prop_res_${Date.now()}`,
                    role: 'assistant',
                    content: msgText,
                  },
                ]);
              }}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

          {/* Input Area */}
          <div className="doorare-chat-input-area">
            <div className="doorare-input-capsule">
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
              <div className="doorare-input-bottom-bar">
                <div className="doorare-input-badge">
                  <span className="doorare-badge-dot" />
                  <span className="doorare-badge-text">
                    {user?.hospitalName ? user.hospitalName : 'ส่วนกลาง เขตสุขภาพที่ 6'}
                  </span>
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    className="doorare-chat-stop-btn"
                    onClick={handleStopGeneration}
                    title="หยุดการตอบกลับ (Stop)"
                  >
                    <span className="doorare-stop-icon" />
                    <span>หยุด</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="doorare-chat-send-btn"
                    disabled={!input.trim()}
                    onClick={() => handleSend()}
                    title="ส่งข้อความ (Enter)"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
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
