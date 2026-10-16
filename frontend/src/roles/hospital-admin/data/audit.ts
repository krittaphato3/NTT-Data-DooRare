/** Audit-log fixtures for UI-18 (Audit log). Endpoint: API-AD-003 `GET /api/v1/audit-log`.
 *  Every approval/rejection/override stores actor, role, timestamp, before/after and reason
 *  (SEC-003); entries are hash-chained so they cannot be edited or deleted. */

import type { RoleCode } from '../../../lib/rbac';

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'SUSPEND' | 'ACTIVATE' | 'INVITE'
  | 'APPROVE' | 'REJECT' | 'WAIVE' | 'EXPORT' | 'LOGIN' | 'LOGIN_FAILED' | 'VERIFY_CHAIN';

export type AuditValue = string | number | boolean | null;

export interface AuditEntry {
  id: string;
  /** Thai short Buddhist-era date + HH:MM, as used across the dashboard. */
  at: string;
  /** Gregorian ISO timestamp used for date-range filtering and sorting (the UI shows `at`). */
  atIso: string;
  actor: string;
  role: RoleCode;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Field-level snapshot before the change; `{}` for creates/logins. */
  before: Record<string, AuditValue>;
  /** Field-level snapshot after the change; `{}` for logins. */
  after: Record<string, AuditValue>;
  reason: string;
  ip: string;
  /** Agent decision log this entry points at (API-F1b-013), when the change came from a plan. */
  agentRunId?: string;
  hash: string;
  prevHash: string;
}

export interface ActionMeta {
  labelTh: string;
  /** `.badge` tone class from `index.css`. */
  tone: string;
}

export const AUDIT_ACTION_META: Record<AuditAction, ActionMeta> = {
  CREATE: { labelTh: 'สร้าง', tone: 't-blue' },
  UPDATE: { labelTh: 'แก้ไข', tone: 't-blue' },
  SUSPEND: { labelTh: 'ระงับ', tone: 't-red' },
  ACTIVATE: { labelTh: 'เปิดใช้งาน', tone: 't-green' },
  INVITE: { labelTh: 'เชิญผู้ใช้', tone: 't-amber' },
  APPROVE: { labelTh: 'อนุมัติ', tone: 't-green' },
  REJECT: { labelTh: 'ปฏิเสธ', tone: 't-red' },
  WAIVE: { labelTh: 'ยกเว้น', tone: 't-orange' },
  EXPORT: { labelTh: 'ส่งออก', tone: 't-grey' },
  LOGIN: { labelTh: 'เข้าสู่ระบบ', tone: 't-teal' },
  LOGIN_FAILED: { labelTh: 'เข้าสู่ระบบไม่สำเร็จ', tone: 't-red' },
  VERIFY_CHAIN: { labelTh: 'ตรวจสอบ hash chain', tone: 't-teal' },
};

/** Filter options for the audit filter bar; `ALL` means "no filter". */
export const AUDIT_ACTION_OPTIONS: { value: AuditAction | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทุกการกระทำ' },
  ...(Object.keys(AUDIT_ACTION_META) as AuditAction[]).map((a) => ({
    value: a,
    label: AUDIT_ACTION_META[a].labelTh,
  })),
];

