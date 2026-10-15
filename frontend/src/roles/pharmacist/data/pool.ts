/** UI-08 Central pool + UI-09 Allocation plan review — mock data (spec F2a).
 *  F-23 transport economics: cost = 300 + 8฿/km (+500 cold chain); ratio ≥ 20% of
 *  line value ⇒ UNECONOMICAL — Agent withholds the recommendation and the owner
 *  pharmacist picks one of the four options (FR-F2a-005).
 */

export interface PoolLot {
  id: string;
  drug: string;
  code: string;
  qty: number;
  unit: string;
  value: number;
  expiry: string;
  daysLeft: number;
  from: string;
  releasedBy: string;
  releasedAt: string;
}

export type PlanStatus =
  | 'PENDING_MY_APPROVAL'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'AUTO_APPROVED'
  | 'NEEDS_DISCUSSION';

export interface PlanApproval {
  hospital: string;
  pharmacist: string;
  state: 'APPROVED' | 'WAITING' | 'REJECTED';
  at?: string;
}

export interface UneconomicalOption {
  id: 'return' | 'adjust' | 'destroy' | 'accept';
  label: string;
  hint: string;
}

export interface AllocationPlan {
  id: string;
  version: number;
  status: PlanStatus;
  drug: string;
  code: string;
  ved: 'V' | 'E' | 'D';
  qty: number;
  unit: string;
  unitValue: number;
  totalValue: number;
  /** F-23: 300 base + 8฿/km × km (+500 cold chain) */
  distanceKm: number;
  coldChain: boolean;
  transportCost: number;
  costRatioPct: number;
  economical: boolean;
  from: string;
  to: string;
  lotNo: string;
  expiry: string;
  daysLeft: number;
  /** merge candidate that would drop the ratio under the limit */
  merge?: { transportId: string; drug: string; to: string; newCost: number; newRatioPct: number };
  agent: { run: string; confidence: 'สูง' | 'ปานกลาง' | 'ต่ำ'; note: string };
  approvals: PlanApproval[];
  dueAt: string;
  decided?: { option: UneconomicalOption['id']; at: string };
}

const PLAN_STATUS_META: Record<PlanStatus, { label: string; tone: string }> = {
  PENDING_MY_APPROVAL: { label: 'รอฉันเห็นชอบ', tone: 't-amber' },
  AWAITING_APPROVAL: { label: 'รอเห็นชอบจาก รพ.อื่น', tone: 't-blue' },
  APPROVED: { label: 'อนุมัติแล้ว · รอเอกสาร', tone: 't-green' },
  AUTO_APPROVED: { label: 'อนุมัติอัตโนมัติ (เครือข่ายเดียว)', tone: 't-teal' },
  NEEDS_DISCUSSION: { label: 'ต้องหารือ · แก้แผน', tone: 't-red' },
};

export function planStatusMeta(s: PlanStatus): { label: string; tone: string } {
  return PLAN_STATUS_META[s];
}

/** F-23 threshold — shipping ≥ 20% of line value is uneconomical. */
export const COST_LIMIT_PCT = 20;

