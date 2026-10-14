/** UI-07 Near-expiry review — mock data (spec F2a: JOB-05 detect → pharmacist review →
 *  release to pool / keep). FEFO helper mirrors the drawer formula:
 *  usable = floor((daysLeft − 1) × usagePerDay); releasable = qty − usable (F-22).
 */

export type NearExpiryStatus = 'PENDING' | 'RELEASED' | 'ALLOCATED' | 'KEPT' | 'EXPIRED';
export type RepeatFlag = 'WATCH' | 'RECOMMEND';

export interface ExpiryHistoryEntry {
  lot: string;
  text: string;
}

export interface NearExpiryItem {
  id: string;
  ved: 'V' | 'E' | 'D';
  drug: string;
  lot: string;
  /** hospital-local code shown as รหัส … */
  code: string;
  qty: number;
  unit: string;
  unitPrice: number;
  expiry: string;
  daysLeft: number;
  /** per-drug near-expiry threshold (ASM-14) */
  thresholdDays: number;
  usagePerDay: number;
  status: NearExpiryStatus;
  /** F2b repeat-expiry flag */
  repeatFlag?: RepeatFlag;
  /** days since JOB-05 detected this lot — drives the "ใหม่กว่า 7 วัน" tab */
  detectedAgoDays: number;
  releasedQty?: number;
  planId?: string;
  keptReason?: string;
  history: ExpiryHistoryEntry[];
}

/** FEFO quantity usable before expiry (spec formula shown in the UI-07 drawer). */
export function fefoUsable(i: NearExpiryItem): number {
  return Math.floor((i.daysLeft - 1) * i.usagePerDay);
}

/** Quantity that can be released to the pool without going unused (F-22). */
export function releasable(i: NearExpiryItem): number {
  return Math.max(0, i.qty - fefoUsable(i));
}

export function lotValue(i: NearExpiryItem): number {
  return i.qty * i.unitPrice;
}

