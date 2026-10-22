/**
 * Configuration catalogue for API-AD-001 / API-AD-002.
 *
 * Hand-written pure data — the backend has no YAML dependency and the Docker image ships only `dist/`,
 * so `specification/config-defaults.yaml` cannot be read at runtime. Every key below is either
 *   - read by backend code today (`getSetting(...)`, verified by grep), or
 *   - a spec key that no backend code consumes yet (`readOnly`, see `READ_ONLY_REASON`).
 * Values/defaults/bounds come from `specification/config-defaults.yaml` and `10-security-nfr-stack.md` §23.
 *
 * Lookup order at runtime (display only): HOSPITAL:<id> → REGION:<id> → GLOBAL → file default.
 */
import { HttpError } from '../../middleware/httpError.js';

export type ConfigValueType = 'number' | 'boolean' | 'text';

export interface ConfigKeySpec {
  key: string;
  group: string;
  type: ConfigValueType;
  /** Value from `config-defaults.yaml`, or the code default when the file has no entry. */
  fileDefault: number | boolean | string;
  defaultSource: 'FILE' | 'CODE';
  unit?: string;
  min?: number;
  max?: number;
  /** Allowed values for text keys (e.g. VED class). */
  values?: string[];
  description: string;
  /** No backend code reads this key yet: visible in GET /config, rejected by PUT. */
  readOnly?: boolean;
}

export const READ_ONLY_REASON = 'ยังไม่มีโค้ด backend ที่อ่านคีย์นี้ในระบบปัจจุบัน จึงแก้ไขผ่าน API ไม่ได้';

/** §23: changes to these groups need REGION_ADMIN or above — under this plan only SYSTEM_ADMIN. */
export const RESTRICTED_CONFIG_PREFIXES = ['borrow.score.', 'ved.z.', 'agent.'] as const;

export function isRestrictedConfigKey(key: string): boolean {
  return RESTRICTED_CONFIG_PREFIXES.some((prefix) => key.startsWith(prefix));
}

const n = (
  key: string,
  group: string,
  fileDefault: number,
  description: string,
  opts: Partial<ConfigKeySpec> = {},
): ConfigKeySpec => ({ key, group, type: 'number', fileDefault, defaultSource: 'FILE', description, ...opts });

const b = (
  key: string,
  group: string,
  fileDefault: boolean,
  description: string,
  opts: Partial<ConfigKeySpec> = {},
): ConfigKeySpec => ({ key, group, type: 'boolean', fileDefault, defaultSource: 'FILE', description, ...opts });

const t = (
  key: string,
  group: string,
  fileDefault: string,
  description: string,
  opts: Partial<ConfigKeySpec> = {},
): ConfigKeySpec => ({ key, group, type: 'text', fileDefault, defaultSource: 'FILE', description, ...opts });

const readOnly = (spec: ConfigKeySpec): ConfigKeySpec => ({ ...spec, readOnly: true });

