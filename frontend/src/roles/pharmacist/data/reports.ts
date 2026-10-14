/**
 * Reports & Value mock data (UI-19, RPT-01 – RPT-08)
 * Ground truth from Mockup screenshots: Reports · Value · UI-19
 */

// ─── TAB 1: มูลค่า RPT-08 ──────────────────────────────────────────────
export interface ValueSavedSummary {
  totalSaved: number;
  preventedExpiry: number;
  reducedExcess: number;
  transportCost: number;
  holdingCostRate: string;
  baselineExpiryLoss: number;
  baselineExcess: number;
  currentExcess: number;
}

export const VALUE_SAVED: ValueSavedSummary = {
  totalSaved: 8800,
  preventedExpiry: 4500,
  reducedExcess: 5000,
  transportCost: 700,
  holdingCostRate: '10%/ปี',
  baselineExpiryLoss: 38200,
  baselineExcess: 200000,
  currentExcess: 150000,
};

export interface MonthlySavedBar {
  month: string;
  amount: number;
  isPartial?: boolean;
}

export const MONTHLY_SAVINGS: MonthlySavedBar[] = [
  { month: 'พ.ย. 68', amount: 350 },
  { month: 'ธ.ค. 68', amount: 400 },
  { month: 'ม.ค. 69', amount: 450 },
  { month: 'ก.พ. 69', amount: 550 },
  { month: 'มี.ค. 69', amount: 750 },
  { month: 'เม.ย. 69', amount: 800 },
  { month: 'พ.ค. 69', amount: 780 },
  { month: 'มิ.ย. 69', amount: 850 },
  { month: 'ก.ค. 69', amount: 900 },
  { month: 'ส.ค. 69', amount: 880 },
  { month: 'ก.ย. 69', amount: 980 },
  { month: 'ต.ค. 69', amount: 650, isPartial: true },
];

export interface ValueKpi {
  title: string;
  value: string;
  diff: string;
  diffPositive: boolean; // positive means green/good improvement
  baseline: string;
  desc: string;
}

export const VALUE_KPIS: ValueKpi[] = [
  {
    title: 'สต็อกขาด (ยา V/E)',
    value: '0.9%',
    diff: '-62%',
    diffPositive: true,
    baseline: 'ฐาน 2.4%',
    desc: 'วัน-รายการของยา V/E ที่สต็อกใช้ได้เป็น 0 ÷ วัน-รายการทั้งหมด',
  },
  {
    title: 'สต็อกเกิน',
    value: '7.6%',
    diff: '-36%',
    diffPositive: true,
    baseline: 'ฐาน 11.8%',
    desc: 'วัน-รายการที่สต็อก > 2 × Total Target ÷ วัน-รายการทั้งหมด',
  },
  {
    title: 'มูลค่ายาหมดอายุทิ้ง',
    value: '฿21,600',
    diff: '-43%',
    diffPositive: true,
    baseline: 'ฐาน ฿38,200',
    desc: 'ต้นทุนยอดล็อตที่ตัดจำหน่ายเพราะหมดอายุ (EXPIRED_WRITEOFF) ใน 12 เดือน',
  },
  {
    title: 'เวลาจากขาดถึงได้ยา',
    value: '7.5 ชม.',
    diff: '-71%',
    diffPositive: true,
    baseline: 'ฐาน 26 ชม.',
    desc: 'มัธยฐาน จากแจ้งเตือนสต็อกต่ำถึงรับยาที่ยืม (RECEIVED)',
  },
];

// ─── TAB 2: ความแม่นยำพยากรณ์ RPT-01 ──────────────────────────────────
export interface ForecastMethodRange {
  method: string;
  actual: number | null;
  target: number;
  acceptableMin: number;
  acceptableMax: number;
  label: string;
}

export const FORECAST_RANGES: ForecastMethodRange[] = [
  { method: 'MA_ES P90', actual: 0.9104, target: 0.90, acceptableMin: 0.85, acceptableMax: 0.95, label: '0.9104' },
  { method: 'MA_ES P95', actual: 0.9615, target: 0.95, acceptableMin: 0.90, acceptableMax: 1.00, label: '0.9615' },
  { method: 'QUANTILE_LGBM P90', actual: 0.8846, target: 0.90, acceptableMin: 0.85, acceptableMax: 0.95, label: '0.8846' },
  { method: 'QUANTILE_LGBM P95', actual: 0.9423, target: 0.95, acceptableMin: 0.90, acceptableMax: 1.00, label: '0.9423' },
  { method: 'COLD_START P95', actual: null, target: 0.95, acceptableMin: 0.90, acceptableMax: 1.00, label: 'LOW_N' },
];

export interface ForecastSummaryRow {
  method: string;
  itemsCount: number;
  weeksN: string;
  coverageP90: string;
  coverageP95: string;
  pinballP50: string;
  wape: string;
  stockoutRate: string;
  note: string;
  isLowN?: boolean;
}