export const NEAR_EXPIRY_ITEMS: NearExpiryItem[] = [
  {
    id: 'NE-2026-0041',
    ved: 'E',
    drug: 'Phytomenadione (Vit K1) 10 mg/mL inj',
    lot: 'VK24J02',
    code: 'VK24J02',
    qty: 60,
    unit: 'AMP',
    unitPrice: 12,
    expiry: '15 พ.ย. 2027',
    daysLeft: 125,
    thresholdDays: 180,
    usagePerDay: 0.3,
    status: 'PENDING',
    repeatFlag: 'WATCH',
    detectedAgoDays: 1,
    history: [
      { lot: 'VK23H11', text: 'ล็อตก่อนหน้า 18 AMP · ปล่อยเข้าคลัง ต.ค. 2568 · ใช้หมดก่อนอายุ' },
      { lot: 'VK24J02', text: 'ล็อตนี้เข้าเกณฑ์รอบที่ 2 ใน 12 เดือน → WATCH (F2b)' },
    ],
  },
  {
    id: 'NE-2026-0038',
    ved: 'E',
    drug: 'AMPicillin 1 g inj',
    lot: 'AMP-2405',
    code: 'AMP-2405',
    qty: 30,
    unit: 'VIAL',
    unitPrice: 17,
    expiry: '20 ธ.ค. 2027',
    daysLeft: 99,
    thresholdDays: 180,
    usagePerDay: 0.28,
    status: 'PENDING',
    detectedAgoDays: 12,
    history: [{ lot: 'AMP-2311', text: 'ล็อตก่อนหน้า 25 VIAL · ใช้หมดก่อนอายุ 11 วัน' }],
  },
  {
    id: 'NE-2026-0031',
    ved: 'D',
    drug: 'AMLOdipine 5 mg tab',
    lot: 'AML-2409',
    code: 'AML-2409',
    qty: 600,
    unit: 'เม็ด',
    unitPrice: 1,
    expiry: '28 ก.พ. 2028',
    daysLeft: 138,
    thresholdDays: 180,
    usagePerDay: 4.35,
    status: 'PENDING',
    detectedAgoDays: 9,
    history: [],
  },
  {
    id: 'NE-2026-0022',
    ved: 'E',
    drug: 'Omeprazole 40 mg inj',
    lot: 'OMP-660118',
    code: 'OMP-660118',
    qty: 180,
    unit: 'VIAL',
    unitPrice: 75,
    expiry: '10 มี.ค. 2028',
    daysLeft: 148,
    thresholdDays: 180,
    usagePerDay: 0.9,
    status: 'ALLOCATED',
    releasedQty: 100,
    planId: 'AP-2026-000045',
    detectedAgoDays: 16,
    history: [{ lot: 'OMP-659004', text: 'ล็อตก่อนหน้า 120 VIAL · ปล่อยเข้าคลัง ส.ค. 2569' }],
  },
  {
    id: 'NE-2026-0019',
    ved: 'E',
    drug: 'Ceftriaxone 1 g inj',
    lot: 'CFT-2402',
    code: 'CFT-2402',
    qty: 90,
    unit: 'VIAL',
    unitPrice: 25,
    expiry: '5 ธ.ค. 2027',
    daysLeft: 53,
    thresholdDays: 180,
    usagePerDay: 1.1,
    status: 'ALLOCATED',
    releasedQty: 60,
    planId: 'AP-2026-000031',
    detectedAgoDays: 21,
    history: [],
  },
  {
    id: 'NE-2026-0015',
    ved: 'D',
    drug: 'Metformin 500 mg tab',
    lot: 'MET-2412',
    code: 'MET-2412',
    qty: 1200,
    unit: 'เม็ด',
    unitPrice: 0.8,
    expiry: '30 เม.ย. 2028',
    daysLeft: 199,
    thresholdDays: 180,
    usagePerDay: 40,
    status: 'KEPT',
    keptReason: 'ใช้ทันตามพยากรณ์ 40 เม็ด/วัน · เก็บไว้ใช้เอง (A4)',
    detectedAgoDays: 30,
    history: [],
  },
  {
    id: 'NE-2026-0009',
    ved: 'E',
    drug: 'Insulin glargine 100 U/mL pen',
    lot: 'INS-659007',
    code: 'INS-659007',
    qty: 12,
    unit: 'ตลับ',
    unitPrice: 140,
    expiry: '12 ต.ค. 2026',
    daysLeft: -2,
    thresholdDays: 180,
    usagePerDay: 0.2,
    status: 'EXPIRED',
    detectedAgoDays: 40,
    history: [{ lot: 'INS-659007', text: 'หมดอายุจริง · รอตัดบัญชี (write-off) และนับเป็นเหตุการณ์ F2b' }],
  },
];

export interface ExpiryKpi {
  label: string;
  en: string;
  value: string;
  sub: string;
  accent: string;
  accentBg: string;
}

export const EXPIRY_KPIS: ExpiryKpi[] = [
  {
    label: 'ตรวจพบวันนี้',
    en: 'DETECTED',
    value: '3 ล็อต',
    sub: 'รวมมูลค่า ฿1,830 · ต้องตัดสินใจภายใน 24 ชม. 1 ตัว',
    accent: '#D97706',
    accentBg: '#FFF7ED',
  },
  {
    label: 'ปล่อยเข้าคลังกลาง · จัดสรรแล้ว',
    en: 'RELEASED · ALLOCATED',
    value: '2 ล็อต',
    sub: 'รวมมูลค่า ฿9,000 · ไปอยู่ในแผนจัดสรร 2 แผน',
    accent: '#166534',
    accentBg: '#F0FDF4',
  },
  {
    label: 'มูลค่าที่เลี่ยงการหายไป 12 เดือน',
    en: 'VALUE AVOIDED',
    value: '฿21,600',
    sub: 'ลดลง ฿38,200 เทียบช่วงเดียวกันปีก่อนที่ยังไม่มีระบบ',
    accent: '#B91C1C',
    accentBg: '#FEF2F2',
  },
];
