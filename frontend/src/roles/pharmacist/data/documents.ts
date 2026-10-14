/** UI-15 Document printing — mock transfer_document data (spec XC-1 / FL-10).
 *  Documents are auto-issued after approval (FR-XC-001), immutable once issued
 *  (FR-XC-005: corrections create a new version and void the old one), stored
 *  with SHA-256 (FR-XC-006).
 */

export type DocType = 'BORROW' | 'TRANSFER' | 'RETURN' | 'INCIDENT_BORROW' | 'INCIDENT_USAGE';

export interface DocParty {
  name: string;
  addr: string;
}

export interface DocLine {
  name: string;
  qty: number;
  unit: string;
  code: string;
  expiry: string;
}

export interface TransferDoc {
  id: string;
  version: number;
  /** "13 ต.ค. 15:10" — list column 1 */
  at: string;
  /** "13 ตุลาคม 2569 15:10" — paper header */
  issuedAt: string;
  type: DocType;
  status: 'ISSUED' | 'VOID';
  /** list column 3 headline */
  drug: string;
  qty: number;
  unit: string;
  code: string;
  meta: string;
  ref: string;
  sha: string;
  partyA: DocParty;
  partyB: DocParty;
  lines: DocLine[];
  delivery: string;
  /** in-kind return terms (BORROW / INCIDENT_BORROW only, F-30) */
  returnDue?: string;
  terms?: string[];
  note?: string;
  voidNote?: { text: string; newerId: string };
}

export const DOC_TYPE_META: Record<DocType, { label: string; tone: string; th: string; en: string }> = {
  BORROW: { label: 'ยืม', tone: 't-blue', th: 'ใบสำคัญยืมเวชภัณฑ์ระหว่างโรงพยาบาล', en: 'Inter-hospital borrow slip · BORROW_SLIP' },
  TRANSFER: { label: 'โอนย้าย', tone: 't-teal', th: 'ใบสำคัญโอนย้ายเวชภัณฑ์ระหว่างโรงพยาบาล', en: 'Inter-hospital transfer slip · TRANSFER' },
  RETURN: { label: 'คืน', tone: 't-green', th: 'ใบสำคัญคืนเวชภัณฑ์ระหว่างโรงพยาบาล', en: 'Inter-hospital return slip · RETURN_SLIP' },
  INCIDENT_BORROW: { label: 'อุบัติเหตุยืม', tone: 't-orange', th: 'ใบสำคัญยืมใช้ในเหตุฉุกเฉิน', en: 'Incident borrow slip · INCIDENT_BORROW_SUMMARY' },
  INCIDENT_USAGE: { label: 'เบิกใช้จริง UCEP', tone: 't-grey', th: 'สรุปการใช้เวชภัณฑ์ในเหตุฉุกเฉิน', en: 'Incident usage summary · INCIDENT_USAGE_SUMMARY' },
};

export interface DocTab {
  id: string;
  label: string;
  types: DocType[] | null;
}

export const DOC_TABS: DocTab[] = [
  { id: 'all', label: 'ทั้งหมด', types: null },
  { id: 'borrow', label: 'ยืม', types: ['BORROW'] },
  { id: 'return', label: 'คืน', types: ['RETURN'] },
  { id: 'transfer', label: 'โอนย้าย', types: ['TRANSFER'] },
  { id: 'incident', label: 'เหตุฉุกเฉิน', types: ['INCIDENT_BORROW', 'INCIDENT_USAGE'] },
];

const HOSP_SPA = 'รพ.สมุทรปราการ';
const ADDR_SPA = '999 ถนนสุขุมวิท ต.ปากน้ำ อ.เมือง จ.สมุทรปราการ 10270';
const HOSP_PRD = 'รพ.พระประแดง';
const ADDR_PRD = '71 ถนนสุขุมวิท ต.บางหัวกระดาน อ.พระประแดง จ.สมุทรปราการ 10130';
const HOSP_BPL = 'รพ.บางพลี';
const ADDR_BPL = 'ถนนบางพลี-ลาดกระบอง ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540';
const HOSP_BKB = 'รพ.บางบ่อ';
const ADDR_BKB = 'ถนนเทียนดัด ต.บางบ่อ อ.บางบ่อ จ.สมุทรปราการ 10560';