export const POOL_LOTS: PoolLot[] = [
  {
    id: 'PL-0461',
    drug: 'Meropenem 1 g inj',
    code: 'MRP-68014',
    qty: 40,
    unit: 'VIAL',
    value: 4500,
    expiry: '14 พ.ย. 2026',
    daysLeft: 31,
    from: 'รพ.สมุทรปราการ',
    releasedBy: 'ภก.ณัฐวุฒิ ศรีสุข',
    releasedAt: '12 ต.ค. · 09:40 น.',
  },
  {
    id: 'PL-0455',
    drug: 'Omeprazole 40 mg inj',
    code: 'OMP-11802',
    qty: 180,
    unit: 'VIAL',
    value: 6300,
    expiry: '2 ม.ค. 2027',
    daysLeft: 80,
    from: 'รพ.พระประแดง',
    releasedBy: 'ภก.วิทยา แสงทอง',
    releasedAt: '11 ต.ค. · 14:05 น.',
  },
  {
    id: 'PL-0450',
    drug: 'Ceftriaxone 2 g inj',
    code: 'CFT-24091',
    qty: 90,
    unit: 'VIAL',
    value: 5400,
    expiry: '20 ธ.ค. 2026',
    daysLeft: 67,
    from: 'รพ.สมุทรปราการ',
    releasedBy: 'ภก.ณัฐวุฒิ ศรีสุข',
    releasedAt: '10 ต.ค. · 11:20 น.',
  },
  {
    id: 'PL-0442',
    drug: 'Insulin glargine 100 U/mL pen',
    code: 'GL2402',
    qty: 30,
    unit: 'ตลับ',
    value: 4500,
    expiry: '28 ต.ค. 2027',
    daysLeft: 379,
    from: 'รพ.สมุทรปราการ',
    releasedBy: 'ภก.ณัฐวุฒิ ศรีสุข',
    releasedAt: '9 ต.ค. · 16:12 น.',
  },
  {
    id: 'PL-0438',
    drug: 'AMLOdipine 5 mg tab',
    code: 'AML-5033',
    qty: 500,
    unit: 'เม็ด',
    value: 1400,
    expiry: '5 ส.ค. 2027',
    daysLeft: 295,
    from: 'รพ.บางบ่อ',
    releasedBy: 'ภญ.กมลชนก พรหมมา',
    releasedAt: '8 ต.ค. · 10:02 น.',
  },
];

export const POOL_TOTAL_VALUE = POOL_LOTS.reduce((s, l) => s + l.value, 0);

const UNECONOMICAL_OPTIONS: UneconomicalOption[] = [
  { id: 'return', label: 'คืนกลับตามแผน (ผู้ผลิต/ผู้จัดจำหน่าย)', hint: 'ไม่เสียค่าขนส่ง · บันทึกเป็นคืนยา' },
  { id: 'adjust', label: 'ปรับแผนให้ใช้ใน รพ.เราเอง', hint: 'ใช้ให้หมดก่อนอายุ · ไม่ต้องส่ง' },
  { id: 'destroy', label: 'ทำลายตามกฎระเบียบ', hint: 'ทำลายพร้อมลงบันทึก · นับเป็นมูลค่าเสีย (F2b)' },
  { id: 'accept', label: 'ยินดีให้จัดสรรตามแผน', hint: 'ยอมจ่ายค่าขนส่ง despite เกินเกณฑ์' },
];

export function uneconomicalOptions(): UneconomicalOption[] {
  return UNECONOMICAL_OPTIONS;
}

