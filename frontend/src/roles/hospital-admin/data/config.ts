/** Configuration fixtures for UI-17 / API-AD-001-002 and the per-drug editor / API-F1a-004.
 *
 *  Source of truth: `specification/config-defaults.yaml` (file defaults) and
 *  `specification/10-security-nfr-stack.md` §23 (groups, lookup order HOSPITAL → REGION → GLOBAL →
 *  default, and the rule that `borrow.score.*`, `ved.z.*`, `agent.*` need REGION_ADMIN or above).
 *  Storage shape mirrors `config_setting (key, scope, value jsonb, …)` in `specification/schema.sql`.
 */

import type { RoleCode } from '../../../lib/rbac';

/** `config_setting.scope` — the schema stores `GLOBAL | REGION:<id> | HOSPITAL:<id>`.
 *  `DEFAULT` is a UI-only kind: the effective value comes from the file default (no stored row). */
export type ConfigScope = 'GLOBAL' | 'REGION' | 'HOSPITAL' | 'DEFAULT';

/** Scalar value kinds the screen can edit; structured defaults are flattened to dotted scalar keys. */
export type ConfigValue = number | boolean | string;
export type ConfigValueType = 'number' | 'boolean' | 'text';

export interface ConfigKey {
  /** Dotted key as stored in `config_setting.key`, e.g. `forecast.cv_threshold`. */
  key: string;
  labelTh: string;
  labelEn: string;
  type: ConfigValueType;
  unit?: string;
  /** Effective scope after the HOSPITAL → REGION → GLOBAL → file-default lookup (§23). */
  scope: ConfigScope;
  /** Effective value in use at โรงพยาบาลสมุทรปราการ. */
  value: ConfigValue;
  /** `config-defaults.yaml` value — the last link of the lookup chain. */
  fileDefault: ConfigValue;
  /** Bounds where the source states them; guards the input. */
  min?: number;
  max?: number;
  description: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ConfigGroup {
  id: string;
  labelTh: string;
  labelEn: string;
  /** Rule IDs from §23 for traceability. */
  code: string;
}

export interface ConfigSection extends ConfigGroup {
  keys: ConfigKey[];
}

const SYSDEF = 'ยังไม่แก้ (ใช้ค่าเริ่มต้น)';

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: 'forecast', labelTh: 'การพยากรณ์', labelEn: 'Forecast', code: 'BR-F1a · §23',
    keys: [
      { key: 'forecast.min_history_days_cold_start', labelTh: 'ประวัติขั้นต่ำสำหรับ cold start', labelEn: 'Min history days (cold start)', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 90, fileDefault: 90, min: 0, description: 'ต่ำกว่านี้ใช้ pooled model และติดธง LOW_CONFIDENCE', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.cv_threshold', labelTh: 'เกณฑ์ CV แยก volatile', labelEn: 'CV threshold', type: 'number', scope: 'HOSPITAL', value: 0.5, fileDefault: 0.5, min: 0, max: 10, description: 'CV เกินค่านี้ถือว่า demand ผันผวน', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.active_day_ratio_threshold', labelTh: 'สัดส่วนวันที่มีการใช้', labelEn: 'Active-day ratio threshold', type: 'number', scope: 'HOSPITAL', value: 0.3, fileDefault: 0.3, min: 0, max: 1, description: 'ต่ำกว่านี้ถือว่าใช้เป็นครั้งคราว (Q-01)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.price_high_thb', labelTh: 'เกณฑ์ราคาสูง', labelEn: 'Price high', type: 'number', unit: 'บาท', scope: 'HOSPITAL', value: 1000, fileDefault: 1000, min: 0, description: 'ใช้จัดกลุ่มราคาสูง/ต่ำตาม ASM-33', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.price_low_thb', labelTh: 'เกณฑ์ราคาต่ำ', labelEn: 'Price low', type: 'number', unit: 'บาท', scope: 'HOSPITAL', value: 50, fileDefault: 50, min: 0, description: 'ใช้จัดกลุ่มราคาสูง/ต่ำตาม ASM-33', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.stale_days', labelTh: 'จำนวนวันถือว่าข้อมูลเก่า', labelEn: 'Stale days', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 7, fileDefault: 7, min: 0, description: 'ไม่มีการใช้เข้าระบบเกินค่านี้ = STALE · ไม่สร้าง alert (ASM-37)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.coverage_tolerance', labelTh: 'ค่าคลาดเคลื่อนที่ยอมรับ (coverage)', labelEn: 'Coverage tolerance', type: 'number', scope: 'HOSPITAL', value: 0.05, fileDefault: 0.05, min: 0, max: 1, description: 'เกณฑ์ตรวจ P90/P95 ในการประเมินโมเดล', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'forecast.overstock_multiple', labelTh: 'ตัวคูณตัดสิน overstock', labelEn: 'Overstock multiple', type: 'number', unit: 'เท่า', scope: 'HOSPITAL', value: 2, fileDefault: 2, min: 1, description: 'สต็อกเกิน Total Target เท่านี้ถือว่า overstock', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'ved_abc', labelTh: 'การจัดกลุ่ม VED / ABC', labelEn: 'VED / ABC', code: 'BR-F1a · §23',
    keys: [
      { key: 'ved.z.V', labelTh: 'ค่า Z ระดับ V (Vital)', labelEn: 'Z · V', type: 'number', scope: 'HOSPITAL', value: 1.65, fileDefault: 1.65, min: 0, max: 5, description: 'ตัวคูณ σ สำหรับยาจำเป็นวิกฤต', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'ved.z.E', labelTh: 'ค่า Z ระดับ E (Essential)', labelEn: 'Z · E', type: 'number', scope: 'HOSPITAL', value: 1.28, fileDefault: 1.28, min: 0, max: 5, description: 'ตัวคูณ σ สำหรับยาจำเป็น', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'ved.z.D', labelTh: 'ค่า Z ระดับ D (Desirable)', labelEn: 'Z · D', type: 'number', scope: 'HOSPITAL', value: 0, fileDefault: 0, min: 0, max: 5, description: 'ยาระดับ D ไม่เข้า borrow agent', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'ved.quantile.V', labelTh: 'Quantile ระดับ V', labelEn: 'Quantile · V', type: 'number', scope: 'HOSPITAL', value: 0.95, fileDefault: 0.95, min: 0.5, max: 1, description: 'ใช้กับวิธี Quantile (P95)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'ved.quantile.E', labelTh: 'Quantile ระดับ E', labelEn: 'Quantile · E', type: 'number', scope: 'HOSPITAL', value: 0.9, fileDefault: 0.9, min: 0.5, max: 1, description: 'ใช้กับวิธี Quantile (P90)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'ved.default_class', labelTh: 'VED เริ่มต้นของยาใหม่', labelEn: 'Default VED class', type: 'text', scope: 'HOSPITAL', value: 'E', fileDefault: 'E', description: 'ยาใหม่เริ่มที่ E จนกว่าเภสัชกรจะกำหนด (ASM-36)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'abc.cutoff_a', labelTh: 'จุดตัด ABC ระดับ A', labelEn: 'ABC cutoff A', type: 'number', scope: 'HOSPITAL', value: 0.7, fileDefault: 0.7, min: 0, max: 1, description: 'สะสมมูลค่าไม่เกินค่านี้ = A (ASM-35)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'abc.cutoff_b', labelTh: 'จุดตัด ABC ระดับ B', labelEn: 'ABC cutoff B', type: 'number', scope: 'HOSPITAL', value: 0.9, fileDefault: 0.9, min: 0, max: 1, description: 'สะสมมูลค่าถึงค่านี้ = B ที่เหลือ = C', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'borrow', labelTh: 'การยืมระหว่างโรงพยาบาล', labelEn: 'Borrowing', code: 'BR-F1b · §23',
    keys: [
      { key: 'borrow.stop_ratio_V', labelTh: 'หยุดเมื่อได้สัดส่วน (V)', labelEn: 'Stop ratio · V', type: 'number', unit: 'เท่า', scope: 'HOSPITAL', value: 0.9, fileDefault: 0.9, min: 0, max: 2, description: 'ยืมครบ 90% ของความต้องการแล้วหยุดหาเจ้าอื่น', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.stop_ratio_E', labelTh: 'หยุดเมื่อได้สัดส่วน (E)', labelEn: 'Stop ratio · E', type: 'number', unit: 'เท่า', scope: 'HOSPITAL', value: 1, fileDefault: 1, min: 0, max: 2, description: 'ยาระดับ E ต้องได้ครบ 100%', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.max_parallel', labelTh: 'จำนวนผู้ให้สูงสุดที่ถามพร้อมกัน', labelEn: 'Max parallel lenders', type: 'number', unit: 'แห่ง', scope: 'REGION', value: 3, fileDefault: 3, min: 1, max: 10, description: 'ส่งพร้อมกันได้ ≤ 3 แห่ง เฉพาะกรณีเร่งด่วนมาก', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'borrow.timeout_min.very_urgent', labelTh: 'เวลาตอบกลับ · เร่งด่วนมาก', labelEn: 'Timeout · very urgent', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 120, fileDefault: 120, min: 60, description: 'ขั้นต่ำ 60 นาที (ASM-32)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.timeout_min.urgent', labelTh: 'เวลาตอบกลับ · เร่งด่วน', labelEn: 'Timeout · urgent', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 360, fileDefault: 360, min: 240, description: 'ขั้นต่ำ 240 นาที (ASM-32)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.timeout_min.normal', labelTh: 'เวลาตอบกลับ · ปกติ', labelEn: 'Timeout · normal', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 2880, fileDefault: 2880, min: 60, description: 'เตือนอีกครั้งที่ 50% ของเวลา', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.reminder_ratio', labelTh: 'สัดส่วนเวลาแจ้งเตือนครั้งที่สอง', labelEn: 'Reminder ratio', type: 'number', scope: 'HOSPITAL', value: 0.5, fileDefault: 0.5, min: 0, max: 1, description: 'เตือนเมื่อผ่านไปครึ่งหนึ่งของเวลา', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.score.w_time', labelTh: 'น้ำหนักคะแนน · เวลา', labelEn: 'Score weight · time', type: 'number', scope: 'HOSPITAL', value: 0.45, fileDefault: 0.45, min: 0, max: 1, description: 'น้ำหนักองค์ประกอบ Si ด้านเวลา', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.score.w_fulfill', labelTh: 'น้ำหนักคะแนน · ความครบถ้วน', labelEn: 'Score weight · fulfilment', type: 'number', scope: 'HOSPITAL', value: 0.28, fileDefault: 0.28, min: 0, max: 1, description: 'น้ำหนักองค์ประกอบ Si ด้านความครบถ้วน', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.score.w_stock_safety', labelTh: 'น้ำหนักคะแนน · ความปลอดภัยสต็อก', labelEn: 'Score weight · stock safety', type: 'number', scope: 'HOSPITAL', value: 0.17, fileDefault: 0.17, min: 0, max: 1, description: 'น้ำหนักองค์ประกอบ Si ด้านความปลอดภัยสต็อกผู้ให้', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.score.w_reliability', labelTh: 'น้ำหนักคะแนน · ความน่าเชื่อถือ', labelEn: 'Score weight · reliability', type: 'number', scope: 'HOSPITAL', value: 0.1, fileDefault: 0.1, min: 0, max: 1, description: 'น้ำหนักองค์ประกอบ Si ด้านประวัติการตอบรับ', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'borrow.lot_min_remaining_days', labelTh: 'อายุคงเหลือขั้นต่ำของล็อตที่ให้ยืม', labelEn: 'Lot min remaining days', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 180, fileDefault: 180, min: 0, description: 'ล็อตที่จะให้ยืมต้องเหลืออายุ ≥ ค่านี้', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'agent', labelTh: 'Agent (AI ผู้ช่วยเสนอแผน)', labelEn: 'Agent', code: '§14 · §23',
    keys: [
      { key: 'agent.enabled', labelTh: 'เปิดใช้งาน Agent', labelEn: 'Agent enabled', type: 'boolean', scope: 'HOSPITAL', value: true, fileDefault: true, description: 'ปิดแล้วระบบใช้ข้อความแม่แบบแทน (สถานะ FALLBACK)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.model_id', labelTh: 'โมเดลสำหรับ F1/F2', labelEn: 'Model ID', type: 'text', scope: 'HOSPITAL', value: 'REPLACE_WITH_BEDROCK_MODEL_ID', fileDefault: 'REPLACE_WITH_BEDROCK_MODEL_ID', description: 'โมเดล Amazon Bedrock ที่ใช้สร้างแผน (ASM-21)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.f3_model_id', labelTh: 'โมเดลสำหรับ F3 (เหตุฉุกเฉิน)', labelEn: 'F3 model ID', type: 'text', scope: 'HOSPITAL', value: 'REPLACE_WITH_SMALL_FAST_BEDROCK_MODEL_ID', fileDefault: 'REPLACE_WITH_SMALL_FAST_BEDROCK_MODEL_ID', description: 'Haiku-class เพื่อความเร็วในเหตุฉุกเฉิน (ASM-46)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.max_steps', labelTh: 'จำนวนขั้นสูงสุดต่อการทำงาน', labelEn: 'Max tool steps', type: 'number', unit: 'ขั้น', scope: 'HOSPITAL', value: 12, fileDefault: 12, min: 1, max: 30, description: 'เพดานการเรียกเครื่องมือต่อ 1 run (ASM-21)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.timeout_s', labelTh: 'เวลาสูงสุด (F1/F2)', labelEn: 'Timeout · F1/F2', type: 'number', unit: 'วินาที', scope: 'HOSPITAL', value: 60, fileDefault: 60, min: 5, description: 'เกินแล้วตกไปใช้แผนจากกฎ', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.f3_timeout_s', labelTh: 'เวลาสูงสุด (F3)', labelEn: 'Timeout · F3', type: 'number', unit: 'วินาที', scope: 'HOSPITAL', value: 8, fileDefault: 8, min: 1, description: 'F3 ต้องเร็วมาก ไม่เกิน 8 วินาที', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.urgency_raise_max', labelTh: 'เพิ่มระดับความเร่งด่วนได้ไม่เกิน', labelEn: 'Urgency raise max', type: 'number', unit: 'ระดับ', scope: 'HOSPITAL', value: 1, fileDefault: 1, min: 0, max: 1, description: 'Agent เพิ่มความเร่งด่วนได้แต่ลดไม่ได้ (ASM-22)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'agent.daily_summary_time', labelTh: 'เวลาสรุปประจำวัน', labelEn: 'Daily summary time', type: 'text', scope: 'HOSPITAL', value: '07:30', fileDefault: '07:30', description: 'เวลาส่งสรุปสถานะประจำวัน (HH:MM)', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'expiry', labelTh: 'ยาใกล้หมดอายุ', labelEn: 'Near-expiry', code: 'BR-F2a · §23',
    keys: [
      { key: 'expiry.threshold_days_default', labelTh: 'เกณฑ์ใกล้หมดอายุเริ่มต้น', labelEn: 'Threshold days default', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 180, fileDefault: 180, min: 0, description: 'ยาเหลืออายุน้อยกว่านี้ถือว่าใกล้หมดอายุ (ASM-14)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'expiry.transport_cost_ratio_max', labelTh: 'สัดส่วนค่าขนส่งต่อมูลค่าล็อต', labelEn: 'Transport cost ratio max', type: 'number', scope: 'REGION', value: 0.2, fileDefault: 0.2, min: 0, max: 1, description: 'เกินค่านี้ถือว่าขนส่งไม่คุ้ม (ASM-15)', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'expiry.cost_model_thb.base', labelTh: 'ค่าเดินทางคงที่', labelEn: 'Cost model · base', type: 'number', unit: 'บาท', scope: 'REGION', value: 300, fileDefault: 300, min: 0, description: 'ต้นทุนพื้นฐานต่อเที่ยว (ASM-15)', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'expiry.cost_model_thb.per_km', labelTh: 'ค่าเดินทางต่อกิโลเมตร', labelEn: 'Cost model · per km', type: 'number', unit: 'บาท/กม.', scope: 'REGION', value: 8, fileDefault: 8, min: 0, description: 'ต้นทุนต่อระยะทาง (ASM-15)', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'expiry.plan_approval_timeout_h', labelTh: 'เวลาอนุมัติแผนจัดสรร', labelEn: 'Plan approval timeout', type: 'number', unit: 'ชม.', scope: 'HOSPITAL', value: 48, fileDefault: 48, min: 1, description: 'เกินแล้วแผนเป็น NEEDS_DISCUSSION (ASM-16)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'expiry.repeat.recommend_value_thb', labelTh: 'มูลค่าขั้นต่ำที่แนะนำลดการสั่ง', labelEn: 'Repeat · recommend value', type: 'number', unit: 'บาท', scope: 'HOSPITAL', value: 10000, fileDefault: 10000, min: 0, description: 'ยาหมดอายุซ้ำที่มีมูลค่าเกินค่านี้จึงแนะนำ (F2b)', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'return', labelTh: 'การคืนยา', labelEn: 'Return', code: 'BR-XC · §23',
    keys: [
      { key: 'return.default_days', labelTh: 'กำหนดคืนเริ่มต้น', labelEn: 'Default return days', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 30, fileDefault: 30, min: 1, description: 'คืนเป็นยาเดิมจำนวนเดิมเท่านั้น (ASM-24)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'return.reminder_days', labelTh: 'แจ้งเตือนก่อนครบกำหนด', labelEn: 'Reminder days', type: 'text', unit: 'วัน', scope: 'HOSPITAL', value: '7, 1', fileDefault: '7, 1', description: 'วันที่แจ้งเตือนก่อนครบกำหนด คั่นด้วยจุลภาค', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'emergency', labelTh: 'เหตุฉุกเฉิน (F3)', labelEn: 'Emergency', code: 'BR-F3 · §23',
    keys: [
      { key: 'emergency.timeout_critical_min', labelTh: 'เวลาตอบกลับ · ยาวิกฤต', labelEn: 'Timeout · critical', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 3, fileDefault: 3, min: 1, description: 'ยาวิกฤตต้องตอบใน 3 นาที', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'emergency.timeout_supportive_min', labelTh: 'เวลาตอบกลับ · ยาสนับสนุน', labelEn: 'Timeout · supportive', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 5, fileDefault: 5, min: 1, description: 'ยาสนับสนุนตอบใน 5 นาที', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'emergency.blood.enabled', labelTh: 'เปิดให้ยืมเลือด PRC O ในเหตุฉุกเฉิน', labelEn: 'Blood (PRC O) enabled', type: 'boolean', scope: 'HOSPITAL', value: true, fileDefault: true, description: 'เฉพาะ รพ.ที่มีคลังเลือด · ต้องยืนยันจากคลังเลือด (ASM-47)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'emergency.blood.prc_o_max_units', labelTh: 'จำนวน PRC O สูงสุด', labelEn: 'PRC O max units', type: 'number', unit: 'ยูนิต', scope: 'HOSPITAL', value: 6, fileDefault: 6, min: 0, description: 'เพดานการยืมเลือดกรุ๊ป O นอกชุด', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'emergency.duplicate_window_min', labelTh: 'กันเหตุซ้ำ · ช่วงเวลา', labelEn: 'Duplicate window', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 10, fileDefault: 10, min: 0, description: 'เหตุที่ใกล้กันเกินค่านี้ถือเป็นเหตุเดียวกัน', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'mapping', labelTh: 'การจับคู่รหัสยา (F4)', labelEn: 'Drug mapping', code: 'BR-F2b · §23',
    keys: [
      { key: 'mapping.threshold_high', labelTh: 'เกณฑ์คะแนน "น่าเชื่อถือสูง"', labelEn: 'Threshold high', type: 'number', scope: 'REGION', value: 0.85, fileDefault: 0.85, min: 0, max: 1, description: 'คะแนน ≥ ค่านี้เป็น SUGGESTED (ASM-17)', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'mapping.threshold_medium', labelTh: 'เกณฑ์คะแนน "ต้องตรวจสอบ"', labelEn: 'Threshold medium', type: 'number', scope: 'REGION', value: 0.6, fileDefault: 0.6, min: 0, max: 1, description: 'คะแนนในช่วงนี้เป็น LOW_CONFIDENCE (ASM-17)', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'mapping.sla_days', labelTh: 'กรอบเวลาตรวจสอบการจับคู่', labelEn: 'Mapping SLA', type: 'number', unit: 'วัน', scope: 'HOSPITAL', value: 3, fileDefault: 3, min: 1, description: 'ต้องยืนยันคู่รหัสภายในกี่วัน', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'mapping.bulk_verify_enabled', labelTh: 'อนุญาตยืนยันหลายรายการพร้อมกัน', labelEn: 'Bulk verify', type: 'boolean', scope: 'HOSPITAL', value: false, fileDefault: false, description: 'ปิดไว้เป็นค่าเริ่มต้นเพื่อกันการยืนยันผิดพลาด', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'network', labelTh: 'เครือข่ายและขนส่ง', labelEn: 'Network & transport', code: 'BR-F2a · §23',
    keys: [
      { key: 'network.auto_approve', labelTh: 'อนุมัติอัตโนมัติภายในเครือข่าย', labelEn: 'Network auto-approve', type: 'boolean', scope: 'HOSPITAL', value: true, fileDefault: true, description: 'แผนจัดสรรในเครือข่ายเดียวกันอนุมัติอัตโนมัติ (Q-15)', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'transport.photos_max', labelTh: 'จำนวนรูปสูงสุดต่อการขนส่ง', labelEn: 'Max transport photos', type: 'number', unit: 'รูป', scope: 'HOSPITAL', value: 10, fileDefault: 10, min: 1, max: 10, description: 'รูปหลักฐานของเจ้าหน้าที่คลัง/พนักงานขับรถ', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'coldchain.default_box_hours', labelTh: 'อายุกล่องควบคุมอุณหภูมิ', labelEn: 'Cold-chain box hours', type: 'number', unit: 'ชม.', scope: 'HOSPITAL', value: 6, fileDefault: 6, min: 1, description: 'เวลาที่กล่องคงอุณหภูมิได้ก่อนต้องเปลี่ยนน้ำแข็ง', updatedBy: SYSDEF, updatedAt: '—' },
    ],
  },
  {
    id: 'security', labelTh: 'ความปลอดภัย', labelEn: 'Security', code: '§8 · §23',
    keys: [
      { key: 'security.rate_limit_per_min', labelTh: 'จำนวนคำขอต่อนาทีต่อผู้ใช้', labelEn: 'Rate limit per minute', type: 'number', unit: 'ครั้ง', scope: 'REGION', value: 300, fileDefault: 300, min: 1, description: 'จำกัดอัตราการเรียก API ต่อผู้ใช้', updatedBy: 'ผู้ดูแลเขตสุขภาพ', updatedAt: '14 ต.ค. 69 13:12' },
      { key: 'security.session_idle_min', labelTh: 'หมดเวลาเซสชันเมื่อไม่ใช้งาน', labelEn: 'Session idle timeout', type: 'number', unit: 'นาที', scope: 'HOSPITAL', value: 30, fileDefault: 30, min: 5, description: 'เกินแล้วต้องเข้าสู่ระบบใหม่', updatedBy: SYSDEF, updatedAt: '—' },
      { key: 'security.mfa_required_roles', labelTh: 'บทบาทที่บังคับใช้ MFA', labelEn: 'MFA required roles', type: 'text', scope: 'GLOBAL', value: 'SYSTEM_ADMIN, REGION_ADMIN, HOSPITAL_ADMIN, DATA_ADMIN, AUDITOR', fileDefault: 'SYSTEM_ADMIN, REGION_ADMIN, HOSPITAL_ADMIN, DATA_ADMIN, AUDITOR', description: 'ผู้ดูแลโรงพยาบาลอยู่ในรายการนี้เสมอ', updatedBy: 'ผู้ดูแลระบบ', updatedAt: '8 ม.ค. 68 09:00' },
    ],
  },
  {
    id: 'retention', labelTh: 'ระยะเวลาเก็บข้อมูล', labelEn: 'Retention', code: 'ASM-26 · §23',
    keys: [
      { key: 'retention.audit_years', labelTh: 'เก็บบันทึกตรวจสอบ', labelEn: 'Audit retention', type: 'number', unit: 'ปี', scope: 'GLOBAL', value: 7, fileDefault: 7, min: 1, description: 'รอการยืนยันทางกฎหมาย (Q-20)', updatedBy: 'ผู้ดูแลระบบ', updatedAt: '8 ม.ค. 68 09:00' },
      { key: 'retention.usage_years', labelTh: 'เก็บข้อมูลการใช้งานยา', labelEn: 'Usage history retention', type: 'number', unit: 'ปี', scope: 'GLOBAL', value: 10, fileDefault: 10, min: 1, description: 'เพื่อให้โมเดลเรียนรู้ฐานก่อน COVID (ASM-26)', updatedBy: 'ผู้ดูแลระบบ', updatedAt: '8 ม.ค. 68 09:00' },
      { key: 'retention.documents_years', labelTh: 'เก็บเอกสารยืม-คืน/โอนย้าย', labelEn: 'Documents retention', type: 'number', unit: 'ปี', scope: 'GLOBAL', value: 7, fileDefault: 7, min: 1, description: 'เอกสารแนบและ PDF ที่สร้างจากระบบ', updatedBy: 'ผู้ดูแลระบบ', updatedAt: '8 ม.ค. 68 09:00' },
    ],
  },
];

/** Per-drug rows for API-F1a-004 `PATCH /hospital-drugs/{id}/classification`. */
export type VedCode = 'V' | 'E' | 'D';
export type AbcCode = 'A' | 'B' | 'C';

export interface ConfigDrugRow {
  id: string;
  code: string;
  name: string;
  ved: VedCode;
  abc: AbcCode;
  expiryThresholdDays: number;
  updatedBy: string;
  updatedAt: string;
}

export const CONFIG_DRUGS: ConfigDrugRow[] = [
  { id: 'HD-000147', code: '1000147', name: 'ADRENaline 1 mg/mL inj', ved: 'V', abc: 'B', expiryThresholdDays: 180, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '9 ต.ค. 69 10:20' },
  { id: 'HD-002875', code: '1002875', name: 'Tenecteplase 50 mg inj', ved: 'V', abc: 'A', expiryThresholdDays: 180, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '9 ต.ค. 69 10:22' },
  { id: 'HD-000402', code: '1000402', name: 'CefTRIAXone 1 g inj', ved: 'E', abc: 'B', expiryThresholdDays: 150, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '2 ต.ค. 69 14:05' },
  { id: 'HD-000017', code: '1000017', name: '5-FU 120 SYRINGE', ved: 'E', abc: 'A', expiryThresholdDays: 120, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '2 ต.ค. 69 14:06' },
  { id: 'HD-000731', code: '1000731', name: 'Phytomenadione (Vit K1) 10 mg/mL inj', ved: 'E', abc: 'C', expiryThresholdDays: 180, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '28 ก.ย. 69 09:15' },
  { id: 'HD-000223', code: '1000223', name: 'AMLOdipine 5 mg tab', ved: 'D', abc: 'C', expiryThresholdDays: 180, updatedBy: 'เภสัชกร (PHARMACIST)', updatedAt: '28 ก.ย. 69 09:16' },
  { id: 'HD-003011', code: '1003011', name: 'ถุงมือไนไตรล์ M 100 ชิ้น/กล่อง', ved: 'E', abc: 'B', expiryThresholdDays: 365, updatedBy: 'ทีมผู้ดูแลข้อมูลยา (DATA_ADMIN)', updatedAt: '20 ก.ย. 69 11:40' },
];

/** One audited configuration change (SEC-003). */
export interface ConfigChange {
  at: string;
  key: string;
  scope: ConfigScope;
  from: string;
  to: string;
  actor: string;
  role: RoleCode;
  reason: string;
}

export const CONFIG_HISTORY: ConfigChange[] = [
  { at: '12 ต.ค. 69 15:20', key: 'return.default_days', scope: 'HOSPITAL', from: '30', to: '45', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN', reason: 'ปรับตามรอบบิลใหม่ของ รพ.' },
  { at: '12 ต.ค. 69 15:18', key: 'expiry.plan_approval_timeout_h', scope: 'HOSPITAL', from: '48', to: '36', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN', reason: 'ให้เภสัชกรตอบเร็วขึ้นช่วงตรวจราชการ' },
  { at: '11 ต.ค. 69 10:02', key: 'forecast.price_high_thb', scope: 'HOSPITAL', from: '1000', to: '1200', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN', reason: 'ราคายาเพิ่มขึ้นทั้งกลุ่มหลังปรับสัญญา' },
  { at: '14 ต.ค. 69 13:12', key: 'borrow.max_parallel', scope: 'REGION', from: '3', to: '3', actor: 'ผู้ดูแลเขตสุขภาพ', role: 'REGION_ADMIN', reason: 'ยืนยันค่าเดิมหลังทบทวนกับทีมเขต' },
  { at: '8 ม.ค. 68 09:00', key: 'retention.audit_years', scope: 'GLOBAL', from: '—', to: '7', actor: 'ผู้ดูแลระบบ', role: 'SYSTEM_ADMIN', reason: 'ค่าตั้งต้นเมื่อเริ่มใช้งานระบบ' },
];

export const SCOPE_META: Record<ConfigScope, { labelTh: string; tone: string; code: string }> = {
  HOSPITAL: { labelTh: 'โรงพยาบาล', tone: 't-blue', code: 'HOSPITAL:<id>' },
  REGION: { labelTh: 'เขตสุขภาพ', tone: 't-teal', code: 'REGION:<id>' },
  GLOBAL: { labelTh: 'ส่วนกลาง', tone: 't-grey', code: 'GLOBAL' },
  DEFAULT: { labelTh: 'ค่าเริ่มต้น', tone: 't-amber', code: '(no stored row)' },
};

export const SCOPE_FILTERS: { value: ConfigScope | 'ALL'; labelTh: string }[] = [
  { value: 'ALL', labelTh: 'ทุกขอบเขต' },
  { value: 'HOSPITAL', labelTh: 'โรงพยาบาล' },
  { value: 'REGION', labelTh: 'เขตสุขภาพ' },
  { value: 'GLOBAL', labelTh: 'ส่วนกลาง' },
  { value: 'DEFAULT', labelTh: 'ค่าเริ่มต้น' },
];
