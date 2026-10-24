import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getStoredToken } from '../../services/apiFetch';
import { streamAiChat, type ChatMessage, type RouteContext } from '../../services/aiChatApi';
import { DooRareBotAvatar } from './DooRareBotAvatar';
import { MarkdownContent } from '../common/MarkdownContent';
import { ToolExecutionLogCard, type ToolLogEntry } from './ToolExecutionLogCard';
import { ThinkingAccordion } from './ThinkingAccordion';
import {
  loadSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
  formatSessionRelativeTime,
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

  const handleApprove = async () => {
    setLoading(true);
    try {
      // Execute the proposal's action API (endpoint is already prefixed with /api/v1; send the session token)
      const token = getStoredToken();
      const res = await fetch(proposal.actionApi.endpoint, {
        method: proposal.actionApi.method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(proposal.actionApi.payload),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem.message || problem.title || `HTTP ${res.status}`);
      }
      setDecided('approved');
      onActionComplete(`✅ ดำเนินการสำเร็จ: ${proposal.title}`);
    } catch (err: any) {
      onActionComplete(`❌ ดำเนินการไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    setDecided('declined');
    onActionComplete(`🚫 ปฏิเสธข้อเสนอ: ${proposal.title}`);
  };

  if (decided) {
    return (
      <div className="doorare-chat-proposal-card" style={{ opacity: 0.85 }}>
        <div className="doorare-proposal-header">
          {decided === 'approved' ? '✅ อนุมัติข้อเสนอแล้ว' : '🚫 ปฏิเสธข้อเสนอแล้ว'}
        </div>
        <div className="doorare-proposal-desc">{proposal.title}</div>
      </div>
    );
  }

  return (
    <div className="doorare-chat-proposal-card">
      <div className="doorare-proposal-header">
        <span>⚡ Human-In-The-Loop Proposal</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
        {proposal.title}
      </div>
      <div className="doorare-proposal-desc">{proposal.description}</div>
      <div className="doorare-proposal-summary">
        {JSON.stringify(proposal.summary, null, 2)}
      </div>
      <div className="doorare-proposal-actions">
        <button
          className="doorare-proposal-btn-approve"
          onClick={handleApprove}
          disabled={loading}
        >
          {loading ? 'กำลังอนุมัติ...' : 'อนุมัติ (Approve)'}
        </button>
        <button
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
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
    if (window.confirm('คุณต้องการล้างประวัติการสนทนาทั้งหมดใน 24 ชั่วโมงหรือไม่?')) {
      clearAllSessions(userScope);
      setSessions([]);
      handleNewChat();
    }
  };

  // Handle drawer close
  const handleClose = () => {
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

  // Preset chips depending on current role
  const quickChips =
    user?.role === 'ER_STAFF'
      ? ['ตรวจสอบยาแก้พิษฉุกเฉิน (Antidote)', 'สรุปรายการของนอกเซ็ตอุบัติภัย', 'ติดตามสถานะรถขนส่งด่วน']
      : user?.role === 'PHARMACIST'
      ? ['ตรวจสอบสต็อกยาใกล้ถึงจุด ROP', 'ค้นหา รพ. ที่มียาให้ยืมใกล้ที่สุด', 'เช็ครายการยาใกล้หมดอายุใน Pool']
      : ['ตรวจสอบสถานะระบบ AI Copilot', 'คำนวณสรุปการยืมยาประจำวัน'];

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
        {(isFullScreen || showSessionsDrawer) && (
          <aside className={`doorare-chat-sidebar ${showSessionsDrawer && !isFullScreen ? 'drawer-overlay' : ''}`}>
            <div className="doorare-chat-sidebar-header">
              <button
                type="button"
                className="doorare-chat-new-chat-btn"
                onClick={handleNewChat}
                title="เริ่มการสนทนาใหม่"
              >
                <span>＋</span>
                <span>แชทใหม่ (New Chat)</span>
              </button>

              {showSessionsDrawer && !isFullScreen && (
                <button
                  type="button"
                  className="doorare-chat-sidebar-close-btn"
                  onClick={() => setShowSessionsDrawer(false)}
                  title="ปิดประวัติการสนทนา"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="doorare-chat-sidebar-title-bar">
              <span className="doorare-chat-sidebar-title-text">ประวัติการสนทนา</span>
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="doorare-chat-clear-history-btn"
                  onClick={handleClearAll}
                  title="ล้างประวัติทั้งหมด"
                >
                  ล้างทั้งหมด
                </button>
              )}
            </div>

            <div className="doorare-chat-session-list">
              {sessions.length === 0 ? (
                <div className="doorare-chat-session-empty">
                  <span style={{ fontSize: 24, marginBottom: 6 }}>🕒</span>
                  <div>ไม่มีประวัติการสนทนาใน 24 ชั่วโมงล่าสุด</div>
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`doorare-chat-session-item ${s.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => handleSelectSession(s)}
                  >
                    <div className="doorare-chat-session-info">
                      <div className="doorare-chat-session-name" title={s.title}>
                        💬 {s.title}
                      </div>
                      <div className="doorare-chat-session-time">
                        {formatSessionRelativeTime(s.updatedAt)}
                      </div>
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
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="doorare-chat-sidebar-footer">
              <span className="doorare-chat-retention-pill">🕒 ล้างประวัติอัตโนมัติทุก 24 ชม.</span>
            </div>
          </aside>
        )}

        {/* Main Chat Column */}
        <div className="doorare-chat-main-col">
          {/* Header */}
          <div className="doorare-chat-header">
            <div className="doorare-chat-title-group">
              {!isFullScreen && (
                <button
                  type="button"
                  className={`doorare-chat-sessions-toggle-btn ${showSessionsDrawer ? 'active' : ''}`}
                  onClick={() => setShowSessionsDrawer((prev) => !prev)}
                  title="ดูประวัติการสนทนา (24 ชม.)"
                >
                  <span>💬</span>
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
                {isFullScreen ? '⤡ ย่อหน้าต่าง' : '⛶ เต็มจอ'}
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
        <div className="doorare-chat-messages">
          {displayMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px', padding: '0 20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
                สวัสดีครับ ผมคือผู้ช่วย DooRare Copilot
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
                ถามข้อมูลยา สต็อก ค้นหาแหล่งยืมยา หรือคำนวณของนอกเซ็ตฉุกเฉินได้ทันทีครับ
              </div>
            </div>
          )}

          {displayMessages.map((msg) => (
            <div key={msg.id} className={`doorare-chat-msg-row ${msg.role}`}>
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
                </div>
              ) : null}
            </div>
          ))}

          {/* Thinking / Typing Animated Dots Indicator */}
          {isStreaming &&
            (!displayMessages[displayMessages.length - 1] ||
              displayMessages[displayMessages.length - 1].role === 'user' ||
              (!displayMessages[displayMessages.length - 1].content &&
                !displayMessages[displayMessages.length - 1].thought &&
                (!displayMessages[displayMessages.length - 1].toolLogs ||
                  displayMessages[displayMessages.length - 1].toolLogs?.length === 0))) && (
              <div className="doorare-chat-msg-row assistant">
                <div className="doorare-typing-bubble" title="AI กำลังคิดคำตอบ...">
                  <span className="doorare-typing-dot" />
                  <span className="doorare-typing-dot" />
                  <span className="doorare-typing-dot" />
                </div>
              </div>
            )}

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

        {/* Input & Quick Chips Footer */}
        <div className="doorare-chat-input-area">
          {/* Quick Prompts */}
          <div className="doorare-chat-quick-chips">
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                className="doorare-quick-chip"
                onClick={() => handleQuickPrompt(chip)}
                disabled={isStreaming}
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="doorare-chat-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <textarea
              className="doorare-chat-input-box"
              placeholder="พิมพ์คำถาม หรือขอให้ Copilot ช่วยดำเนินการ..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
            />
            <button
              type="submit"
              className="doorare-chat-send-btn"
              disabled={isStreaming || !input.trim()}
              title="ส่งข้อความ"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  </>
);
};