const DEFAULT_TERMS = [
  'คืนเป็นชนิดเดียวกัน จำนวนเท่ากันตามหน่วยฐาน (F-30) · ไม่รับคืนเป็นเงิน',
  'กำหนดคืน 30 วันหลังได้รับของ · ระบบแจ้งเตือนก่อน 7 วัน, 1 วัน และรายวันเมื่อค้างคืน (ASM-24)',
  'ล็อตที่คืนต้องเป็นล็อตเดียวกับที่ยืม · ต่างล็อตต้องได้รับอนุมัติจากผู้ให้ยืมก่อน',
];

/** Newest first — verbatim order from the mockup list. */
export const DOCUMENTS: TransferDoc[] = [
  {
    id: 'BS-2026-000418',
    version: 1,
    at: '13 ต.ค. 15:10',
    issuedAt: '13 ตุลาคม 2569 15:10',
    type: 'BORROW',
    status: 'ISSUED',
    drug: 'AMPicillin 1 g inj',
    qty: 20,
    unit: 'VIAL',
    code: 'AMP-2411',
    meta: '20 VIAL · รหัส AMP-2411',
    ref: 'BR-2026-000236 · รอบ 1',
    sha: '51fa 39fa · 71c01 · 8t2e c21e',
    partyA: { name: HOSP_PRD, addr: ADDR_PRD },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'AMPicillin 1 g inj', qty: 20, unit: 'VIAL', code: 'AMP-2411', expiry: '30 มี.ค. 2027' }],
    delivery: 'การส่งมอบ: ตามคำขอ BR-2026-000236 · รอบ 1 · รอยืนยันการจัดส่ง (UI-06 → UI-14)',
    returnDue: '12 พ.ย. 2026',
    terms: DEFAULT_TERMS,
  },
  {
    id: 'TS-2026-000207',
    version: 1,
    at: '13 ต.ค. 18:46',
    issuedAt: '13 ตุลาคม 2569 18:46',
    type: 'TRANSFER',
    status: 'ISSUED',
    drug: 'AMLOdipine 5 mg tab',
    qty: 500,
    unit: 'เม็ด',
    code: 'AML-5033',
    meta: '500 เม็ด · รหัส AML-5033',
    ref: 'TR-2026-000340',
    sha: '7c11 4b02 · 9aa3 · d17e 40fa',
    partyA: { name: HOSP_SPA, addr: ADDR_SPA },
    partyB: { name: HOSP_BKB, addr: ADDR_BKB },
    lines: [{ name: 'AMLOdipine 5 mg tab', qty: 500, unit: 'เม็ด', code: 'AML-5033', expiry: '5 ส.ค. 2027' }],
    delivery: 'การส่งมอบ: ตามแผน TR-2026-000340 · รอสถานะ LOADED → IN_TRANSIT (UI-14)',
    note: 'การโอนถาวร ไม่มีการคืน (ASM-38)',
  },
  {
    id: 'TS-2026-000205',
    version: 2,
    at: '12 ต.ค. 14:05',
    issuedAt: '12 ตุลาคม 2569 14:05',
    type: 'TRANSFER',
    status: 'ISSUED',
    drug: 'Omeprazole 40 mg inj',
    qty: 100,
    unit: 'VIAL',
    code: 'OMP-660118',
    meta: '100 VIAL · รหัส OMP-660118',
    ref: 'TR-2026-000338',
    sha: 'ae90 5c71 · 3ff2 · 0b61 c9d4',
    partyA: { name: HOSP_SPA, addr: ADDR_SPA },
    partyB: { name: HOSP_PRD, addr: ADDR_PRD },
    lines: [{ name: 'Omeprazole 40 mg inj', qty: 100, unit: 'VIAL', code: 'OMP-660118', expiry: '2 ม.ค. 2027' }],
    delivery: 'การส่งมอบ: ตามแผน TR-2026-000338 · กำหนดส่ง 14 ต.ค. 2569 (UI-14)',
    note: 'เวอร์ชันใหม่แทน TS-2026-000203 (แก้จำนวน) · การโอนถาวร ไม่มีการคืน (ASM-38)',
  },
  {
    id: 'TS-2026-000203',
    version: 1,
    at: '12 ต.ค. 12:33',
    issuedAt: '12 ตุลาคม 2569 12:33',
    type: 'TRANSFER',
    status: 'VOID',
    drug: 'Omeprazole 40 mg inj',
    qty: 120,
    unit: 'VIAL',
    code: 'OMP-660118',
    meta: '120 VIAL · รหัส OMP-660118',
    ref: 'TR-2026-000338',
    sha: '2d84 e1c0 · 66ab · 51f9 7702',
    partyA: { name: HOSP_SPA, addr: ADDR_SPA },
    partyB: { name: HOSP_PRD, addr: ADDR_PRD },
    lines: [{ name: 'Omeprazole 40 mg inj', qty: 120, unit: 'VIAL', code: 'OMP-660118', expiry: '2 ม.ค. 2027' }],
    delivery: 'การส่งมอบ: ตามแผน TR-2026-000338 · ยกเลิกก่อนออกเดินทาง',
    note: 'การโอนถาวร ไม่มีการคืน (ASM-38)',
    voidNote: { text: 'แก้จำนวน 120 → 100 VIAL เมื่อ 12 ต.ค. 14:05 น. · เอกสารเนื้อหาตรึงหลังออก จึงออกใหม่แทน (FR-XC-005)', newerId: 'TS-2026-000205' },
  },
  {
    id: 'TS-2026-000206',
    version: 1,
    at: '12 ต.ค. 16:05',
    issuedAt: '12 ตุลาคม 2569 16:05',
    type: 'TRANSFER',
    status: 'ISSUED',
    drug: 'Omeprazole 40 mg inj',
    qty: 80,
    unit: 'VIAL',
    code: 'OMP-660118',
    meta: '80 VIAL · รหัส OMP-660118',
    ref: 'TR-2026-000339',
    sha: 'b3e7 0d55 · 41c8 · 9902 ef6a',
    partyA: { name: HOSP_SPA, addr: ADDR_SPA },
    partyB: { name: HOSP_BKB, addr: ADDR_BKB },
    lines: [{ name: 'Omeprazole 40 mg inj', qty: 80, unit: 'VIAL', code: 'OMP-660118', expiry: '2 ม.ค. 2027' }],
    delivery: 'การส่งมอบ: ตามแผน TR-2026-000339 · รอสถานะ ARRIVED (UI-14)',
    note: 'การโอนถาวร ไม่มีการคืน (ASM-38)',
  },
  {
    id: 'BS-2026-000414',
    version: 1,
    at: '12 ต.ค. 02:10',
    issuedAt: '12 ตุลาคม 2569 02:10',
    type: 'BORROW',
    status: 'ISSUED',
    drug: 'PRC group O',
    qty: 4,
    unit: 'UNIT',
    code: 'PRC-GO',
    meta: '4 UNIT · รหัส PRC-GO',
    ref: 'BR-2026-000301 · ฉุกเฉิน',
    sha: 'c0a2 7e13 · dd40 · 18bf 65e9',
    partyA: { name: HOSP_PRD, addr: ADDR_PRD },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'PRC group O (เม็ดเลือดแดงชะลอ)', qty: 4, unit: 'UNIT', code: 'PRC-GO', expiry: 'อายุใช้งาน 35 วัน' }],
    delivery: 'การส่งมอบ: ทางรถโรงพยาบาล ห่วงโซ่ความเย็น 2–8 °C · ยืนยันผ่านธนาคารเลือด',
    returnDue: '11 พ.ย. 2026',
    terms: [
      'เลือดคืนเป็นการแทนที่ผ่านธนาคารเลือด (BLOOD_REPLACEMENT) ไม่ใช่คืนเป็นสินค้า (BR-XC-013)',
      'กำหนดคืน 30 วัน · ธนาคารเลือด รพ.ผู้ยืม ทดแทนหมู่เดียวกันและตรวจชนิดเลือดก่อนส่ง',
      'ทุกหน่วยต้องมีเลขครุภัณฑ์/หน่วยเลือดส่งคืนครบ 4 UNIT',
    ],
  },
  {
    id: 'BS-2026-000409',
    version: 1,
    at: '11 ต.ค. 09:15',
    issuedAt: '11 ตุลาคม 2569 09:15',
    type: 'BORROW',
    status: 'ISSUED',
    drug: 'NOrEpinephrine 4 mg/4 mL',
    qty: 20,
    unit: 'AMP',
    code: 'NOR-0411',
    meta: '20 AMP · รหัส NOR-0411',
    ref: 'BR-2026-000298 · รอบ 1',
    sha: '5f01 88ca · e2b7 · 44d0 13aa',
    partyA: { name: HOSP_BPL, addr: ADDR_BPL },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'NOrEpinephrine 4 mg/4 mL', qty: 20, unit: 'AMP', code: 'NOR-0411', expiry: '31 ธ.ค. 2569' }],
    delivery: 'การส่งมอบ: ตามคำขอ BR-2026-000298 · รอบ 1 · ส่งมอบแล้ว 11 ต.ค. 10:40 น.',
    returnDue: '10 พ.ย. 2026',
    terms: DEFAULT_TERMS,
  },
  {
    id: 'BS-2026-000410',
    version: 1,
    at: '11 ต.ค. 09:20',
    issuedAt: '11 ตุลาคม 2569 09:20',
    type: 'BORROW',
    status: 'ISSUED',
    drug: 'NOrEpinephrine 4 mg/4 mL',
    qty: 10,
    unit: 'AMP',
    code: 'NOR-0411',
    meta: '10 AMP · รหัส NOR-0411',
    ref: 'BR-2026-000298 · รอบ 2',
    sha: '7b93 10df · 0c55 · a2e6 8814',
    partyA: { name: HOSP_BPL, addr: ADDR_BPL },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'NOrEpinephrine 4 mg/4 mL', qty: 10, unit: 'AMP', code: 'NOR-0411', expiry: '31 ธ.ค. 2569' }],
    delivery: 'การส่งมอบ: ตามคำขอ BR-2026-000298 · รอบ 2 · ส่งมอบแล้ว 11 ต.ค. 11:05 น.',
    returnDue: '10 พ.ย. 2026',
    terms: DEFAULT_TERMS,
  },
  {
    id: 'RS-2026-000088',
    version: 1,
    at: '12 ต.ค. 10:38',
    issuedAt: '12 ตุลาคม 2569 10:38',
    type: 'RETURN',
    status: 'ISSUED',
    drug: 'ADREnaline 1 mg/mL inj',
    qty: 17,
    unit: 'AMP',
    code: 'ADR-21727',
    meta: '17 AMP · รหัส 21727 · RETURNED',
    ref: 'BR-2026-000271 · คืนครบ',
    sha: '31ce 9a60 · 5b18 · 7742 c3d0',
    partyA: { name: HOSP_BPL, addr: ADDR_BPL },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'ADREnaline 1 mg/mL inj', qty: 17, unit: 'AMP', code: 'ADR-21727', expiry: '30 มิ.ย. 2570' }],
    delivery: 'คืนครบ 17 AMP = ยอดค้างคืนทั้งหมด (F-30) · ผู้ให้ยืมยืนยันรับของแล้ว',
    note: 'ปิดยอดหนี้คืน · return_obligation = RETURNED',
  },
  {
    id: 'RS-2026-000081',
    version: 1,
    at: '5 พ.ย. 68 · 14:18',
    issuedAt: '5 พฤศจิกายน 2568 14:18',
    type: 'RETURN',
    status: 'ISSUED',
    drug: 'ADREnaline 1 mg/mL inj',
    qty: 15,
    unit: 'AMP',
    code: 'ADR-21727',
    meta: '15 AMP · รหัส 21727',
    ref: 'BR-2025-000884 · คืนครบ',
    sha: '0dd4 6f29 · 7e30 · b5c1 9902',
    partyA: { name: HOSP_BKB, addr: ADDR_BKB },
    partyB: { name: HOSP_SPA, addr: ADDR_SPA },
    lines: [{ name: 'ADREnaline 1 mg/mL inj', qty: 15, unit: 'AMP', code: 'ADR-21727', expiry: '30 มิ.ย. 2570' }],
    delivery: 'คืนครบ 15 AMP = ยอดค้างคืนทั้งหมด (F-30) · ผู้ให้ยืมยืนยันรับของแล้ว',
    note: 'ปิดยอดหนี้คืน · return_obligation = RETURNED',
  },
  {
    id: 'IR-2026-000014',
    version: 1,
    at: '12 ต.ค. 16:40',
    issuedAt: '12 ตุลาคม 2569 16:40',
    type: 'INCIDENT_BORROW',
    status: 'ISSUED',
    drug: 'ยืมใช้ในเหตุฉุกเฉิน',
    qty: 12,
    unit: 'ชิ้น',
    code: 'INC-2026-0014',
    meta: 'บันทึก 2 รายการ (12 ชิ้น)',
    ref: 'INC-2026-0014 · สรุปยืม/คืน',
    sha: '9a17 2c88 · ff04 · 3d5e 6b71',
    partyA: { name: `${HOSP_SPA} (แผนกฉุกเฉิน)`, addr: ADDR_SPA },
    partyB: { name: HOSP_PRD, addr: ADDR_PRD },
    lines: [
      { name: 'AMPicillin 1 g inj', qty: 8, unit: 'VIAL', code: 'AMP-2411', expiry: '30 มี.ค. 2027' },
      { name: 'NOrEpinephrine 4 mg/4 mL', qty: 4, unit: 'AMP', code: 'NOR-0411', expiry: '31 ธ.ค. 2569' },
    ],
    delivery: 'สรุปยืม/คืนหลังเหตุการณ์ · ทั้ง 2 รายการคืนครบแล้ว (F3 §11)',
    returnDue: '26 ต.ค. 2569',
    terms: DEFAULT_TERMS,
  },
  {
    id: 'UR-2026-000014',
    version: 1,
    at: '12 ต.ค. 16:40',
    issuedAt: '12 ตุลาคม 2569 16:40',
    type: 'INCIDENT_USAGE',
    status: 'ISSUED',
    drug: 'เบิกใช้จริง UCEP',
    qty: 12,
    unit: 'ชิ้น',
    code: 'UCEP-INC-14',
    meta: 'สรุปทรัพยากรที่ใช้ในเหตุฉุกเฉิน · อ้างอิง UCEP',
    ref: 'INC-2026-0014 · สรุปการใช้',
    sha: 'e5b8 4401 · 9c72 · 6a3d ff10',
    partyA: { name: `${HOSP_SPA} (แผนกฉุกเฉิน)`, addr: ADDR_SPA },
    partyB: { name: `${HOSP_SPA} (ฝ่ายพัสดุ/เคลม)`, addr: ADDR_SPA },
    lines: [
      { name: 'AMPicillin 1 g inj (ใช้จริง)', qty: 5, unit: 'VIAL', code: 'AMP-2411', expiry: '30 มี.ค. 2027' },
      { name: 'NOrEpinephrine 4 mg/4 mL (ใช้จริง)', qty: 7, unit: 'AMP', code: 'NOR-0411', expiry: '31 ธ.ค. 2569' },
    ],
    delivery: 'ใช้จริงในเหตุการณ์ · แนบเป็นหลักฐานเคลม UCEP ตามช่องทางปกติของ รพ. (F3 §11)',
    note: 'รายการที่ยืมแต่ไม่ได้ใช้ คืนเป็นชนิดเดียวกัน (return in kind)',
  },
];
