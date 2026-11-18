import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
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

import { ProposalCard } from './ProposalCard.js';

/**
 * Determines whether a clarify question turn is answered or completed,
 * recovering saved answers from subsequent turns if not already persisted.
 */
function resolveQuestionState(
  msg: DisplayChatMessage,
  idx: number,
  allMessages: DisplayChatMessage[],
): { isAnswered: boolean; savedAnswers?: { header: string; answer: string }[] } {
  // If explicitly answered and has savedAnswers, use them
  if (msg.questionsAnswered && msg.savedAnswers && msg.savedAnswers.length > 0) {
    return { isAnswered: true, savedAnswers: msg.savedAnswers };
  }

  // Check if there are subsequent messages in the conversation (meaning conversation proceeded past this turn)
  const subsequentMessages = allMessages.slice(idx + 1);
  const nextUserMsg = subsequentMessages.find((m) => m.role === 'user');
  const hasSubsequentTurn = subsequentMessages.length > 0;

  if (msg.questionsAnswered || hasSubsequentTurn) {
    let recoveredAnswers = msg.savedAnswers;

    if (!recoveredAnswers || recoveredAnswers.length === 0) {
      if (nextUserMsg && nextUserMsg.content.includes('ตอบคำถาม:')) {
        // Content format: "ตอบคำถาม: Header 1: Answer 1 | Header 2: Answer 2"
        const cleanContent = nextUserMsg.content.replace(/^ตอบคำถาม:\s*/, '').trim();
        const parts = cleanContent.split('|').map((p) => p.trim());
        recoveredAnswers = parts.map((part) => {
          const colonIdx = part.indexOf(':');
          if (colonIdx !== -1) {
            return {
              header: part.substring(0, colonIdx).trim(),
              answer: part.substring(colonIdx + 1).trim(),
            };
          }
          return {
            header: msg.questions?.[0]?.header || 'คำตอบ',
            answer: part,
          };
        });
      } else if (msg.questions && msg.questions.length > 0 && nextUserMsg) {
        // Fallback: if user answered with a custom prompt right after
        recoveredAnswers = [
          {
            header: msg.questions[0].header,
            answer: nextUserMsg.content,
          },
        ];
      }
    }

    return {
      isAnswered: true,
      savedAnswers: recoveredAnswers,
    };
  }

  return {
    isAnswered: false,
    savedAnswers: undefined,
  };
}

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

    let hasHealed = false;
    const healedMessages = (session.messages || []).map((m, idx, all) => {
      if (m.role === 'assistant' && m.questions && m.questions.length > 0 && !m.questionsAnswered) {
        const resolution = resolveQuestionState(m, idx, all);
        if (resolution.isAnswered) {
          hasHealed = true;
          return {
            ...m,
            questionsAnswered: true,
            savedAnswers: resolution.savedAnswers || m.savedAnswers,
          };
        }
      }
      return m;
    });

    setDisplayMessages(healedMessages);
    setProposals(session.proposals || []);
    setActiveTool(null);
    setShowSessionsDrawer(false);

    if (hasHealed) {
      saveSession(
        { ...session, messages: healedMessages, updatedAt: session.updatedAt || Date.now() },
        userScope,
      );
    }
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
            const sanitizedProposal = proposal
              ? {
                  ...proposal,
                  title:
                    typeof proposal.title === 'string'
                      ? proposal.title.replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, '').trim()
                      : proposal.title,
                }
              : proposal;
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, proposal: sanitizedProposal, proposalStatus: 'pending', isThinking: false }
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
                    ? `${m.content}\n\nเกิดข้อผิดพลาด: ${errMsg}`
                    : `เกิดข้อผิดพลาด: ${errMsg}`,
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
                  title="ขยายเต็มจอ"
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

            {displayMessages.map((msg, index) => (
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

                    {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (() => {
                      const resolution = resolveQuestionState(msg, displayMessages.indexOf(msg), displayMessages);
                      return (
                        <ClarifyPanel
                          key={`clarify_${msg.id}_${resolution.isAnswered ? 'answered' : 'pending'}`}
                          questions={msg.questions}
                          disabled={isStreaming}
                          isAnswered={resolution.isAnswered}
                          savedAnswers={resolution.savedAnswers || msg.savedAnswers}
                          onSubmit={(answers) => {
                            const updatedList = displayMessages.map((m) =>
                              m.id === msg.id ? { ...m, questionsAnswered: true, savedAnswers: answers } : m,
                            );
                            setDisplayMessages(updatedList);
                            persistCurrentSession(updatedList, proposals);
                            handleSend(
                              `ตอบคำถาม: ${answers.map((a) => `${a.header}: ${a.answer}`).join(' | ')}`,
                              updatedList,
                            );
                          }}
                        />
                      );
                    })()}

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

                    {!msg.content &&
                    !msg.questions?.length &&
                    !msg.proposal &&
                    isStreaming &&
                    msg.role === 'assistant' &&
                    !msg.isThinking &&
                    !msg.thought &&
                    index === displayMessages.length - 1 ? (
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
