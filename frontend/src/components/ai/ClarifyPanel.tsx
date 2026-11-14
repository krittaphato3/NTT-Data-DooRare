import React, { useState } from 'react';
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
      { label: 'Paracetamol tablet 500 mg', description: 'ยาเม็ดบรรเทาปวด ลดไข้ 500 มก.' },
      { label: 'Paracetamol syrup 120 mg/5 mL', description: 'ยาน้ำสำหรับเด็ก' },
      { label: 'ยาฉีด (Injection / IV)', description: 'สารละลายสำหรับหยดทางหลอดเลือดดำ' },
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
 * The stepped clarify panel: when the copilot needs information, it asks all required questions in ONE card.
 * The operator can answer and click to go to the next question, or jump between questions via stepper tabs,
 * and submit all answers on the last question in a single turn.
 * Once submitted, the card becomes view-only without sending buttons.
 */
export const ClarifyPanel: React.FC<ClarifyPanelProps> = ({
  questions,
  disabled,
  isAnswered,
  savedAnswers,
  onSubmit,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

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

  const [skipped, setSkipped] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const isViewOnly = Boolean(isAnswered || submitted);
  const isMulti = questions.length > 1;
  const isThai = questions.some((q) => /[\u0E00-\u0E7F]/.test(`${q.header} ${q.question}`));

  // Safe active question index
  const activeIndex = Math.min(Math.max(0, currentStep), questions.length - 1);
  const isLastQuestion = activeIndex === questions.length - 1;
  const q = questions[activeIndex];

  // Guaranteed options with fallback
  const effectiveOptions = q
    ? (q.options && q.options.length > 0)
      ? q.options
      : getDefaultOptions(q.header, q.question)
    : [];

  // A question is answered if at least one choice is picked OR custom input has at least one character
  const isQuestionAnswered = (index: number) => {
    const customText = (custom[index] ?? '').trim();
    const pickedOptions = picked[index] ?? [];
    return customText.length > 0 || pickedOptions.length > 0;
  };

  const isQuestionSkipped = (index: number) => Boolean(skipped[index]);

  const isCurrentAnswered = isQuestionAnswered(activeIndex);

  const toggle = (index: number, label: string, multiSelect?: boolean) => {
    if (isViewOnly || disabled) return;
    // If it was previously marked as skipped, unskip upon selecting an option
    if (skipped[index]) {
      setSkipped((prev) => ({ ...prev, [index]: false }));
    }
    setPicked((prev) => {
      const current = prev[index] ?? [];
      if (multiSelect) {
        return {
          ...prev,
          [index]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label],
        };
      }
      return { ...prev, [index]: [label] };
    });

    // QOL: Automatically advance to next question on single choice selection when not on the last question
    if (!multiSelect && !isLastQuestion) {
      setTimeout(() => {
        setCurrentStep((prev) => Math.min(prev + 1, questions.length - 1));
      }, 180);
    }
  };

  const handleCustomChange = (index: number, value: string) => {
    if (isViewOnly || disabled) return;
    // If it was previously marked as skipped, unskip upon typing
    if (skipped[index] && value.trim().length > 0) {
      setSkipped((prev) => ({ ...prev, [index]: false }));
    }
    setCustom((prev) => ({ ...prev, [index]: value }));
  };

  const answerFor = (index: number, skippedState = skipped) => {
    const customText = (custom[index] ?? '').trim();
    const pickedOptions = picked[index] ?? [];
    if (customText.length > 0) return customText;
    if (pickedOptions.length > 0) return pickedOptions.join(', ');
    if (skippedState[index]) return isThai ? 'ไม่ระบุ' : 'Not specified';
    return '';
  };

  const compileAnswers = (skippedState = skipped): ClarifyAnswer[] => {
    return questions
      .map((item, index) => ({
        header: item.header,
        answer: answerFor(index, skippedState),
      }))
      .filter((a) => a.answer.length > 0);
  };

  const submitAll = (overrideSkipped?: Record<number, boolean>) => {
    if (disabled || isViewOnly) return;
    const finalAnswers = compileAnswers(overrideSkipped ?? skipped);
    if (finalAnswers.length === 0) return;
    setSubmitted(true);
    onSubmit(finalAnswers);
  };

  const handleNext = () => {
    if (disabled || isViewOnly || !isCurrentAnswered) return;
    if (isMulti && !isLastQuestion) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    if (disabled || isViewOnly) return;
    const updatedSkipped = { ...skipped, [activeIndex]: true };
    setSkipped(updatedSkipped);

    if (isMulti && !isLastQuestion) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Last question or only question: compile and submit immediately
      submitAll(updatedSkipped);
    }
  };

  const handleSubmit = () => {
    if (disabled || isViewOnly || !isCurrentAnswered) return;
    submitAll();
  };

  return (
    <div className="doorare-clarify-card">
      {/* Title & Step Header */}
      <div className="doorare-clarify-top-row">
        <div className="doorare-clarify-title">
          <span className="doorare-clarify-dot" />
          <span>{isThai ? 'Copilot ขอข้อมูลเพิ่มเติม' : 'Copilot needs more information'}</span>
        </div>
        {isMulti && (
          <span className="doorare-clarify-step-badge">
            {isThai ? `ข้อที่ ${activeIndex + 1} จาก ${questions.length}` : `Question ${activeIndex + 1} of ${questions.length}`}
          </span>
        )}
      </div>

      {/* Stepper Tabs (when multiple questions) */}
      {isMulti && (
        <div className="doorare-clarify-stepper">
          {questions.map((item, idx) => {
            const hasAnswer = isQuestionAnswered(idx);
            const isSkipped = isQuestionSkipped(idx);
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${item.header}-${idx}`}
                type="button"
                className={`doorare-clarify-step-tab ${isActive ? 'active' : ''} ${hasAnswer ? 'answered' : ''} ${isSkipped ? 'skipped' : ''}`}
                onClick={() => setCurrentStep(idx)}
                disabled={disabled}
                title={item.header}
              >
                <span className="doorare-step-tab-num">
                  {hasAnswer ? '✓' : isSkipped ? '–' : idx + 1}
                </span>
                <span className="doorare-step-tab-text">{item.header}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Question Display */}
      {q && (
        <div className="doorare-clarify-question" key={`${q.header}-${activeIndex}`}>
          <div className="doorare-clarify-header">{q.header}</div>
          <div className="doorare-clarify-text">{q.question}</div>

          {effectiveOptions && effectiveOptions.length > 0 && (
            <div className="doorare-clarify-options">
              {effectiveOptions.map((option) => {
                const selected = (picked[activeIndex] ?? []).includes(option.label);
                return (
                  <button
                    type="button"
                    key={option.label}
                    className={`doorare-clarify-option ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      toggle(activeIndex, option.label, q.multiSelect);
                    }}
                    disabled={disabled || isViewOnly}
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
              placeholder={
                isViewOnly
                  ? isThai
                    ? 'คำตอบที่ระบุไว้'
                    : 'Submitted answer'
                  : isThai
                    ? 'หรือพิมพ์คำตอบเอง...'
                    : 'Or type your own answer...'
              }
              value={custom[activeIndex] ?? ''}
              disabled={disabled || isViewOnly}
              onChange={(e) => handleCustomChange(activeIndex, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!isLastQuestion) {
                    handleNext();
                  } else {
                    handleSubmit();
                  }
                }
              }}
            />
          )}
        </div>
      )}

      {/* Navigation & Submission Controls */}
      <div className="doorare-clarify-actions">
        {isViewOnly ? (
          <div className="doorare-clarify-submitted-banner">
            <span className="doorare-clarify-submitted-icon">✓</span>
            <span>{isThai ? 'ส่งคำตอบแล้ว' : 'Answers submitted'}</span>
            {isMulti && activeIndex > 0 && (
              <button
                type="button"
                className="doorare-clarify-nav-btn back"
                style={{ marginLeft: 12 }}
                onClick={() => setCurrentStep((prev) => prev - 1)}
              >
                {isThai ? '← ดูข้อย้อนหลัง' : '← Previous'}
              </button>
            )}
            {isMulti && activeIndex < questions.length - 1 && (
              <button
                type="button"
                className="doorare-clarify-nav-btn next"
                style={{ marginLeft: isMulti && activeIndex > 0 ? 6 : 12 }}
                onClick={() => setCurrentStep((prev) => prev + 1)}
              >
                {isThai ? 'ดูข้อถัดไป →' : 'Next →'}
              </button>
            )}
          </div>
        ) : (
          <>
            {isMulti && activeIndex > 0 && (
              <button
                type="button"
                className="doorare-clarify-nav-btn back"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                disabled={disabled}
              >
                {isThai ? '← ย้อนกลับ' : '← Back'}
              </button>
            )}

            <button
              type="button"
              className="doorare-clarify-nav-btn skip"
              onClick={handleSkip}
              disabled={disabled}
              title={isThai ? 'ข้ามข้อนี้หากไม่ทราบข้อมูล' : 'Skip this question if unsure'}
            >
              {isThai ? 'ข้าม (ไม่ระบุ)' : 'Skip'}
            </button>

            {!isLastQuestion ? (
              <button
                type="button"
                className="doorare-clarify-nav-btn next"
                onClick={handleNext}
                disabled={disabled || !isCurrentAnswered}
                title={!isCurrentAnswered ? (isThai ? 'กรุณาเลือกหรือพิมพ์คำตอบก่อนไปข้อถัดไป หรือกดข้าม' : 'Please answer or skip before continuing') : ''}
              >
                {isThai ? 'ข้อถัดไป →' : 'Next Question →'}
              </button>
            ) : (
              <button
                type="button"
                className="doorare-clarify-submit"
                onClick={handleSubmit}
                disabled={disabled || !isCurrentAnswered}
                title={!isCurrentAnswered ? (isThai ? 'กรุณาเลือกหรือพิมพ์คำตอบก่อนส่ง' : 'Please answer or skip before submitting') : ''}
              >
                {isThai ? (isMulti ? 'ส่งคำตอบทั้งหมด' : 'ส่งคำตอบ') : (isMulti ? 'Submit All Answers' : 'Submit Answer')}
              </button>
            )}

            {isMulti && (
              <span className="doorare-clarify-hint">
                {isThai
                  ? `ตอบแล้ว ${questions.filter((_, i) => isQuestionAnswered(i) || isQuestionSkipped(i)).length} จาก ${questions.length} ข้อ`
                  : `${questions.filter((_, i) => isQuestionAnswered(i) || isQuestionSkipped(i)).length} of ${questions.length} answered`}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