export const ALLOCATION_PLANS: AllocationPlan[] = [
  {
    id: 'AP-2026-000046',
    version: 1,
    status: 'PENDING_MY_APPROVAL',
    drug: 'Meropenem 1 g inj',
    code: 'MRP-68014',
    ved: 'V',
    qty: 40,
    unit: 'VIAL',
    unitValue: 112.5,
    totalValue: 4500,
    distanceKm: 25,
    coldChain: false,
    transportCost: 1200,
    costRatioPct: 26.7,
    economical: false,
    from: 'รพ.สมุทรปราการ',
    to: 'รพ.พระประแดง',
    lotNo: 'MRP-68014-2',
    expiry: '14 พ.ย. 2026',
    daysLeft: 31,
    merge: {
      transportId: 'TR-2026-000338',
      drug: 'Omeprazole 40 mg inj',
      to: 'รพ.พระประแดง',
      newCost: 500,
      newRatioPct: 11.1,
    },
    agent: {
      run: 'F2_T1',
      confidence: 'สูง',
      note: 'ค่าขนส่ง 1,200 บาท คิดเป็น 26.7% ของมูลค่า 4,500 บาท เกินเกณฑ์ 20% (F-23) จึงไม่แนะนำให้ส่งเดี่ยว · หากรวมกับ TR-2026-000338 (Omeprazole → รพ.เดียวกัน) ค่าขนส่งลดเหลือ 500 บาท = 11.1% ผ่านเกณฑ์',
    },
    approvals: [
      { hospital: 'รพ.สมุทรปราการ', pharmacist: 'ภก.ณัฐวุฒิ ศรีสุข', state: 'WAITING' },
      { hospital: 'รพ.พระประแดง', pharmacist: 'ภก.วิทยา แสงทอง', state: 'WAITING' },
    ],
    dueAt: '14:30 น. วันนี้',
  },
  {
    id: 'AP-2026-000036',
    version: 1,
    status: 'PENDING_MY_APPROVAL',
    drug: 'Insulin glargine 100 U/mL pen',
    code: 'GL2402',
    ved: 'V',
    qty: 30,
    unit: 'ตลับ',
    unitValue: 150,
    totalValue: 4500,
    distanceKm: 25,
    coldChain: true,
    transportCost: 1700,
    costRatioPct: 37.8,
    economical: false,
    from: 'รพ.สมุทรปราการ',
    to: 'รพ.บางพลี',
    lotNo: 'GL2402-7',
    expiry: '28 ต.ค. 2027',
    daysLeft: 379,
    merge: {
      transportId: 'TR-2026-000341',
      drug: 'Omeprazole 40 mg inj',
      to: 'รพ.บางพลี',
      newCost: 800,
      newRatioPct: 17.8,
    },
    agent: {
      run: 'F2_T1',
      confidence: 'สูง',
      note: 'ค่าขนส่งรวม 1,700 บาท (รวมค่าควบคุมอุณหภูมิ 500) คิดเป็น 37.8% ของมูลค่า 4,500 บาท เกินเกณฑ์ 20% (F-23) จึงไม่แนะนำให้ส่ง · รพ.บางพลีใช้ insulin 8 ตลับ/สัปดาห์ น่าจะใช้ทันก่อนอายุ',
    },
    approvals: [
      { hospital: 'รพ.สมุทรปราการ', pharmacist: 'ภก.ณัฐวุฒิ ศรีสุข', state: 'WAITING' },
      { hospital: 'รพ.บางพลี', pharmacist: 'ภญ.สุดารัตน์ เกตุแก้ว', state: 'WAITING' },
    ],
    dueAt: '17:00 น. วันนี้',
  },
  {
    id: 'AP-2026-000045',
    version: 1,
    status: 'AWAITING_APPROVAL',
    drug: 'Omeprazole 40 mg inj',
    code: 'OMP-11802',
    ved: 'E',
    qty: 100,
    unit: 'VIAL',
    unitValue: 35,
    totalValue: 3500,
    distanceKm: 25,
    coldChain: false,
    transportCost: 500,
    costRatioPct: 14.3,
    economical: true,
    from: 'รพ.พระประแดง',
    to: 'รพ.สมุทรปราการ',
    lotNo: 'OMP-11802-4',
    expiry: '2 ม.ค. 2027',
    daysLeft: 80,
    agent: {
      run: 'F2_T1',
      confidence: 'ปานกลาง',
      note: 'ค่าขนส่ง 500 บาท = 14.3% ของมูลค่า ต่ำกว่าเกณฑ์ 20% (F-23) · อายุที่เหลือ 80 วัน มากกว่าเวลาเดินทาง + การใช้ที่ รพ.เรา (F-22) · เราเป็นผู้รับ ต้องเห็นชอบด้วย',
    },
    approvals: [
      { hospital: 'รพ.พระประแดง', pharmacist: 'ภก.วิทยา แสงทอง', state: 'APPROVED', at: '13 ต.ค. · 08:15 น.' },
      { hospital: 'รพ.สมุทรปราการ', pharmacist: 'ภก.ณัฐวุฒิ ศรีสุข', state: 'WAITING' },
    ],
    dueAt: 'พรุ่งนี้ 09:00 น.',
  },
  {
    id: 'AP-2026-000041',
    version: 1,
    status: 'AUTO_APPROVED',
    drug: 'AMLOdipine 5 mg tab',
    code: 'AML-5033',
    ved: 'D',
    qty: 500,
    unit: 'เม็ด',
    unitValue: 2.8,
    totalValue: 1400,
    distanceKm: 18,
    coldChain: false,
    transportCost: 200,
    costRatioPct: 14.3,
    economical: true,
    from: 'รพ.บางบ่อ',
    to: 'รพ.สมุทรปราการ',
    lotNo: 'AML-5033-9',
    expiry: '5 ส.ค. 2027',
    daysLeft: 295,
    agent: {
      run: 'F2_T1',
      confidence: 'สูง',
      note: 'เครือข่ายเดียวกัน → Auto Approve (F2 §4) · ค่าขนส่ง 200 บาท (รวมกับรอบอื่น) = 14.3% ต่ำกว่าเกณฑ์ 20% (F-23) · D ไม่เร่งด่วน ส่งรอบถัดไป',
    },
    approvals: [
      { hospital: 'รพ.บางบ่อ', pharmacist: 'ภญ.กมลชนก พรหมมา', state: 'APPROVED', at: '12 ต.ค. · 10:30 น.' },
      { hospital: 'รพ.สมุทรปราการ', pharmacist: 'ภก.ณัฐวุฒิ ศรีสุข', state: 'APPROVED', at: '12 ต.ค. · 10:30 น.' },
    ],
    dueAt: 'ส่งมอบ 15 ต.ค.',
  },
  {
    id: 'AP-2026-000039',
    version: 2,
    status: 'NEEDS_DISCUSSION',
    drug: 'Omeprazole 40 mg inj',
    code: 'OMP-11802',
    ved: 'E',
    qty: 80,
    unit: 'VIAL',
    unitValue: 35,
    totalValue: 2800,
    distanceKm: 41,
    coldChain: false,
    transportCost: 628,
    costRatioPct: 22.4,
    economical: false,
    from: 'รพ.พระประแดง',
    to: 'รพ.บางบ่อ',
    lotNo: 'OMP-11802-5',
    expiry: '2 ม.ค. 2027',
    daysLeft: 80,
    agent: {
      run: 'F2_T2',
      confidence: 'ต่ำ',
      note: 'รพ.บางบ่อไม่อนุมัติรอบก่อน (สต็อกเพิ่มขึ้นจาก PO ที่เพิ่งมาถึง) · แผนปรับลดเหลือ 80 VIAL รอเห็นชอบใหม่ (ASM-16)',
    },
    approvals: [
      { hospital: 'รพ.พระประแดง', pharmacist: 'ภก.วิทยา แสงทอง', state: 'APPROVED', at: '11 ต.ค. · 15:44 น.' },
      { hospital: 'รพ.บางบ่อ', pharmacist: 'ภญ.กมลชนก พรหมมา', state: 'REJECTED', at: '12 ต.ค. · 08:02 น.' },
    ],
    dueAt: 'รอหารือ · เตือน REGION_ADMIN',
  },
  {
    id: 'AP-2026-000031',
    version: 1,
    status: 'APPROVED',
    drug: 'Ceftriaxone 2 g inj',
    code: 'CFT-24091',
    ved: 'E',
    qty: 60,
    unit: 'VIAL',
    unitValue: 60,
    totalValue: 3600,
    distanceKm: 25,
    coldChain: false,
    transportCost: 500,
    costRatioPct: 13.9,
    economical: true,
    from: 'รพ.สมุทรปราการ',
    to: 'รพ.พระประแดง',
    lotNo: 'CFT-24091-3',
    expiry: '20 ธ.ค. 2026',
    daysLeft: 67,
    agent: {
      run: 'F2_T1',
      confidence: 'สูง',
      note: 'ค่าขนส่ง 500 บาท = 13.9% ต่ำกว่าเกณฑ์ 20% (F-23) · รพ.พระประแดงใช้ 6 VIAL/วัน อายุที่เหลือ 67 วัน มากกว่าเวลาเดินทาง + การใช้ (F-22)',
    },
    approvals: [
      { hospital: 'รพ.สมุทรปราการ', pharmacist: 'ภก.ณัฐวุฒิ ศรีสุข', state: 'APPROVED', at: '12 ต.ค. · 13:10 น.' },
      { hospital: 'รพ.พระประแดง', pharmacist: 'ภก.วิทยา แสงทอง', state: 'APPROVED', at: '12 ต.ค. · 16:35 น.' },
    ],
    dueAt: 'เอกสารออกแล้ว · รอขนส่ง (UI-14)',
  },
];
