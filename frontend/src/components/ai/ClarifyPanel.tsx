import React, { useState, useEffect } from 'react';
import type { ClarifyQuestion } from '../../services/aiChatApi';

export interface ClarifyAnswer {
  header: string;
  answer: string;
}

interface ClarifyPanelProps {
  questions: ClarifyQuestion[];
  disabled?: boolean;
  isAnswered?: boolean;
  savedAnswers?: ClarifyAnswer[];
  onSubmit: (answers: ClarifyAnswer[]) => void;
}

/**
 * Fallback options when the model asks a standard question without providing choices.
 */
function getDefaultOptions(header?: string, question?: string): { label: string; description?: string }[] {
  const combined = `${header || ''} ${question || ''}`.toLowerCase();
  if (combined.includes('พารา') || combined.includes('paracetamol')) {
    return [
      { label: 'Paracetamol tablet 500 mg', description: 'ยาเม็ดบรรเทาปวด ลดไข้ 500 มก.' },
      { label: 'Paracetamol syrup 120 mg/5 mL', description: 'ยาน้ำสำหรับเด็ก 120 มก./5 มล.' },
      { label: 'Paracetamol IV 10 mg/mL (100 mL)', description: 'ยาฉีดเข้าหลอดเลือดดำ' },
    ];
  }
  if (
    combined.includes('ความแรง') ||
    combined.includes('รูปแบบ') ||
    combined.includes('ขนาดยา') ||
    combined.includes('dosage') ||
    combined.includes('form') ||
    combined.includes('strength')
  ) {
    return [
      { label: 'Paracetamol 500 mg (tablet)', description: 'ยาเม็ดบรรเทาปวด ลดไข้ 500 มก.' },
      { label: 'Paracetamol 120 mg/5 mL (syrup)', description: 'ยาน้ำสำหรับเด็ก 120 มก./5 มล.' },
    ];
  }
  if (
    combined.includes('โรงพยาบาล') ||
    combined.includes('ผู้ให้ยืม') ||
    combined.includes('hospital') ||
    combined.includes('lender')
  ) {
    return [
      { label: 'ให้ระบบจัดอันดับโรงพยาบาลที่เหมาะสมที่สุดอัตโนมัติ', description: 'จัดสรรตามระยะทาง สต็อกปลอดภัย และเวลาขนส่ง' },
      { label: 'รพ.สมุทรปราการ', description: 'โรงพยาบาลศูนย์ประจำจังหวัด' },
      { label: 'รพ.บางพลี', description: 'โรงพยาบาลทั่วไปในเครือข่าย' },
      { label: 'รพ.บางบ่อ', description: 'โรงพยาบาลชุมชนใกล้เคียง' },
    ];
  }
  if (
    combined.includes('เร่งด่วน') ||
    combined.includes('urgency') ||
    combined.includes('priority') ||
    combined.includes('ด่วน')
  ) {
    return [
      { label: 'ปกติ (NORMAL)', description: 'จัดส่งตามรอบปกติ ภายใน 24 ชม.' },
      { label: 'ด่วน (URGENT)', description: 'ต้องการใช้เร่งด่วน ภายใน 2-4 ชม.' },
      { label: 'ด่วนมาก (VERY_URGENT)', description: 'วิกฤต/ฉุกเฉิน นำส่งทันที' },
    ];
  }
  return [];
}

/**
 * Unified Clarify Panel: displays all questions on one scannable, effortless card.
 * No horizontal scrollbars, no multi-step pagination friction.
 * The operator can click choices directly across all questions and submit with a single click.
 */