export const CONFIG_CATALOGUE: ConfigKeySpec[] = [
  // ---------- forecast (no backend reader yet: the Python model reads its own config/forecast.yaml) ----------
  readOnly(n('forecast.min_history_days_cold_start', 'forecast', 90, 'จำนวนวันประวัติขั้นต่ำก่อนใช้โมเดลเฉพาะรายการ', { min: 0, unit: 'วัน' })),
  readOnly(n('forecast.min_history_months_maes', 'forecast', 6, 'จำนวนเดือนขั้นต่ำสำหรับวิธี MA-ES', { min: 0, unit: 'เดือน' })),
  readOnly(n('forecast.cv_threshold', 'forecast', 0.5, 'เกณฑ์ CV สำหรับแยก demand ที่ผันผวน', { min: 0, max: 10 })),
  readOnly(n('forecast.active_day_ratio_threshold', 'forecast', 0.3, 'สัดส่วนวันที่มีการใช้ขั้นต่ำ (Q-01)', { min: 0, max: 1 })),
  readOnly(n('forecast.price_high_thb', 'forecast', 1000, 'เกณฑ์ราคาสูงสำหรับจัดกลุ่ม ASM-33', { min: 0, unit: 'บาท' })),
  readOnly(n('forecast.price_low_thb', 'forecast', 50, 'เกณฑ์ราคาต่ำสำหรับจัดกลุ่ม ASM-33', { min: 0, unit: 'บาท' })),
  readOnly(n('forecast.stale_days', 'forecast', 7, 'จำนวนวันก่อนถือว่าข้อมูลเก่าและระงับ alert (ASM-37)', { min: 0, unit: 'วัน' })),
  readOnly(n('forecast.min_residuals', 'forecast', 26, 'จำนวน residual ขั้นต่ำก่อนประเมินโมเดล', { min: 0 })),
  readOnly(n('forecast.coverage_tolerance', 'forecast', 0.05, 'ค่าคลาดเคลื่อน coverage ที่ยอมรับได้', { min: 0, max: 1 })),
  readOnly(n('forecast.overstock_multiple', 'forecast', 2, 'ตัวคูณตัดสิน overstock เทียบ Total Target', { min: 1, unit: 'เท่า' })),

  // ---------- VED / ABC ----------
  n('ved.z.V', 'ved', 1.65, 'ตัวคูณ σ สำหรับยาจำเป็นวิกฤต (V)', { min: 0, max: 5 }),
  n('ved.z.E', 'ved', 1.28, 'ตัวคูณ σ สำหรับยาจำเป็น (E)', { min: 0, max: 5 }),
  n('ved.z.D', 'ved', 0, 'ตัวคูณ σ สำหรับยาพึงประสงค์ (D) — ไม่เข้า borrow agent', { min: 0, max: 5 }),
  readOnly(n('ved.quantile.V', 'ved', 0.95, 'Quantile ที่ใช้กับยาระดับ V (P95)', { min: 0.5, max: 1 })),
  readOnly(n('ved.quantile.E', 'ved', 0.9, 'Quantile ที่ใช้กับยาระดับ E (P90)', { min: 0.5, max: 1 })),
  readOnly(t('ved.default_class', 'ved', 'E', 'VED เริ่มต้นของยาใหม่ (ASM-36)', { values: ['V', 'E', 'D'] })),
  readOnly(n('abc.cutoff_a', 'abc', 0.7, 'จุดตัดสะสมมูลค่าระดับ A (ASM-35)', { min: 0, max: 1 })),
  readOnly(n('abc.cutoff_b', 'abc', 0.9, 'จุดตัดสะสมมูลค่าระดับ B (ASM-35)', { min: 0, max: 1 })),

  // ---------- borrow (read by borrow.config.ts) ----------
  n('borrow.stop_ratio_V', 'borrow', 0.9, 'หยุดหาเจ้าอื่นเมื่อได้สัดส่วนนี้ของความต้องการ (V)', { min: 0, max: 2, unit: 'เท่า' }),
  n('borrow.stop_ratio_E', 'borrow', 1, 'หยุดหาเจ้าอื่นเมื่อได้สัดส่วนนี้ของความต้องการ (E)', { min: 0, max: 2, unit: 'เท่า' }),
  n('borrow.max_parallel', 'borrow', 3, 'จำนวนผู้ให้ที่ถามพร้อมกันสูงสุด', { min: 1, max: 10, unit: 'แห่ง' }),
  n('borrow.timeout_min.very_urgent', 'borrow', 120, 'เวลาตอบกลับขั้นต่ำ · เร่งด่วนมาก', { min: 60, unit: 'นาที' }),
  n('borrow.timeout_min.urgent', 'borrow', 360, 'เวลาตอบกลับขั้นต่ำ · เร่งด่วน', { min: 240, unit: 'นาที' }),
  n('borrow.timeout_min.normal', 'borrow', 2880, 'เวลาตอบกลับ · ปกติ', { min: 60, unit: 'นาที' }),
  n('borrow.reminder_ratio', 'borrow', 0.5, 'สัดส่วนของเวลาที่ใช้แจ้งเตือนครั้งที่สอง', { min: 0, max: 1 }),
  n('borrow.score.w_time', 'borrow', 0.45, 'น้ำหนักคะแนนด้านเวลา (Si)', { min: 0, max: 1 }),
  n('borrow.score.w_fulfill', 'borrow', 0.28, 'น้ำหนักคะแนนด้านความครบถ้วน (Si)', { min: 0, max: 1 }),
  n('borrow.score.w_stock_safety', 'borrow', 0.17, 'น้ำหนักคะแนนด้านความปลอดภัยสต็อกผู้ให้ (Si)', { min: 0, max: 1 }),
  n('borrow.score.w_reliability', 'borrow', 0.1, 'น้ำหนักคะแนนด้านความน่าเชื่อถือ (Si)', { min: 0, max: 1 }),
  n('borrow.stock_safety_days', 'borrow', 30, 'จำนวนวันสำรองสต็อกของผู้ให้', { min: 0, unit: 'วัน' }),
  n('borrow.reliability_default', 'borrow', 0.5, 'ค่าความน่าเชื่อถือเริ่มต้นเมื่อยังไม่มีประวัติ', { min: 0, max: 1 }),
  n('borrow.reliability_window_months', 'borrow', 12, 'หน้าต่างย้อนหลังที่ใช้คำนวณความน่าเชื่อถือ', { min: 1, max: 120, unit: 'เดือน' }),
  n('borrow.lot_min_remaining_days', 'borrow', 180, 'อายุคงเหลือขั้นต่ำของล็อตที่ให้ยืมได้', { min: 0, unit: 'วัน' }),
  n('borrow.urgency.very_urgent_V_days', 'borrow', 2, 'เกณฑ์วันคงเหลือของยา V ที่ทำให้เป็น VERY_URGENT', { min: 0, unit: 'วัน' }),
  n('borrow.urgency.urgent_V_days', 'borrow', 7, 'เกณฑ์วันคงเหลือของยา V ที่ทำให้เป็น URGENT', { min: 0, unit: 'วัน' }),
  n('borrow.urgency.urgent_E_days', 'borrow', 2, 'เกณฑ์วันคงเหลือของยา E ที่ทำให้เป็น URGENT', { min: 0, unit: 'วัน' }),

  // ---------- agent ----------
  b('agent.enabled', 'agent', true, 'เปิดใช้งาน Agent (kill switch กลาง) — ปิดแล้วระบบใช้กฎ/ข้อความแม่แบบ'),
  readOnly(t('agent.model_id', 'agent', 'REPLACE_WITH_BEDROCK_MODEL_ID', 'โมเดล Amazon Bedrock ที่ใช้สร้างแผน (ASM-21)')),

  // ---------- expiry (read by expiry.config.ts) ----------
  n('expiry.threshold_days_default', 'expiry', 180, 'อายุคงเหลือเริ่มต้นที่ถือว่าใกล้หมดอายุ (ASM-14)', { min: 0, unit: 'วัน' }),
  n('expiry.transport_cost_ratio_max', 'expiry', 0.2, 'สัดส่วนค่าขนส่งต่อมูลค่าล็อตสูงสุด (ASM-15)', { min: 0, max: 1 }),
  n('expiry.cost_model_thb.base', 'expiry', 300, 'ค่าเดินทางคงที่ต่อเที่ยว (ASM-15)', { min: 0, unit: 'บาท' }),
  n('expiry.cost_model_thb.per_km', 'expiry', 8, 'ค่าเดินทางต่อกิโลเมตร (ASM-15)', { min: 0, unit: 'บาท/กม.' }),
  n('expiry.cost_model_thb.cold_chain_surcharge', 'expiry', 500, 'ค่าบริการเพิ่มสำหรับขนส่งควบคุมอุณหภูมิ', { min: 0, unit: 'บาท' }),
  n('expiry.plan_approval_timeout_h', 'expiry', 48, 'เวลาอนุมัติแผนจัดสรรก่อนเป็น NEEDS_DISCUSSION (ASM-16)', { min: 1, unit: 'ชม.' }),
  n('expiry.repeat.watch_count', 'expiry', 2, 'จำนวนครั้งที่หมดอายุซ้ำก่อนติดตาม (F2b)', { min: 0, unit: 'ครั้ง' }),
  n('expiry.repeat.recommend_count', 'expiry', 3, 'จำนวนครั้งที่หมดอายุซ้ำก่อนแนะนำลดการสั่ง', { min: 0, unit: 'ครั้ง' }),
  n('expiry.repeat.recommend_value_thb', 'expiry', 10000, 'มูลค่าขั้นต่ำที่ทำให้แนะนำลดการสั่ง', { min: 0, unit: 'บาท' }),
  n('expiry.repeat.dismiss_days', 'expiry', 90, 'จำนวนวันที่ปิดธงหมดอายุซ้ำ', { min: 0, unit: 'วัน' }),
  n('expiry.repeat.window_months', 'expiry', 12, 'หน้าต่างย้อนหลังที่ใช้ตรวจการหมดอายุซ้ำ', { min: 0, unit: 'เดือน' }),
  n('expiry.keep_review_days', 'expiry', 30, 'จำนวนวันก่อนทบทวนรายการที่เลือกเก็บไว้เอง', { min: 0, unit: 'วัน', defaultSource: 'CODE' }),

  // ---------- return ----------
  n('return.default_days', 'return', 30, 'กำหนดคืนเริ่มต้น (คืนเป็นยาเดิมจำนวนเดิม, ASM-24)', { min: 1, unit: 'วัน' }),

  // ---------- emergency (read by incidents.config.ts) ----------
  n('emergency.timeout_critical_min', 'emergency', 3, 'เวลาตอบกลับของยาวิกฤต', { min: 1, unit: 'นาที' }),
  n('emergency.timeout_supportive_min', 'emergency', 5, 'เวลาตอบกลับของยาสนับสนุน', { min: 1, unit: 'นาที' }),
  n('emergency.location_timeout_s', 'emergency', 3, 'เวลารอผลเรียกเส้นทาง', { min: 1, unit: 'วินาที' }),
  n('emergency.duplicate_window_min', 'emergency', 10, 'ช่วงเวลาที่ถือว่าเหตุใกล้กันเป็นเหตุเดียวกัน', { min: 0, unit: 'นาที' }),
  n('emergency.duplicate_radius_m', 'emergency', 500, 'รัศมีที่ถือว่าเหตุเกิดที่เดียวกัน', { min: 0, unit: 'เมตร' }),
  n('emergency.max_parallel', 'emergency', 5, 'จำนวนผู้ให้ที่ถามพร้อมกันในเหตุฉุกเฉิน', { min: 1, unit: 'แห่ง', defaultSource: 'CODE' }),
  b('emergency.blood.enabled', 'emergency', true, 'เปิดให้ยืมเลือด PRC O ในเหตุฉุกเฉิน (ASM-47)'),
  n('emergency.blood.prc_o_max_units', 'emergency', 6, 'จำนวน PRC O สูงสุดที่ยืมนอกชุดได้', { min: 0, unit: 'ยูนิต' }),
  n('emergency.blood.prc_o_min_remaining_days', 'emergency', 7, 'อายุคงเหลือขั้นต่ำของเลือดที่จะให้ยืม', { min: 0, unit: 'วัน' }),

  // ---------- network / cold chain ----------
  b('network.auto_approve', 'network', true, 'อนุมัติอัตโนมัติสำหรับแผนจัดสรรภายในเครือข่าย (Q-15)'),
  n('coldchain.default_box_hours', 'coldchain', 6, 'อายุกล่องควบคุมอุณหภูมิก่อนต้องเปลี่ยนน้ำแข็ง', { min: 1, unit: 'ชม.' }),

  // ---------- mapping (no backend reader yet: F2b not implemented) ----------
  readOnly(n('mapping.threshold_high', 'mapping', 0.85, 'คะแนนขั้นต่ำที่ถือว่าน่าเชื่อถือสูง (ASM-17)', { min: 0, max: 1 })),
  readOnly(n('mapping.threshold_medium', 'mapping', 0.6, 'คะแนนขั้นต่ำที่ต้องตรวจสอบ (ASM-17)', { min: 0, max: 1 })),
  readOnly(n('mapping.weights.name', 'mapping', 0.4, 'น้ำหนักการจับคู่ชื่อยา', { min: 0, max: 1 })),
  readOnly(n('mapping.weights.strength', 'mapping', 0.3, 'น้ำหนักการจับคู่ความแรง', { min: 0, max: 1 })),
  readOnly(n('mapping.weights.form', 'mapping', 0.2, 'น้ำหนักการจับคู่รูปแบบยา', { min: 0, max: 1 })),
  readOnly(n('mapping.weights.unit', 'mapping', 0.1, 'น้ำหนักการจับคู่หน่วยนับ', { min: 0, max: 1 })),
  readOnly(n('mapping.sla_days', 'mapping', 3, 'กรอบเวลาตรวจสอบคู่รหัสยา', { min: 1, unit: 'วัน' })),
  readOnly(b('mapping.bulk_verify_enabled', 'mapping', false, 'อนุญาตยืนยันคู่รหัสยาหลายรายการพร้อมกัน')),

  // ---------- security / retention (no backend reader yet: rate limit and retention jobs are P2) ----------
  readOnly(n('security.rate_limit_per_min', 'security', 300, 'จำนวนคำขอต่อนาทีต่อผู้ใช้', { min: 1, unit: 'ครั้ง/นาที' })),
  readOnly(n('security.agent_rate_limit_per_min', 'security', 30, 'จำนวนคำขอต่อนาทีสำหรับ endpoint ที่เรียก Agent', { min: 1, unit: 'ครั้ง/นาที' })),
  readOnly(n('security.session_idle_min', 'security', 30, 'หมดเวลาเซสชันเมื่อไม่ใช้งาน', { min: 5, unit: 'นาที' })),
  readOnly(
    t('security.mfa_required_roles', 'security', 'SYSTEM_ADMIN, REGION_ADMIN, HOSPITAL_ADMIN, DATA_ADMIN, AUDITOR', 'บทบาทที่บังคับใช้ MFA (คั่นด้วยจุลภาค)'),
  ),
  readOnly(n('retention.audit_years', 'retention', 7, 'ระยะเวลาเก็บบันทึกตรวจสอบ', { min: 1, unit: 'ปี' })),
  readOnly(n('retention.ledger_years', 'retention', 7, 'ระยะเวลาเก็บ stock ledger', { min: 1, unit: 'ปี' })),
  readOnly(n('retention.documents_years', 'retention', 7, 'ระยะเวลาเก็บเอกสารยืม-คืน/โอนย้าย', { min: 1, unit: 'ปี' })),
  readOnly(n('retention.usage_years', 'retention', 10, 'ระยะเวลาเก็บข้อมูลการใช้ยา', { min: 1, unit: 'ปี' })),
  readOnly(n('retention.audit_context_months', 'retention', 12, 'ระยะเวลาเก็บ IP/user agent ของ audit', { min: 1, unit: 'เดือน' })),
  readOnly(n('retention.agent_run_years', 'retention', 2, 'ระยะเวลาเก็บ agent run', { min: 1, unit: 'ปี' })),
  readOnly(n('retention.photos_years', 'retention', 1, 'ระยะเวลาเก็บรูปหลักฐานขนส่ง', { min: 1, unit: 'ปี' })),
];

