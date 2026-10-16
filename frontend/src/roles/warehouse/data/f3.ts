/**
 * F3 (emergency) mock data for the WH "kits & incidents" page: ready-set stock + recipes,
 * incidents with their linked urgent requests, and post-incident returns. Counts only, no patient data.
 */
import type { HospitalCode, Tone } from './transport';

export interface RecipeLine {
  item: string;
  perSet: number;
  unit: string;
  /** Loose stock on hand (not yet packed into a set). */
  onHand: number;
  coldChain?: boolean;
}

export interface KitDef {
  key: string;
  th: string;
  en: string;
  ready: number;
  target: number;
  recipe: RecipeLine[];
}

/** Recipes are placeholders owned by a clinical owner (spec ASM-18). */
export const KIT_DEFS: KitDef[] = [
  {
    key: 'trauma', th: 'ชุดบาดเจ็บ', en: 'Trauma', ready: 6, target: 10,
    recipe: [
      { item: 'Adrenaline 1 mg/mL amp', perSet: 2, unit: 'AMP', onHand: 62 },
      { item: 'Tranexamic acid 500 mg inj', perSet: 2, unit: 'AMP', onHand: 18 },
      { item: 'NSS 0.9% 1000 mL', perSet: 2, unit: 'BAG', onHand: 80 },
      { item: 'ชุดแผล/ผ้าก๊อซ', perSet: 1, unit: 'SET', onHand: 14 },
    ],
  },
  {
    key: 'intubation', th: 'ชุดใส่ท่อช่วยหายใจ', en: 'Intubation', ready: 5, target: 6,
    recipe: [
      { item: 'Succinylcholine 100 mg inj', perSet: 1, unit: 'AMP', onHand: 9, coldChain: true },
      { item: 'Propofol 200 mg inj', perSet: 1, unit: 'AMP', onHand: 12 },
      { item: 'ท่อช่วยหายใจ เบอร์ 7.5', perSet: 1, unit: 'EA', onHand: 7 },
      { item: 'Laryngoscope blade', perSet: 1, unit: 'EA', onHand: 5 },
    ],
  },
  {
    key: 'iv', th: 'ชุดให้สารน้ำ', en: 'IV', ready: 15, target: 20,
    recipe: [
      { item: 'NSS 0.9% 1000 mL', perSet: 2, unit: 'BAG', onHand: 80 },
      { item: 'ชุดให้สารน้ำ (IV set)', perSet: 2, unit: 'SET', onHand: 30 },
      { item: 'Angiocath 20G', perSet: 2, unit: 'EA', onHand: 25 },
      { item: 'แอลกอฮอล์สวอบ', perSet: 4, unit: 'EA', onHand: 200 },
    ],
  },
  {
    key: 'burn', th: 'ชุดแผลไฟไหม้', en: 'Burn', ready: 2, target: 6,
    recipe: [
      { item: 'Silver sulfadiazine 1% cream 500 g', perSet: 1, unit: 'JAR', onHand: 3 },
      { item: 'ผ้าก๊อซปลอดเชื้อ', perSet: 6, unit: 'EA', onHand: 40 },
      { item: 'NSS 0.9% 1000 mL', perSet: 3, unit: 'BAG', onHand: 80 },
      { item: 'Paracetamol 1 g inj', perSet: 2, unit: 'AMP', onHand: 16 },
    ],
  },
];

/** How many more sets can be assembled from loose stock, and which line limits it. */
export function assemblable(k: KitDef): { sets: number; limiting: RecipeLine } {
  let best = k.recipe[0];
  let sets = Math.floor(best.onHand / best.perSet);
  for (const r of k.recipe) {
    const n = Math.floor(r.onHand / r.perSet);
    if (n < sets) {
      sets = n;
      best = r;
    }
  }
  return { sets, limiting: best };
}

export function kitLevel(pct: number): { color: string; label: string; cls: string } {
  if (pct >= 80) return { color: '#166534', label: 'พร้อมใช้', cls: 't-green' };
  if (pct >= 50) return { color: '#D97706', label: 'ควรเติม', cls: 't-amber' };
  return { color: '#B91C1C', label: 'ต่ำ', cls: 't-red' };
}

export type RequestStatus = 'PENDING' | 'NEED_CONFIRM' | 'ACCEPTED' | 'RECEIVED';

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'รอผู้ให้ตอบ', tone: 'amber' },
  NEED_CONFIRM: { label: 'รอเรายืนยัน (ผู้ให้)', tone: 'red' },
  ACCEPTED: { label: 'ตอบรับแล้ว · กำลังเตรียมส่ง', tone: 'blue' },
  RECEIVED: { label: 'รับของแล้ว', tone: 'teal' },
};

export interface UrgentRequest {
  id: string;
  /** borrower = our ER asked another hospital; lender = another hospital asked us. */
  side: 'borrower' | 'lender';
  drug: string;
  qty: number;
  unit: string;
  counterpart: HospitalCode;
  status: RequestStatus;
  /** Lender side: the inbox task WH must confirm. */
  inboxId?: string;
}

export interface Incident {
  id: string;
  own: boolean;
  hospital: HospitalCode;
  title: string;
  place: string;
  /** Casualty counts by triage level only (ASM-27: no patient-identifiable data). */
  triage: { red: number; yellow: number; green: number };
  reportedAt: string;
  eta: string;
  status: 'OPEN' | 'CLOSED';
  kits: { kit: string; qty: number; packId?: string }[];
  requests: UrgentRequest[];
}

