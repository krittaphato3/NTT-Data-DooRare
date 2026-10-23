import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { streamAiChat, type ChatMessage, type RouteContext } from '../../services/aiChatApi';
import { DooRareBotAvatar } from './DooRareBotAvatar';
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
      // Execute the proposal's action API
      await fetch(proposal.actionApi.endpoint, {
        method: proposal.actionApi.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal.actionApi.payload),
      });
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
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  }, [messages, activeTool, proposals]);

  // Handle drawer close: completely reset conversation history and active state
  const handleClose = () => {
    setIsOpen(false);
    setMessages([]);
    setInput('');
    setActiveTool(null);
    setProposals([]);
    setIsStreaming(false);
    try {
      sessionStorage.removeItem('doorare_chat_history');
    } catch {}
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
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setActiveTool(null);

    // Placeholder for assistant answer
    let assistantText = '';
    const assistantIndex = updatedMessages.length;

    try {
      await streamAiChat(
        updatedMessages,
        getRouteContext(),
        {
          onStatus: (_st) => {
            // Status update
          },
          onToolStart: (tool) => {
            setActiveTool(`กำลังค้นหาข้อมูลด้วย: ${tool.name}...`);
          },
          onToolEnd: () => {
            setActiveTool(null);
          },
          onToken: (token) => {
            assistantText += token;
            setMessages((prev) => {
              const copy = [...prev];
              copy[assistantIndex] = { role: 'assistant', content: assistantText };
              return copy;
            });
          },
          onProposal: (proposal) => {
            setProposals((prev) => [...prev, proposal]);
          },
          onError: (errMsg) => {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `⚠️ ขออภัย เกิดข้อผิดพลาด: ${errMsg}` },
            ]);
          },
          onDone: () => {
            setIsStreaming(false);
            setActiveTool(null);
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

      {/* Slide-out Drawer */}
      <div className={`doorare-chat-drawer ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="doorare-chat-header">
          <div className="doorare-chat-title-group">
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
          <button
            className="doorare-chat-close-btn"
            onClick={handleClose}
            title="ปิดหน้าต่างแชทและล้างประวัติ"
          >
            ✕
          </button>
        </div>

        {/* Messages Body */}
        <div className="doorare-chat-messages">
          {messages.length === 0 && (
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

          {messages.map((msg, i) => (
            <div key={i} className={`doorare-chat-msg-row ${msg.role}`}>
              <div className={`doorare-chat-bubble ${msg.role}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Thinking / Typing Animated Dots Indicator */}
          {isStreaming && (!messages[messages.length - 1] || messages[messages.length - 1].role === 'user') && (
            <div className="doorare-chat-msg-row assistant">
              <div className="doorare-typing-bubble" title="AI กำลังคิดคำตอบ...">
                <span className="doorare-typing-dot" />
                <span className="doorare-typing-dot" />
                <span className="doorare-typing-dot" />
              </div>
            </div>
          )}

          {/* Active Tool Indicator */}
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
              onActionComplete={(msg) => {
                setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
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
    </>
  );
};