export const FORECAST_SUMMARY: ForecastSummaryRow[] = [
  {
    method: 'MA_ES',
    itemsCount: 8,
    weeksN: '52',
    coverageP90: '0.9104',
    coverageP95: '0.9615',
    pinballP50: '3.21',
    wape: '14.8%',
    stockoutRate: '3.8%',
    note: 'ผ่านเป้าทั้งสองระดับ',
  },
  {
    method: 'QUANTILE_LGBM',
    itemsCount: 2,
    weeksN: '52',
    coverageP90: '0.8846',
    coverageP95: '0.9423',
    pinballP50: '0.84',
    wape: '41.2%',
    stockoutRate: '5.8%',
    note: 'ใช้โมเดลรวม · อยู่ในช่วงยอมรับ ±0.05',
  },
  {
    method: 'COLD_START',
    itemsCount: 1,
    weeksN: '6',
    coverageP90: '—',
    coverageP95: '—',
    pinballP50: '—',
    wape: '—',
    stockoutRate: '—',
    note: 'N < 26 สัปดาห์ ยังประเมินไม่ได้',
    isLowN: true,
  },
  {
    method: 'MIN_MAX',
    itemsCount: 2,
    weeksN: '—',
    coverageP90: '—',
    coverageP95: '—',
    pinballP50: '—',
    wape: '—',
    stockoutRate: '0.0%',
    note: 'ยา D ราคาถูก ไม่พยากรณ์',
  },
];

export interface WatchlistDrug {
  ved: 'V' | 'E' | 'D';
  name: string;
  method: string;
  target: string;
  actualOverQuantile: string;
  coverage: string;
  status: 'pass' | 'warning' | 'low_n';
  statusLabel: string;
}

export const WATCHLIST_DRUGS: WatchlistDrug[] = [
  {
    ved: 'V',
    name: 'ADRENaLine 1 mg/mL',
    method: 'MA_ES',
    target: 'P95',
    actualOverQuantile: '50 / 52',
    coverage: '0.9615',
    status: 'pass',
    statusLabel: 'ผ่าน',
  },
  {
    ved: 'V',
    name: 'ALprostadil 500 mcg/mL',
    method: 'QUANTILE_LGBM',
    target: 'P95',
    actualOverQuantile: '48 / 52',
    coverage: '0.9231',
    status: 'warning',
    statusLabel: 'ต่ำกว่าเป้า · ยังอยู่ในช่วงยอมรับ',
  },
  {
    ved: 'E',
    name: '5-FU 120 SYRINGE',
    method: 'MA_ES',
    target: 'P90',
    actualOverQuantile: '47 / 52',
    coverage: '0.9038',
    status: 'pass',
    statusLabel: 'ผ่าน',
  },
  {
    ved: 'E',
    name: 'CefTRIAXone 1 g',
    method: 'MA_ES',
    target: 'P90',
    actualOverQuantile: '45 / 52',
    coverage: '0.8654',
    status: 'warning',
    statusLabel: 'ต่ำกว่าเป้า · ยังอยู่ในช่วงยอมรับ',
  },
  {
    ved: 'V',
    name: 'Tenecteplase 50 mg',
    method: 'COLD_START',
    target: 'P95',
    actualOverQuantile: '6 / 6',
    coverage: '—',
    status: 'low_n',
    statusLabel: 'LOW_N',
  },
];

// ─── TAB 3: การยืม RPT-02 · 03 · 04 ───────────────────────────────────
export interface BorrowKpi {
  title: string;
  code: string;
  value: string;
  desc: string;
}

export const BORROW_KPIS: BorrowKpi[] = [
  {
    title: 'คำขอยืมทั้งเขต',
    code: 'RPT-03',
    value: '112',
    desc: 'ได้ครบ 91 จาก 104 คำขอที่ปิดแล้ว (88%)',
  },
  {
    title: 'รอบต่อคำขอ',
    code: 'RPT-03',
    value: '1.5',
    desc: 'รอบที่หมดเวลา 19 จาก 168 รอบ (11.3%)',
  },
  {
    title: 'แจ้งเตือน → อนุมัติคำขอ',
    code: 'RPT-02',
    value: '26 นาที',
    desc: 'มัธยฐานทั้งเขต · p90 2 ชม. 05 นาที',
  },
  {
    title: 'ส่งต่อผู้ดูแล (ลำดับหมด)',
    code: 'RPT-03',
    value: '9',
    desc: 'ปิดโดยไม่ได้ยา 4',
  },
];

export interface FirstResponseTime {
  level: string;
  tagCls: string;
  actual: string;
  allowed: string;
  pct: number;
}

export const FIRST_RESPONSE_TIMES: FirstResponseTime[] = [
  { level: 'เร่งด่วนมาก', tagCls: 'ug-critical', actual: '19 นาที', allowed: '120 นาที', pct: 16 },
  { level: 'เร่งด่วน', tagCls: 'ug-urgent', actual: '1 ชม. 12 นาที', allowed: '6 ชม.', pct: 20 },
  { level: 'ปกติ', tagCls: 'ug-normal', actual: '9 ชม.', allowed: '48 ชม.', pct: 19 },
];

export interface LenderReliability {
  hospital: string;
  acceptedRate: string;
  timeoutRate: string;
  score: string;
  scoreNum: number;
  isSelf?: boolean;
}

