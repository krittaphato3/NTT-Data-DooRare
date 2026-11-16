import React, { useMemo } from 'react';
import type { ToolLogEntry } from './ToolExecutionLogCard';
import { citationsFrom, followUpsFrom } from './answerChips';

interface AnswerInsightsProps {
  content: string;
  toolLogs?: ToolLogEntry[];
  onAsk: (prompt: string) => void;
}

/**
 * Sources the answer used (records open in the app, external pages open in a new tab) and the next useful questions.
 * Both are derived from the answer itself — no extra model call.
 */
export const AnswerInsights: React.FC<AnswerInsightsProps> = ({ content, toolLogs, onAsk }) => {
  const citations = useMemo(() => citationsFrom(content, toolLogs), [content, toolLogs]);
  const followUps = useMemo(() => followUpsFrom(content, toolLogs), [content, toolLogs]);

  if (citations.length === 0 && followUps.length === 0) return null;

  return (
    <div className="doorare-answer-insights">
      {citations.length > 0 && (
        <div className="doorare-insight-row" aria-label="แหล่งข้อมูลที่ใช้">
          <span className="doorare-insight-label">อ้างอิง</span>
          {citations.map((c) => (
            <a
              key={c.id}
              className="doorare-citation-chip"
              href={c.href}
              {...(c.kind === 'external' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              title={c.href}
            >
              <span className="doorare-citation-icon" aria-hidden="true">
                {c.kind === 'external' ? '↗' : '#'}
              </span>
              {c.label}
            </a>
          ))}
        </div>
      )}

      {followUps.length > 0 && (
        <div className="doorare-insight-row" aria-label="คำถามต่อ">
          <span className="doorare-insight-label">ถามต่อ</span>
          {followUps.map((f) => (
            <button key={f.label} type="button" className="doorare-followup-chip" onClick={() => onAsk(f.prompt)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
