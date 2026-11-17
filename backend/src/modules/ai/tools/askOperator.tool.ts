import { z } from 'zod';
import { query } from '../../../db/client.js';
import type { IAgentTool, ToolResult } from './tool.types.js';

export interface ClarifyQuestionOption {
  label: string;
  description?: string;
}

/**
 * Returns sensible clinical default options if the LLM omitted options for a question.
 * Only returns real items present in the Health Region 6 database.
 */
export function getDefaultClarifyOptions(header?: string, question?: string): ClarifyQuestionOption[] {
  const combined = `${header || ''} ${question || ''}`.toLowerCase();
  if (combined.includes('พารา') || combined.includes('paracetamol')) {
    return [
      { label: 'Paracetamol tablet 500 mg', description: 'ยาเม็ดบรรเทาปวด ลดไข้ 500 มก.' },
      { label: 'Paracetamol syrup 120 mg/5 mL', description: 'ยาน้ำสำหรับเด็ก 120 มก./5 มล.' },
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
      { label: 'Paracetamol syrup 120 mg/5 mL', description: 'ยาน้ำสำหรับเด็ก 120 มก./5 มล.' },
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
  if (
    combined.includes('eta') ||
    combined.includes('เวลาเดินทาง') ||
    combined.includes('เวลาที่มาถึง') ||
    combined.includes('มาถึง') ||
    combined.includes('arrival') ||
    combined.includes('transit') ||
    combined.includes('lead time')
  ) {
    return [
      { label: 'ทีมกู้ชีพ EMS นำส่ง (~15-30 นาที)', description: 'รถพยาบาลฉุกเฉินกำลังนำส่งผู้ป่วยมายังห้องฉุกเฉิน' },
      { label: 'รับส่งต่อจาก รพ.ชุมชน (~45-60 นาที)', description: 'การส่งต่อผู้ป่วยวิกฤตระหว่างโรงพยาบาลในเครือข่าย' },
      { label: 'ผู้ป่วยมาถึงห้องฉุกเฉินแล้ว (Immediate)', description: 'ผู้ป่วยถึงจุดคัดแยก ER หรือเดินเข้ามารับการรักษาแล้ว' },
      { label: 'ยังไม่ทราบ ETA แน่ชัด (ประเมินตามระบบ)', description: 'บันทึกสถานะ ETA_UNAVAILABLE และประสานงานวิทยุสื่อสาร' },
    ];
  }
  if (
    combined.includes('ผู้บาดเจ็บ') ||
    combined.includes('ผู้ป่วย') ||
    combined.includes('casualt') ||
    combined.includes('patient') ||
    combined.includes('triage') ||
    combined.includes('คัดแยก') ||
    combined.includes('สีแดง') ||
    combined.includes('แดง') ||
    combined.includes('เหลือง')
  ) {
    return [
      { label: 'แดง 1-2 ราย, เหลือง 3-5 ราย', description: 'อุบัติเหตุทั่วไป / ผู้บาดเจ็บวิกฤตจำนวนจำกัด' },
      { label: 'แดง 3-5 ราย, เหลือง 5-10 ราย', description: 'อุบัติเหตุหมู่ระดับกลาง / ภัยพิบัติในเขตรับผิดชอบ' },
      { label: 'แดง > 5 ราย, เหลือง > 10 ราย', description: 'อุบัติเหตุหมู่รุนแรง / สาธารณภัยระดับเขต' },
      { label: 'ยังไม่ทราบยอดแน่ชัด (ประเมินขั้นต่ำ: แดง 1, เหลือง 2)', description: 'เปิดแผนเวชภัณฑ์ขั้นต่ำเบื้องต้นเพื่อเตรียมพร้อม' },
    ];
  }
  if (
    combined.includes('ประเภทเหตุการณ์') ||
    combined.includes('incident type') ||
    combined.includes('ประเภทเหตุ') ||
    combined.includes('ลักษณะเหตุ') ||
    combined.includes('อุบัติเหตุ') ||
    combined.includes('สาธารณภัย')
  ) {
    return [
      { label: 'อุบัติเหตุหมู่ / บาดเจ็บรุนแรง (Mass Trauma)', description: 'อุบัติเหตุจราจร, อาคารถล่ม, บาดเจ็บหลายระบบ' },
      { label: 'สารเคมีรั่วไหล / วัตถุอันตราย (Hazardous / Hazmat)', description: 'สารพิษอุตสาหกรรม, ออร์กาโนฟอสเฟต, แก๊สพิษ' },
      { label: 'อัคคีภัย / แผลไหม้รุนแรง (Major Fire / Burn)', description: 'ไฟไหม้, แผลไฟไหม้บริเวณกว้าง, ภาวะสำลักควัน' },
      { label: 'ผู้ป่วยวิกฤตเฉพาะราย / พิษงู (Snakebite / Toxidrome)', description: 'ถูกงูพิษกัด, ภาวะเป็นพิษเฉียบพลัน, ต้องการเซรุ่มด่วน' },
    ];
  }
  if (
    combined.includes('อุณหภูมิ') ||
    combined.includes('cold chain') ||
    combined.includes('แช่เย็น') ||
    combined.includes('temperature')
  ) {
    return [
      { label: 'ควบคุมอุณหภูมิ 2-8°C (Cold Chain)', description: 'สำหรับวัคซีน, เซรุ่ม, เลือด, หรือชีววัตถุ' },
      { label: 'อุณหภูมิห้องปกติ (Room Temperature)', description: 'เวชภัณฑ์ทั่วไปที่ไม่ต้องแช่เย็น' },
    ];
  }
  return [];
}

/**
 * Normalizes an option item:
 * Supports string "Choice A" -> { label: "Choice A" }
 * Supports object { label: "Choice A", description?: "..." }
 * Supports alternate keys: text, value, title, name, choice
 */
const OptionSchema = z.union([
  z.string().transform((val) => ({ label: val.trim() })),
  z.object({
    label: z.string().min(1).max(200).describe('A choice the operator can click'),
    description: z.string().max(300).optional().describe('One line explaining the choice'),
  }),
  z.record(z.string(), z.unknown()).transform((val) => {
    const label = val.label ?? val.text ?? val.value ?? val.title ?? val.name ?? val.choice ?? '';
    const description = val.description ?? val.desc;
    return {
      label: String(label || '').trim(),
      description: description ? String(description).trim() : undefined,
    };
  }),
]);

/**
 * Normalizes a question item:
 * Allows header to be string (auto-sliced if long, auto-derived if omitted)
 * Accepts options or choices as array of strings, objects, or comma-separated string
 */
const QuestionSchema = z
  .object({
    header: z.string().optional(),
    title: z.string().optional(),
    label: z.string().optional(),
    question: z.string().optional(),
    prompt: z.string().optional(),
    text: z.string().optional(),
    options: z
      .union([
        z.array(OptionSchema),
        z.string().transform((val) =>
          val
            .split(/[,|\n]/)
            .map((s) => ({ label: s.trim() }))
            .filter((o) => o.label.length > 0),
        ),
      ])
      .optional(),
    choices: z
      .union([
        z.array(OptionSchema),
        z.string().transform((val) =>
          val
            .split(/[,|\n]/)
            .map((s) => ({ label: s.trim() }))
            .filter((o) => o.label.length > 0),
        ),
      ])
      .optional(),
    items: z.array(OptionSchema).optional(),
    allowFreeText: z.boolean().optional().default(true).describe('Show the custom answer field (default true)'),
    multiSelect: z.boolean().optional().default(false).describe('Allow several choices at once (default false)'),
  })
  .transform((val) => {
    const rawQuestion = String(val.question || val.prompt || val.text || val.title || '').trim();
    const rawHeader = String(val.header || val.title || val.label || (rawQuestion.length > 30 ? rawQuestion.slice(0, 30) : rawQuestion) || 'คำถาม').trim().slice(0, 50);
    const combinedOptions = (val.options && val.options.length > 0)
      ? val.options
      : (val.choices && val.choices.length > 0)
        ? val.choices
        : (val.items && val.items.length > 0)
          ? val.items
          : [];

    let options = combinedOptions.filter((o) => Boolean(o.label));
    if (options.length === 0) {
      options = getDefaultClarifyOptions(rawHeader, rawQuestion);
    }

    return {
      header: rawHeader || 'คำถาม',
      question: rawQuestion || 'กรุณาระบุข้อมูลเพิ่มเติม',
      options: options.slice(0, 8),
      allowFreeText: val.allowFreeText !== false,
      multiSelect: Boolean(val.multiSelect),
    };
  });

/**
 * Tool: ask_operator
 * The escape hatch for every other tool. Instead of guessing a required value (or retrying a call that the schema just
 * rejected) the model asks the operator a short question, rendered as a panel with clickable choices and a free-text
 * answer. The turn ends there; the answer comes back as the next user message, and the model continues with real values.
 */
export const askOperatorTool: IAgentTool<{
  questions?: any[];
  question?: string;
  header?: string;
  options?: any[];
  choices?: any[];
  allowFreeText?: boolean;
  multiSelect?: boolean;
}> = {
  name: 'ask_operator',
  description: `Asks the operator clarifying questions and stops the turn. The UI renders an interactive stepped card with clickable choices plus a custom answer field.
Use it when an operator request is underspecified (missing formulation, lender hospital, quantity, or urgency), or when a tool rejected your arguments.
CRITICAL MULTI-QUESTION & CHOICES RULE: When clarifying an underspecified request, provide ALL necessary questions in this single call (2–3 questions in the questions array).
FOR EVERY QUESTION, YOU MUST ALWAYS PROVIDE 2 TO 4 CLICKABLE CHOICES in the 'options' field (e.g. ["Paracetamol tablet 500 mg", "Paracetamol syrup 120 mg/5 mL"] or ["ให้ระบบจัดอันดับโรงพยาบาลที่เหมาะสมที่สุดอัตโนมัติ", "รพ.สมุทรปราการ"]). NEVER omit options or provide an empty options array.
CRITICAL LANGUAGE RULE: Always generate questions, headers, and option choices in the exact same language the operator prompted in (e.g., Thai if the operator prompt is in Thai, English if the operator prompt is in English).
Shape: {"questions":[{"header":"ขนาดยาที่ต้องการ","question":"ต้องการยืมยาความแรงเท่าใด?","options":["500 mg tablets","syrup 120 mg/5 mL"]},{"header":"โรงพยาบาลผู้ให้ยืม","question":"ต้องการยืมจาก รพ. ใด?","options":["ให้ระบบจัดอันดับโรงพยาบาลที่เหมาะสมที่สุดอัตโนมัติ","รพ.สมุทรปราการ"]}]}
Rules: 1–3 questions, at most 6 options each. After calling this, stop — do not call more tools in the same turn.`,
  parameters: z.object({
    questions: z.array(QuestionSchema).optional().describe('Questions to show in the panel. Each question must include recommended clickable options.'),
    question: z.string().optional().describe('Single question if questions array is omitted'),
    header: z.string().optional().describe('Header for single question'),
    options: z.union([
      z.array(OptionSchema),
      z.string().transform((val) => val.split(/[,|\n]/).map((s) => ({ label: s.trim() })).filter((o) => o.label.length > 0)),
    ]).optional().describe('Choices for single question'),
    choices: z.union([
      z.array(OptionSchema),
      z.string().transform((val) => val.split(/[,|\n]/).map((s) => ({ label: s.trim() })).filter((o) => o.label.length > 0)),
    ]).optional().describe('Alias for options'),
    allowFreeText: z.boolean().optional().default(true).describe('Show the custom answer field'),
    multiSelect: z.boolean().optional().default(false).describe('Allow several choices at once'),
  }),
  allowedRoles: ['*'],
  execute: async (args: any): Promise<ToolResult> => {
    let rawQuestions: any[] = [];
    if (Array.isArray(args?.questions) && args.questions.length > 0) {
      rawQuestions = args.questions;
    } else if (args?.question || args?.prompt) {
      rawQuestions = [args];
    }

    const questions = (await Promise.all(
      rawQuestions.map(async (q: any) => {
        const question = String(q.question || q.prompt || q.text || q.title || '').trim();
        const header = String(q.header || q.title || q.label || (question.length > 30 ? question.slice(0, 30) : question) || 'คำถาม').trim().slice(0, 50);
        const rawOptions = (Array.isArray(q.options) && q.options.length > 0)
          ? q.options
          : (Array.isArray(q.choices) && q.choices.length > 0)
            ? q.choices
            : (Array.isArray(q.items) && q.items.length > 0)
              ? q.items
              : (typeof q.options === 'string')
                ? q.options.split(/[,|\n]/).map((s: string) => ({ label: s.trim() }))
                : (typeof q.choices === 'string')
                  ? q.choices.split(/[,|\n]/).map((s: string) => ({ label: s.trim() }))
                  : [];

        let options = rawOptions
          .map((opt: any) => {
            if (typeof opt === 'string') return { label: opt.trim() };
            return {
              label: String(opt?.label || opt?.text || opt?.value || opt?.name || opt?.choice || '').trim(),
              description: opt?.description ? String(opt.description).trim() : undefined,
            };
          })
          .filter((opt: any) => Boolean(opt.label))
          .slice(0, 8);

        // Grounding: If the question is about drug formulation / strength, check drug_master
        // to strictly restrict choices to real database items (eliminates hallucinated options like drops/IV)
        const combined = `${header} ${question}`.toLowerCase();
        const isDrugQuestion =
          combined.includes('รูปแบบ') ||
          combined.includes('ความแรง') ||
          combined.includes('ขนาดยา') ||
          combined.includes('dosage') ||
          combined.includes('strength') ||
          combined.includes('formulation') ||
          combined.includes('พารา') ||
          combined.includes('paracetamol');

        if (isDrugQuestion) {
          try {
            const drugKeywords = ['para', 'paracetamol', 'พารา', 'morphine', 'มอร์ฟีน', 'pethidine', 'เพทิดีน', 'fentanyl', 'เฟนทานิล', 'albumin', 'อัลบูมิน'];
            let matchedKw = '';
            for (const kw of drugKeywords) {
              if (combined.includes(kw)) {
                matchedKw = kw === 'พารา' ? 'paracetamol' : kw === 'มอร์ฟีน' ? 'morphine' : kw === 'เพทิดีน' ? 'pethidine' : kw === 'เฟนทานิล' ? 'fentanyl' : kw === 'อัลบูมิน' ? 'albumin' : kw;
                break;
              }
            }
            if (matchedKw) {
              const dmRes = await query<{
                id: string;
                generic_name: string;
                strength: string;
                dosage_form: string;
                base_unit: string;
              }>(
                `SELECT id, generic_name, strength, dosage_form, base_unit,
                        concat_ws(' ', generic_name, strength, dosage_form) AS full_name
                   FROM drug_master
                  WHERE generic_name ILIKE $1
                  ORDER BY strength`,
                [`%${matchedKw}%`],
              );
              if (dmRes.rows.length > 0) {
                // Strictly overwrite options with real database items
                options = dmRes.rows.map((r) => ({
                  label: `${r.generic_name} ${r.strength} (${r.dosage_form})`,
                  description: `ขนาด ${r.strength} รูปแบบ ${r.dosage_form} (หน่วย: ${r.base_unit})`,
                }));
              }
            }
          } catch {
            // fallback to normalized options
          }
        }

        if (options.length === 0) {
          options = getDefaultClarifyOptions(header, question);
        }

        return {
          header: header || 'คำถาม',
          question: question || 'กรุณาระบุข้อมูลเพิ่มเติม',
          options,
          allowFreeText: q.allowFreeText !== false,
          multiSelect: Boolean(q.multiSelect),
        };
      })
    )).filter((q: any) => Boolean(q.question));

    if (questions.length === 0) {
      return { success: false, error: 'ask_operator needs at least one question.' };
    }

    return {
      success: true,
      data: { asked: questions.length },
      question: { questions },
    };
  },
};