export const LENDER_RELIABILITIES: LenderReliability[] = [
  { hospital: 'รพ.สมุทรปราการ (เรา)', acceptedRate: '0.87', timeoutRate: '0.09', score: '0.79', scoreNum: 0.79, isSelf: true },
  { hospital: 'รพ.บางพลี', acceptedRate: '0.90', timeoutRate: '0.10', score: '0.81', scoreNum: 0.81 },
  { hospital: 'รพ.พระสมุทรเจดีย์ฯ', acceptedRate: 'ไม่มีประวัติ', timeoutRate: '—', score: '0.50*', scoreNum: 0.50 },
  { hospital: 'รพ.บางบ่อ', acceptedRate: '0.80', timeoutRate: '0.05', score: '0.76', scoreNum: 0.76 },
  { hospital: 'รพ.บางเสาธง', acceptedRate: '0.70', timeoutRate: '0.20', score: '0.56', scoreNum: 0.56 },
];

// ─── TAB 4: ยาใกล้หมดอายุ RPT-05 · 06 ─────────────────────────────────
export interface ExpiryKpi {
  title: string;
  value: string;
  desc: string;
}

export const EXPIRY_KPIS: ExpiryKpi[] = [
  {
    title: 'ปล่อยเข้าคลังกลาง',
    value: '฿13,500',
    desc: '3 ล็อต ใน 12 เดือน',
  },
  {
    title: 'ส่งต่อและถูกใช้ก่อนหมดอายุ',
    value: '฿4,500',
    desc: 'นับเป็นหมดอายุที่เลี่ยงได้ใน F-31',
  },
  {
    title: 'หมดอายุทิ้ง',
    value: '฿21,600',
    desc: 'ช่วงฐาน ฿38,200 (-43%)',
  },
  {
    title: 'ค่าขนส่งเฉลี่ยต่อมูลค่า',
    value: '15.6%',
    desc: 'ไม่คุ้ม 1 แผน (ห่วงโซ่ความเย็น)',
  },
];

export interface ReleasedExpiryPlan {
  planId: string;
  drug: string;
  value: string;
  shippingCost: string;
  shippingRatio: number;
  shippingRatioStr: string;
  isUnfavorable?: boolean;
  statusLabel: string;
  statusCls: string;
}

export const RELEASED_EXPIRY_PLANS: ReleasedExpiryPlan[] = [
  {
    planId: 'AP-2026-000031',
    drug: 'CefTAZidime 2 g inj · 90 vial',
    value: '฿4,500',
    shippingCost: '฿700',
    shippingRatio: 15.6,
    shippingRatioStr: '15.6%',
    statusLabel: 'ส่งแล้ว · ใช้ก่อนหมดอายุ',
    statusCls: 'st-approved',
  },
  {
    planId: 'AP-2026-000036',
    drug: 'Insulin glargine pen · 30 ด้าม (ห่วงโซ่ความเย็น)',
    value: '฿4,500',
    shippingCost: '฿1,200',
    shippingRatio: 26.7,
    shippingRatioStr: '26.7%',
    isUnfavorable: true,
    statusLabel: 'ไม่คุ้ม — เก็บไว้ (HOLD)',
    statusCls: 'st-pending',
  },
  {
    planId: 'AP-2026-000039',
    drug: 'Omeprazole 40 mg inj · 180 vial',
    value: '฿4,500',
    shippingCost: '฿700',
    shippingRatio: 15.6,
    shippingRatioStr: '15.6%',
    statusLabel: 'ยกเลิกโดยความยินยอม',
    statusCls: 't-grey',
  },
  {
    planId: 'AP-2026-000045',
    drug: 'Omeprazole 40 mg inj · 180 vial',
    value: '฿4,500',
    shippingCost: '฿700',
    shippingRatio: 15.6,
    shippingRatioStr: '15.6%',
    statusLabel: 'กำลังขนส่ง',
    statusCls: 'st-transit',
  },
];

export interface RepeatExpiredDrug {
  name: string;
  lotsLost: string;
  costLost: string;
  badgeLevel: 'RECOMMEND' | 'WATCH';
  orderSuggestion: string;
  yearlySavings: string;
}

export const REPEAT_EXPIRED_DRUGS: RepeatExpiredDrug[] = [
  {
    name: 'Paracetamol syrup 60 mL',
    lotsLost: '3 (เหลือ 400 · 300 · 500)',
    costLost: '฿14,400',
    badgeLevel: 'RECOMMEND',
    orderSuggestion: 'สั่ง 2,000 → 1,600 ขวดต่อรอบ 120 วัน (ใช้ 13 ขวด/วัน · ฿12/ขวด)',
    yearlySavings: '฿14,400',
  },
  {
    name: 'Phytomenadione (Vit K1) 10 mg',
    lotsLost: '2',
    costLost: '฿492',
    badgeLevel: 'WATCH',
    orderSuggestion: 'เฝ้าดูต่อ · ยังไม่เสนอเปลี่ยนยอดสั่ง',
    yearlySavings: '—',
  },
];
