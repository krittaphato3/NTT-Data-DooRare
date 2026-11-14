import React, { useState } from 'react';
import type { ClarifyQuestion } from '../../services/aiChatApi';

export interface ClarifyAnswer {
  header: string;
  answer: string;
}

interface ClarifyPanelProps {
  questions: ClarifyQuestion[];
  disabled?: boolean;
  onSubmit: (answers: ClarifyAnswer[]) => void;
}

/**
 * The panel the copilot shows when a tool needs a value it could not read: clickable choices plus a custom answer,
 * the same pattern an IDE harness uses. Answers come back as the next user turn, so the agent continues with real values.
 */
export const ClarifyPanel: React.FC<ClarifyPanelProps> = ({ questions, disabled, onSubmit }) => {
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const toggle = (index: number, label: string, multiSelect?: boolean) => {
    setPicked((prev) => {
      const current = prev[index] ?? [];
      if (multiSelect) {
        return {
          ...prev,
          [index]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label],
        };
      }
      return { ...prev, [index]: current.includes(label) ? [] : [label] };
    });
  };

  const answerFor = (index: number) =>
    (custom[index] ?? '').trim() || (picked[index] ?? []).join(', ');

  const answers: ClarifyAnswer[] = questions
    .map((q, index) => ({ header: q.header, answer: answerFor(index) }))
    .filter((a) => a.answer.length > 0);

  const submit = () => {
    if (disabled || answers.length === 0) return;
    onSubmit(answers);
  };

  return (
    <div className="doorare-clarify-card">
      <div className="doorare-clarify-title">
        <span className="doorare-clarify-dot" />
        Copilot ขอข้อมูลเพิ่มเติม
      </div>

      {questions.map((q, index) => (
        <div className="doorare-clarify-question" key={`${q.header}-${index}`}>
          <div className="doorare-clarify-header">{q.header}</div>
          <div className="doorare-clarify-text">{q.question}</div>

          {q.options.length > 0 && (
            <div className="doorare-clarify-options">
              {q.options.map((option) => {
                const selected = (picked[index] ?? []).includes(option.label);
                return (
                  <button
                    type="button"
                    key={option.label}
                    className={`doorare-clarify-option ${selected ? 'selected' : ''}`}
                    onClick={() => toggle(index, option.label, q.multiSelect)}
                    disabled={disabled}
                  >
                    <span className="doorare-clarify-option-label">{option.label}</span>
                    {option.description && (
                      <span className="doorare-clarify-option-desc">{option.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {q.allowFreeText !== false && (
            <input
              className="doorare-clarify-input"
              placeholder="หรือพิมพ์คำตอบเอง..."
              value={custom[index] ?? ''}
              disabled={disabled}
              onChange={(e) => setCustom((prev) => ({ ...prev, [index]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          )}
        </div>
      ))}

      <div className="doorare-clarify-actions">
        <button
          type="button"
          className="doorare-clarify-submit"
          onClick={submit}
          disabled={disabled || answers.length === 0}
        >
          ส่งคำตอบ
        </button>
        {answers.length < questions.length && (
          <span className="doorare-clarify-hint">ตอบอย่างน้อย 1 ข้อเพื่อดำเนินการต่อ</span>
        )}
      </div>
    </div>
  );
};
