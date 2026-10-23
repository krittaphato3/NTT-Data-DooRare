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
      const start = Date.now();
      timer = setInterval(() => {
        setElapsedSec(Math.max(1, Math.floor((Date.now() - start) / 1000)));
      }, 500);
    } else if (elapsedSec > 0 && finalDurationSec === null) {
      setFinalDurationSec(elapsedSec);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isThinking, elapsedSec, finalDurationSec]);

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
