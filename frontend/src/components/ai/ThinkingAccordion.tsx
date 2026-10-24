import React, { useState, useEffect, useRef } from 'react';

interface ThinkingAccordionProps {
  thought: string;
  isThinking?: boolean;
}

export const ThinkingAccordion: React.FC<ThinkingAccordionProps> = ({ thought, isThinking = false }) => {
  // Automatically expanded while the model is thinking; collapses to minimized form when finished
  const [isExpanded, setIsExpanded] = useState<boolean>(isThinking);
  const [elapsedSec, setElapsedSec] = useState<number>(1);
  const [finalDurationSec, setFinalDurationSec] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const prevIsThinkingRef = useRef<boolean>(isThinking);

  // When model finishes thinking and text appears, shrink to minimized form
  useEffect(() => {
    if (prevIsThinkingRef.current && !isThinking) {
      setIsExpanded(false);
    } else if (!prevIsThinkingRef.current && isThinking) {
      setIsExpanded(true);
    }
    prevIsThinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isThinking) {
      startTimeRef.current = Date.now();
      setElapsedSec(1);
      timer = setInterval(() => {
        const secs = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
        setElapsedSec(secs);
      }, 500);
    } else {
      const totalSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
      setFinalDurationSec(totalSec);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isThinking]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!thought) return;
    navigator.clipboard.writeText(thought);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!thought && !isThinking) return null;

  return (
    <div className={`doorare-thinking-card ${isThinking ? 'thinking' : 'completed'}`}>
      <div
        className="doorare-thinking-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        title="คลิกเพื่อเปิด/ปิด กระบวนการคิดวิเคราะห์ (Chain of Thought)"
      >
        <div className="doorare-thinking-title-wrap">
          <span className={`doorare-thinking-icon ${isThinking ? 'pulse' : ''}`}>🧠</span>
          <span className="doorare-thinking-title">
            {isThinking ? (
              <>
                กำลังคิดวิเคราะห์...
                <span className="doorare-thinking-timer">({elapsedSec}s)</span>
              </>
            ) : (
              <>
                กระบวนการคิดวิเคราะห์
                <span className="doorare-thinking-timer-done">
                  (Thought for {finalDurationSec || elapsedSec}s)
                </span>
              </>
            )}
          </span>
        </div>

        <div className="doorare-thinking-meta">
          {thought && !isThinking && (
            <button
              type="button"
              className="doorare-thinking-copy-btn"
              onClick={handleCopy}
              title="คัดลอกกระบวนการคิด"
            >
              {copied ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          )}
          {isThinking && <span className="doorare-thinking-live-dot" />}
          <span className="doorare-thinking-chevron">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="doorare-thinking-body">
          <div className="doorare-thinking-content">
            {thought || 'กำลังวิเคราะห์บริบททางคลินิกและประเมินกฎความปลอดภัย...'}
          </div>
        </div>
      )}
    </div>
  );
};
