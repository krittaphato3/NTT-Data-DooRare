import type { ApiBorrowLeg, ApiIncidentStatus, EmergencyClass, TriageLevel } from '../../../services/incidentApi';

/** Display helpers of the live F3 screens: labels and badge classes for the states the API returns. */

export const TRIAGE: { key: TriageLevel; label: string; color: string; bg: string; border: string }[] = [
  { key: 'RED', label: 'แดง', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { key: 'YELLOW', label: 'เหลือง', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { key: 'GREEN', label: 'เขียว', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  { key: 'BLACK', label: 'ดำ', color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' },
  { key: 'UNKNOWN', label: 'ไม่ทราบระดับ', color: '#6d28d9', bg: '#f5f3ff', border: '#c4b5fd' },
];

export const classMeta = (c: EmergencyClass | string): { label: string; cls: string } =>
  c === 'CRITICAL' ? { label: 'วิกฤต', cls: 'ug-critical' } : { label: 'สนับสนุน', cls: 'ug-normal' };

export const incidentStatusMeta = (s: ApiIncidentStatus): { label: string; cls: string } => {
  switch (s) {
    case 'OPEN':
      return { label: 'รับเหตุแล้ว · ยังไม่มีแผน', cls: 'st-pending' };
    case 'PLAN_REVIEW':
      return { label: 'รอตรวจและอนุมัติแผน', cls: 'st-pending' };
    case 'ACTIVE':
      return { label: 'กำลังดำเนินการ', cls: 'st-transit' };
    case 'CLOSE_REQUESTED':
      return { label: 'ขอปิดเหตุ · รอลงนามร่วม', cls: 'st-pending' };
    case 'RECONCILED':
      return { label: 'สรุปแล้ว', cls: 'st-approved' };
    default:
      return { label: 'ยกเลิก', cls: 'st-rejected' };
  }
};

export const legStatusMeta = (s: ApiBorrowLeg['status']): { label: string; cls: string } => {
  switch (s) {
    case 'SENT':
    case 'PENDING':
      return { label: 'รอผู้ให้ตอบ', cls: 'st-pending' };
    case 'ACCEPTED':
      return { label: 'ยืนยันแล้ว', cls: 'st-approved' };
    case 'PARTIAL':
      return { label: 'ให้บางส่วน', cls: 'st-approved' };
    case 'LOADED':
      return { label: 'ขึ้นรถแล้ว', cls: 'st-transit' };
    case 'IN_TRANSIT':
      return { label: 'กำลังขนส่ง', cls: 'st-transit' };
    case 'RECEIVED':
      return { label: 'รับของแล้ว', cls: 'st-delivered' };
    case 'REJECTED':
      return { label: 'ปฏิเสธ', cls: 'st-rejected' };
    case 'TIMED_OUT':
      return { label: 'หมดเวลา', cls: 'st-timeout' };
    default:
      return { label: 'ยกเลิก', cls: 't-grey' };
  }
};

export const REJECT_TEXT: Record<string, string> = {
  FIRST_CONFIRMED: 'ยกเลิกอัตโนมัติ · มีผู้ยืนยันครบจำนวนก่อน',
  PLAN_REDUCED: 'ยกเลิก · แผนลดจำนวนที่ต้องยืม',
  INCIDENT_CANCELLED: 'ยกเลิก · เหตุการณ์ถูกยกเลิก',
  INCIDENT_CLOSING: 'ยกเลิก · ขอปิดเหตุการณ์แล้ว',
};

export const clock = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const dateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const mmss = (secs: number): string => {
  const s = Math.max(0, Math.round(secs));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

export const num = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 3 }));

export const TRIAGE_SHORT: Record<TriageLevel, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLACK: 'ดำ', UNKNOWN: 'ไม่ทราบ' };

/** Thai text for a rule row, e.g. "0.5 ชุด/ผู้ป่วยแดง". */
export const ruleText = (rows: { triage: TriageLevel; perPatient: number }[], unit: string): string =>
  rows.length === 0 ? '—' : rows.map((r) => `${r.perPatient} ${unit}/${TRIAGE_SHORT[r.triage]}`).join(' · ');

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