export const INCIDENTS: Incident[] = [
  {
    id: 'INC-2026-0007', own: true, hospital: 'HA', title: 'รถบัสพลิกคว่ำ', place: 'ถ.สุขุมวิท กม.34', triage: { red: 3, yellow: 6, green: 9 },
    reportedAt: '18:52', eta: 'รถพยาบาลชุดแรก 19:40', status: 'OPEN',
    kits: [
      { kit: 'ชุดบาดเจ็บ', qty: 4, packId: 'PK-2026-0012' },
      { kit: 'ชุดใส่ท่อช่วยหายใจ', qty: 2, packId: 'PK-2026-0013' },
    ],
    requests: [
      { id: 'BR-2026-000132', side: 'borrower', drug: 'NORepinephrine 4 mg/4 mL', qty: 20, unit: 'AMP', counterpart: 'HB', status: 'ACCEPTED' },
      { id: 'BR-2026-000133', side: 'borrower', drug: 'PRC group O', qty: 4, unit: 'UNIT', counterpart: 'HD', status: 'PENDING' },
    ],
  },
  {
    id: 'INC-2026-0008', own: false, hospital: 'HB', title: 'ไฟไหม้โรงงาน', place: 'นิคมฯ บางพลี', triage: { red: 2, yellow: 5, green: 4 },
    reportedAt: '19:05', eta: 'ผู้ป่วยถึง รพ.บางพลี 19:30', status: 'OPEN', kits: [],
    requests: [{ id: 'BR-2026-000131', side: 'lender', drug: 'Adrenaline 1 mg/mL amp', qty: 30, unit: 'AMP', counterpart: 'HB', status: 'NEED_CONFIRM', inboxId: 'IB-F3-0131' }],
  },
  {
    id: 'INC-2026-0005', own: true, hospital: 'HA', title: 'อุบัติเหตุรถตู้ชนหมู่', place: 'ถ.บางนา-ตราด กม.18', triage: { red: 1, yellow: 4, green: 7 },
    reportedAt: '9 ต.ค. 14:10', eta: 'ปิดเหตุ 10 ต.ค. 02:30', status: 'CLOSED', kits: [],
    requests: [
      { id: 'BR-2026-000118', side: 'borrower', drug: 'Adrenaline 1 mg/mL amp', qty: 20, unit: 'AMP', counterpart: 'HD', status: 'RECEIVED' },
      { id: 'BR-2026-000119', side: 'lender', drug: 'Tranexamic acid 500 mg inj', qty: 10, unit: 'AMP', counterpart: 'HB', status: 'RECEIVED' },
    ],
  },
];

export type ReturnKind = 'we_return' | 'they_return' | 'to_stock';
export type ReturnStatus = 'OPEN' | 'REMINDED' | 'OVERDUE' | 'DONE';

export const RETURN_STATUS_META: Record<ReturnStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'รอคืน', tone: 'amber' },
  REMINDED: { label: 'เตือนแล้ว', tone: 'amber' },
  OVERDUE: { label: 'เกินกำหนด', tone: 'red' },
  DONE: { label: 'คืนแล้ว', tone: 'teal' },
};

export const RETURN_KIND_META: Record<ReturnKind, { label: string; tone: Tone; action: string }> = {
  we_return: { label: 'เราต้องคืน รพ.อื่น', tone: 'orange', action: 'ยืนยันส่งคืน' },
  they_return: { label: 'รพ.อื่นต้องคืนเรา', tone: 'blue', action: 'ยืนยันรับคืน' },
  to_stock: { label: 'คืนเข้าสต็อกเรา', tone: 'grey', action: 'ยืนยันรับเข้าคลัง' },
};

export interface ReturnItem {
  id: string;
  kind: ReturnKind;
  incident: string;
  drug: string;
  qty: number;
  unit: string;
  counterpart?: HospitalCode;
  due: string;
  status: ReturnStatus;
  note: string;
}

export const RETURNS: ReturnItem[] = [
  { id: 'RT-2026-0021', kind: 'we_return', incident: 'INC-2026-0005', drug: 'Adrenaline 1 mg/mL amp', qty: 20, unit: 'AMP', counterpart: 'HD', due: '9 พ.ย. 2569', status: 'OPEN', note: 'คืนเป็นยาตัวเดิมจำนวนเท่ากัน (ASM-24) · ครบกำหนด 30 วัน' },
  { id: 'RT-2026-0022', kind: 'we_return', incident: 'INC-2026-0005', drug: 'PRC group O', qty: 2, unit: 'UNIT', counterpart: 'HB', due: '23 ต.ค. 2569', status: 'REMINDED', note: 'ส่วนประกอบโลหิต: คืนผ่านธนาคารเลือด (BLOOD_REPLACEMENT)' },
  { id: 'RT-2026-0023', kind: 'they_return', incident: 'INC-2026-0005', drug: 'Tranexamic acid 500 mg inj', qty: 10, unit: 'AMP', counterpart: 'HB', due: '8 ต.ค. 2569', status: 'OVERDUE', note: 'รพ.บางพลียืมไว้ตอนเหตุ · เลยกำหนด' },
  { id: 'RT-2026-0024', kind: 'to_stock', incident: 'INC-2026-0005', drug: 'ชุดบาดเจ็บที่ไม่ได้ใช้', qty: 2, unit: 'ชุด', due: '—', status: 'OPEN', note: 'ตรวจสภาพและวันหมดอายุ แล้วเพิ่มเข้าเซ็ตพร้อมใช้' },
];

/** F3 pack task: patient sets to assemble for one of OUR incidents (from the ER-approved plan). */
export interface PackTask {
  id: string;
  incident: string;
  kitKey: string;
  qty: number;
}

export const PACK_TASKS: PackTask[] = [
  { id: 'PK-2026-0012', incident: 'INC-2026-0007', kitKey: 'trauma', qty: 4 },
  { id: 'PK-2026-0013', incident: 'INC-2026-0007', kitKey: 'intubation', qty: 2 },
];