export const ENTITY_TYPES = ['app_user', 'config_setting', 'return_obligation', 'borrow_request', 'session'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_OPTIONS: { value: EntityType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทุกประเภทข้อมูล' },
  { value: 'app_user', label: 'บัญชีผู้ใช้ · app_user' },
  { value: 'config_setting', label: 'ค่าตั้งต้นระบบ · config_setting' },
  { value: 'return_obligation', label: 'ภาระการคืน · return_obligation' },
  { value: 'borrow_request', label: 'คำขอยืม · borrow_request' },
  { value: 'session', label: 'เซสชัน · session' },
];

export const AUDIT_ENTRIES: AuditEntry[] = [
  {
    id: 'AUD-0005821', at: '13 ต.ค. 69 08:40', atIso: '2026-10-13T08:40', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'INVITE', entityType: 'app_user', entityId: 'USR-000108',
    before: {}, after: { name: 'นางสุนีย์ ประสิทธิ์', email: 'sunee.p@smp.go.th', role: 'PROCUREMENT_OFFICER', status: 'INVITED' },
    reason: 'เพิ่มเจ้าหน้าที่พัสดุทดแทนตำแหน่งที่ย้ายออก', ip: '10.24.6.18',
    hash: '9f2c…a104', prevHash: '71be…0091',
  },
  {
    id: 'AUD-0005820', at: '13 ต.ค. 69 08:12', atIso: '2026-10-13T08:12', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'SUSPEND', entityType: 'app_user', entityId: 'USR-000109',
    before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' },
    reason: 'พนักงานขับรถลาออก รอส่งคืนบัญชี', ip: '10.24.6.18',
    hash: '71be…0091', prevHash: '3ad7…88c2',
  },
  {
    id: 'AUD-0005819', at: '12 ต.ค. 69 21:45', atIso: '2026-10-12T21:45', actor: 'ไม่ทราบตัวตน', role: 'DRIVER',
    action: 'LOGIN_FAILED', entityType: 'session', entityId: 'SES-0029314',
    before: {}, after: { result: 'FAILED', note: 'รหัสผ่านไม่ถูกต้อง' },
    reason: '', ip: '110.168.42.7',
    hash: '3ad7…88c2', prevHash: 'c510…2b47',
  },
  {
    id: 'AUD-0005818', at: '12 ต.ค. 69 15:20', atIso: '2026-10-12T15:20', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'UPDATE', entityType: 'config_setting', entityId: 'return.default_days',
    before: { value: 30 }, after: { value: 45 },
    reason: 'ปรับตามนโยบาย รพ. รอบบิลใหม่', ip: '10.24.6.18',
    hash: 'c510…2b47', prevHash: 'aa03…7f19',
  },
  {
    id: 'AUD-0005817', at: '12 ต.ค. 69 11:02', atIso: '2026-10-12T11:02', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'WAIVE', entityType: 'return_obligation', entityId: 'RO-2026-000071',
    before: { state: 'OVERDUE' }, after: { state: 'WAIVED' },
    reason: 'คู่กรณีเป็น รพ.ในเครือข่ายเดียวกัน และยืนยันคืนเป็นล็อตถัดไป', ip: '10.24.6.18',
    agentRunId: 'RUN-2026-10-12-0042',
    hash: 'aa03…7f19', prevHash: '5e88…1c60',
  },
  {
    id: 'AUD-0005816', at: '12 ต.ค. 69 09:31', atIso: '2026-10-12T09:31', actor: 'ภญ.จิราพร อินทรีย์', role: 'DATA_ADMIN',
    action: 'UPDATE', entityType: 'app_user', entityId: 'USR-000104',
    before: { mfa: false }, after: { mfa: true },
    reason: 'เปิด MFA ตามข้อกำหนดความปลอดภัย', ip: '10.24.7.40',
    hash: '5e88…1c60', prevHash: 'b1d4…41e8',
  },
  {
    id: 'AUD-0005815', at: '11 ต.ค. 69 16:48', atIso: '2026-10-11T16:48', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'EXPORT', entityType: 'session', entityId: 'SES-ALL',
    before: {}, after: { rows: 184, format: 'CSV' },
    reason: 'ส่งฝ่ายไอทีตรวจสอบการเข้าใช้งานเดือน ก.ย.', ip: '10.24.6.18',
    hash: 'b1d4…41e8', prevHash: '0c77…93af',
  },
  {
    id: 'AUD-0005814', at: '11 ต.ค. 69 02:13', atIso: '2026-10-11T02:13', actor: 'ไม่ทราบตัวตน', role: 'AUDITOR',
    action: 'LOGIN_FAILED', entityType: 'session', entityId: 'SES-0029180',
    before: {}, after: { result: 'FAILED', note: 'ตำแหน่งผิดปกติ · ถูกบล็อก' },
    reason: '', ip: '185.220.101.4',
    hash: '0c77…93af', prevHash: 'ee41…0d25',
  },
  {
    id: 'AUD-0005813', at: '10 ต.ค. 69 14:05', atIso: '2026-10-10T14:05', actor: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN',
    action: 'ACTIVATE', entityType: 'app_user', entityId: 'USR-000106',
    before: { status: 'INVITED' }, after: { status: 'ACTIVE' },
    reason: 'ผู้ใช้ยืนยันอีเมลและเข้าสู่ระบบครั้งแรก', ip: '10.24.6.18',
    hash: 'ee41…0d25', prevHash: '0000…0000',
  },
];

export interface ChainVerifyResult {
  ok: boolean;
  checked: number;
  brokenAt: string | null;
  checkedAt: string;
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** Now as the dashboard writes it: Thai short Buddhist-era date + HH:MM, plus a Gregorian ISO form. */
function nowStamp(): { at: string; atIso: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    at: `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`,
    atIso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/**
 * The row hash is really SHA-256 over the row (SEC-003, `audit_log_chain()` trigger).
 * The mock only needs it to be deterministic and stable for a given row, in the fixtures' shape.
 */
function mockHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const part = (rounds: number) => {
    let v = h;
    for (let i = 0; i < rounds; i += 1) v = Math.imul(v ^ (v >>> 13), 0x01000193) >>> 0;
    return v.toString(16).padStart(8, '0').slice(0, 4);
  };
  return `${part(0)}…${part(1)}`;
}

const byOldestFirst = (a: AuditEntry, b: AuditEntry) => (a.atIso < b.atIso ? -1 : a.atIso > b.atIso ? 1 : 0);

/** Newest entry — the current head the next `prev_hash` must point at. */
function chainHead(): AuditEntry | undefined {
  return [...AUDIT_ENTRIES].sort(byOldestFirst).pop();
}

export interface AuditAppendInput {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  before?: Record<string, AuditValue>;
  after?: Record<string, AuditValue>;
  reason: string;
  actor: string;
  role: RoleCode;
}

/**
 * Append one audited action to the log (SEC-003) — how the UI records a waive or an escalate-manual
 * before the API exists. The new row continues the hash chain: `prev_hash` is the current head's
 * `hash`, so "ตรวจสอบ hash chain" still verifies after the action.
 *
 * MOCK LIMITATION: the log is an in-memory array, so appended rows are lost on reload and no row is
 * ever sent to the server. Nothing is persisted (no localStorage) — a reload restores the fixtures.
 */
export function appendAuditEntry(input: AuditAppendInput): AuditEntry {
  const head = chainHead();
  const seq = AUDIT_ENTRIES.reduce((max, e) => Math.max(max, Number(e.id.replace(/\D/g, '')) || 0), 0) + 1;
  const id = `AUD-${String(seq).padStart(7, '0')}`;
  const prevHash = head ? head.hash : '0000…0000';
  const { at, atIso } = nowStamp();
  const entry: AuditEntry = {
    id,
    at,
    atIso,
    actor: input.actor,
    role: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? {},
    after: input.after ?? {},
    reason: input.reason,
    ip: '10.24.6.18',
    hash: mockHash(`${prevHash}|${id}|${input.reason}`),
    prevHash,
  };
  AUDIT_ENTRIES.push(entry);
  return entry;
}

/**
 * Walk the chain oldest → newest and report the first row whose `prev_hash` does not match the
 * previous row's `hash`. Runs over the live array, so it also covers rows appended at runtime.
 */
export function verifyAuditChain(): ChainVerifyResult {
  const chain = [...AUDIT_ENTRIES].sort(byOldestFirst);
  let brokenAt: string | null = null;
  for (let i = 1; i < chain.length; i += 1) {
    if (chain[i].prevHash !== chain[i - 1].hash) {
      brokenAt = chain[i].id;
      break;
    }
  }
  return { ok: brokenAt === null, checked: chain.length, brokenAt, checkedAt: nowStamp().at };
}