export const ClarifyPanel: React.FC<ClarifyPanelProps> = ({
  questions,
  disabled,
  isAnswered,
  savedAnswers,
  onSubmit,
}) => {
  // Initialize picked options from savedAnswers if available
  const [picked, setPicked] = useState<Record<number, string[]>>(() => {
    const initial: Record<number, string[]> = {};
    if (savedAnswers && savedAnswers.length > 0) {
      questions.forEach((q, idx) => {
        const matching = savedAnswers.find(
          (a) => a.header === q.header || a.header.includes(q.header) || q.header.includes(a.header),
        );
        if (matching && matching.answer) {
          const split = matching.answer.split(',').map((s) => s.trim());
          const qOpts = (q.options && q.options.length > 0) ? q.options : getDefaultOptions(q.header, q.question);
          const matched = qOpts.filter((o) => split.includes(o.label)).map((o) => o.label);
          if (matched.length > 0) {
            initial[idx] = matched;
          }
        }
      });
    }
    return initial;
  });

  // Initialize custom text input from savedAnswers if available
  const [custom, setCustom] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    if (savedAnswers && savedAnswers.length > 0) {
      questions.forEach((q, idx) => {
        const matching = savedAnswers.find(
          (a) => a.header === q.header || a.header.includes(q.header) || q.header.includes(a.header),
        );
        if (matching && matching.answer) {
          const split = matching.answer.split(',').map((s) => s.trim());
          const qOpts = (q.options && q.options.length > 0) ? q.options : getDefaultOptions(q.header, q.question);
          const hasOptionMatch = qOpts.some((o) => split.includes(o.label));
          if (!hasOptionMatch && matching.answer !== 'ไม่ระบุ' && matching.answer !== 'Not specified') {
            initial[idx] = matching.answer;
          }
        }
      });
    }
    return initial;
  });

  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isAnswered) {
      setSubmitted(true);
    }
  }, [isAnswered]);

  useEffect(() => {
    if (savedAnswers && savedAnswers.length > 0) {
      const initialPicked: Record<number, string[]> = {};
      const initialCustom: Record<number, string> = {};
      questions.forEach((q, idx) => {
        const matching = savedAnswers.find(
          (a) =>
            a.header === q.header ||
            a.header.toLowerCase().includes(q.header.toLowerCase()) ||
            q.header.toLowerCase().includes(a.header.toLowerCase()),
        );
        if (matching && matching.answer) {
          const split = matching.answer.split(',').map((s) => s.trim());
          const qOpts = (q.options && q.options.length > 0) ? q.options : getDefaultOptions(q.header, q.question);
          const matched = qOpts.filter((o) => split.includes(o.label)).map((o) => o.label);
          if (matched.length > 0) {
            initialPicked[idx] = matched;
          } else if (matching.answer !== 'ไม่ระบุ' && matching.answer !== 'Not specified') {
            initialCustom[idx] = matching.answer;
          }
        }
      });
      setPicked(initialPicked);
      setCustom(initialCustom);
    }
  }, [savedAnswers, questions]);

  const isViewOnly = Boolean(isAnswered || submitted);
  const isThai = questions.some((q) => /[\u0E00-\u0E7F]/.test(`${q.header} ${q.question}`));

  const toggle = (index: number, label: string, multiSelect?: boolean) => {
    if (isViewOnly || disabled) return;
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

  const handleCustomChange = (index: number, value: string) => {
    if (isViewOnly || disabled) return;
    setCustom((prev) => ({ ...prev, [index]: value }));
  };

  const answerFor = (index: number) => {
    const customText = (custom[index] ?? '').trim();
    const pickedOptions = picked[index] ?? [];
    if (customText.length > 0) return customText;
    if (pickedOptions.length > 0) return pickedOptions.join(', ');
    return '';
  };

  const isQuestionAnswered = (index: number) => {
    const customText = (custom[index] ?? '').trim();
    const pickedOptions = picked[index] ?? [];
    return customText.length > 0 || pickedOptions.length > 0;
  };

  const answeredCount = questions.filter((_, idx) => isQuestionAnswered(idx)).length;

  const compileAnswers = (): ClarifyAnswer[] => {
    return questions
      .map((item, index) => {
        let ans = answerFor(index);
        if (!ans) {
          // If unselected, fallback to first option or "ไม่ระบุ"
          const qOpts = (item.options && item.options.length > 0) ? item.options : getDefaultOptions(item.header, item.question);
          ans = qOpts[0]?.label || (isThai ? 'ไม่ระบุ' : 'Not specified');
        }
        return {
          header: item.header,
          answer: ans,
        };
      })
      .filter((a) => a.answer.length > 0);
  };

  const handleSubmit = () => {
    if (disabled || isViewOnly || answeredCount === 0) return;
    const finalAnswers = compileAnswers();
    if (finalAnswers.length === 0) return;
    setSubmitted(true);
    onSubmit(finalAnswers);
  };

  // If already answered or view-only, render a clean scannable executive summary
  if (isViewOnly) {
    return (
      <div className="doorare-clarify-card decided">
        <div className="doorare-clarify-top-row">
          <div className="doorare-clarify-title">
            <span className="doorare-clarify-dot answered" />
            <span>{isThai ? 'ข้อมูลที่ระบุสำหรับการดำเนินการ' : 'Submitted Information'}</span>
          </div>
          <span className="doorare-clarify-step-badge answered">
            ✓ {isThai ? 'บันทึกแล้ว' : 'Saved'}
          </span>
        </div>

        <div className="doorare-clarify-summary-list">
          {questions.map((item, index) => {
            const matching = savedAnswers?.find(
              (a) =>
                a.header === item.header ||
                a.header.toLowerCase().includes(item.header.toLowerCase()) ||
                item.header.toLowerCase().includes(a.header.toLowerCase()),
            );
            const ans =
              matching?.answer ||
              savedAnswers?.[index]?.answer ||
              answerFor(index) ||
              (isThai ? 'ไม่ระบุ' : 'Not specified');
            return (
              <div key={`${item.header}-${index}`} className="doorare-clarify-summary-item">
                <span className="doorare-clarify-summary-num">{index + 1}</span>
                <span className="doorare-clarify-summary-label">{item.header}:</span>
                <span className="doorare-clarify-summary-value">{ans}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="doorare-clarify-card">
      {/* Title & Badge */}
      <div className="doorare-clarify-top-row">
        <div className="doorare-clarify-title">
          <span className="doorare-clarify-dot" />
          <span>{isThai ? 'Copilot ขอข้อมูลเพิ่มเติมเพื่อดำเนินการต่อ' : 'Copilot needs more information'}</span>
        </div>
        <span className="doorare-clarify-step-badge">
          {isThai ? `${answeredCount}/${questions.length} ข้อ` : `${answeredCount}/${questions.length} answered`}
        </span>
      </div>

      {/* Unified All-in-One Questions List (No Stepper Tabs, No Horizontal Scrollbar) */}
      <div className="doorare-clarify-questions-list">
        {questions.map((item, index) => {
          const effectiveOptions = (item.options && item.options.length > 0)
            ? item.options
            : getDefaultOptions(item.header, item.question);
          const pickedCurrent = picked[index] ?? [];

          return (
            <div className="doorare-clarify-question-block" key={`${item.header}-${index}`}>
              <div className="doorare-clarify-question-header-row">
                <span className="doorare-clarify-q-badge">{index + 1}</span>
                <div className="doorare-clarify-header-col">
                  <div className="doorare-clarify-header">{item.header}</div>
                  <div className="doorare-clarify-text">{item.question}</div>
                </div>
              </div>

              {/* Clickable Choice Pills */}
              {effectiveOptions.length > 0 && (
                <div className="doorare-clarify-options">
                  {effectiveOptions.map((option) => {
                    const selected = pickedCurrent.includes(option.label);
                    return (
                      <button
                        type="button"
                        key={option.label}
                        className={`doorare-clarify-option ${selected ? 'selected' : ''}`}
                        onClick={() => toggle(index, option.label, item.multiSelect)}
                        disabled={disabled}
                      >
                        <span className="doorare-clarify-option-label">
                          {selected ? '✓ ' : ''}{option.label}
                        </span>
                        {option.description && (
                          <span className="doorare-clarify-option-desc">{option.description}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Optional Custom Input */}
              {item.allowFreeText !== false && (
                <input
                  className="doorare-clarify-input"
                  placeholder={isThai ? 'หรือพิมพ์คำตอบเอง...' : 'Or type your own answer...'}
                  value={custom[index] ?? ''}
                  disabled={disabled}
                  onChange={(e) => handleCustomChange(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Action Row */}
      <div className="doorare-clarify-actions">
        <button
          type="button"
          className="doorare-clarify-submit"
          onClick={handleSubmit}
          disabled={disabled || answeredCount === 0}
          title={answeredCount === 0 ? (isThai ? 'กรุณาเลือกหรือระบุข้อมูลอย่างน้อย 1 ข้อ' : 'Please answer at least one question') : ''}
        >
          {isThai ? 'ส่งข้อมูลให้ Copilot ดำเนินการต่อ →' : 'Submit Answers & Continue →'}
        </button>
      </div>
    </div>
  );
};