export const CONFIG_BY_KEY: Map<string, ConfigKeySpec> = new Map(CONFIG_CATALOGUE.map((spec) => [spec.key, spec]));

/** Stable group order for GET /config (roughly the order the UI groups them in). */
export const CONFIG_GROUP_ORDER = [
  'forecast',
  'ved',
  'abc',
  'borrow',
  'agent',
  'expiry',
  'return',
  'emergency',
  'network',
  'coldchain',
  'mapping',
  'security',
  'retention',
];

export function requireConfigKey(key: string): ConfigKeySpec {
  const spec = CONFIG_BY_KEY.get(key);
  if (!spec) throw new HttpError(404, 'NOT_FOUND', `ไม่พบคีย์ตั้งค่า ${key}`);
  return spec;
}

/** Coerces a JSON value to the catalogue type, enforcing bounds and allowed values. */
export function validateConfigValue(spec: ConfigKeySpec, raw: unknown): number | boolean | string {
  if (spec.type === 'number') {
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องเป็นตัวเลข`);
    }
    if (spec.min !== undefined && value < spec.min) throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องไม่น้อยกว่า ${spec.min}`);
    if (spec.max !== undefined && value > spec.max) throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องไม่เกิน ${spec.max}`);
    return value;
  }
  if (spec.type === 'boolean') {
    if (typeof raw !== 'boolean') throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องเป็น true/false`);
    return raw;
  }
  if (typeof raw !== 'string') throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องเป็นข้อความ`);
  const text = raw.trim();
  if (!text) throw new HttpError(400, 'VALIDATION', `${spec.key} ห้ามว่าง`);
  if (text.length > 500) throw new HttpError(400, 'VALIDATION', `${spec.key} ยาวเกินไป`);
  if (spec.values && !spec.values.includes(text)) {
    throw new HttpError(400, 'VALIDATION', `${spec.key} ต้องเป็นหนึ่งใน ${spec.values.join(', ')}`);
  }
  return text;
}
