/**
 * Incident Console mock data (UI-11 – UI-13)
 * Ground truth from Mockup screenshots: INC-2026-000015 รถโดยสารคว่ำ ถ.เทพารักษ์ กม.12
 */

export interface IncidentSummary {
  id: string;
  title: string;
  location: string;
  status: 'active' | 'closed' | 'cancelled';
  statusLabel: string;
  statusCls: string;
  activePlan: string;
  quote: string;
  reporter: string;
  reportTime: string;
  etaMinutes: number; // e.g. 11:30
  etaTimeStr: string; // 19:43 น.
  etaDesc: string;
  triage: {
    red: number;
    yellow: number;
    green: number;
    black: number;
    lastUpdate: string;
  };
  versionHistory: {
    version: string;
    time: string;
    summary: string;
    approver: string;
  };
}

export const INCIDENT_HEADER: IncidentSummary = {
  id: 'INC-2026-000015',
  title: 'รถโดยสารคว่ำ',
  location: 'ถ.เทพารักษ์ กม.12',
  status: 'active',
  statusLabel: 'กำลังดำเนินการ',
  statusCls: 'st-pending',
  activePlan: 'ACTIVE · แผน v 2',
  quote: 'รถบัสทัศนศึกษาพลิกคว่ำข้างทาง ผู้โดยสารติดในรถหลายราย มีเลือดออกมากและหายใจลำบาก',
  reporter: 'พว.กมลชนก ใจดี (ER_STAFF)',
  reportTime: '19:18 น.',
  etaMinutes: 690, // 11m 30s
  etaTimeStr: '19:43 น.',
  etaDesc: 'รายงาน 25 นาที (ไม่แน่ใจ) · เดินทางจริง 26 นาที — ได้ 25 F-26',
  triage: {
    red: 7,
    yellow: 10,
    green: 20,
    black: 1,
    lastUpdate: 'แก้ล่าสุด 19:27 น. (แดง 5 → 7)',
  },
  versionHistory: {
    version: 'v2',
    time: '19:27',
    summary: 'เปลี่ยนจาก v1: แดง 5 → 7 · ดำ 0 → 1 · Intubation Set 3 → 4 · Trauma Set 35 → 37 · IV Set 15 → 17 · Tranexamic acid 20 → 28 · dT 35 → 37',
    approver: 'อนุมัติโดย พว.กมลชนก 19:28 น.',
  },
};

export const INCIDENT_LIST = [
  { id: 'INC-2026-000015', label: 'รถโดยสารคว่ำ · 19:18', status: 'กำลังดำเนินการ', statusCls: 'st-pending', active: true },
  { id: 'INC-2026-000014', label: 'ไฟไหม้โรงงาน · 12 ต.ค.', status: 'สรุปแล้ว', statusCls: 'st-approved', active: false },
  { id: 'INC-2026-000012', label: 'ยกเลิก · แจ้งหยอก 4 ต.ค.', status: 'ยกเลิก', statusCls: 'st-rejected', active: false },
];

// ─── TAB 1: แผนเวชภัณฑ์ UI-12 ──────────────────────────────────────────
export interface PresetKitRow {
  name: string;
  type: string;
  typeCls: string;
  ratio: string;
  estimated: number;
  critical: number;
  reserve: number;
  readyInStock: number;
  assembleFromParts: number;
  maxAssemble: number;
  borrowFullKit: number;
  warningNote?: string;
}

export const PRESET_KITS: PresetKitRow[] = [
  {
    name: 'Intubation Set',
    type: 'วิกฤต',
    typeCls: 'ug-critical',
    ratio: '0.5 ชุด/ผู้ป่วยแดง',
    estimated: 4,
    critical: 4,
    reserve: 0,
    readyInStock: 0,
    assembleFromParts: 3,
    maxAssemble: 3,
    borrowFullKit: 1,
    warningNote: 'Stylet แยกมี 3 ชิ้น จัดได้ 3 ชุด · ขาดเพียงชิ้นเดียวก็เป็นทั้งชุด ไม่ยืมแยกชิ้น (BR-F3-013)',
  },
  {
    name: 'Trauma Set',
    type: 'สนับสนุน',
    typeCls: 'ug-normal',
    ratio: '1 ชุด/ผู้ป่วย แดง เหลือง เขียว',
    estimated: 37,
    critical: 7,
    reserve: 30,
    readyInStock: 30,
    assembleFromParts: 5,
    maxAssemble: 5,
    borrowFullKit: 2,
    warningNote: 'SAM splint แยกมี 5 ชิ้น จัดได้ 5 ชุด · ขาดเพียงชิ้นเดียวก็เป็นทั้งชุด ไม่ยืมแยกชิ้น (BR-F3-013)',
  },
  {
    name: 'IV Set',
    type: 'สนับสนุน',
    typeCls: 'ug-normal',
    ratio: '1 ชุด/ผู้ป่วยแดงและเหลือง',
    estimated: 17,
    critical: 7,
    reserve: 10,
    readyInStock: 12,
    assembleFromParts: 5,
    maxAssemble: 5,
    borrowFullKit: 0,
  },
];

export interface ExtraDrugRow {
  name: string;
  type: string;
  typeCls: string;
  rule: string;
  estimated: string;
  critical: string;
  stock: string;
  borrowQty: string;
  borrowHighlight: boolean;
}

export const EXTRA_DRUGS: ExtraDrugRow[] = [
  {
    name: 'Tranexamic acid 250 mg/5 mL',
    type: 'วิกฤต',
    typeCls: 'ug-critical',
    rule: '4 amp ต่อผู้ป่วยแดง',
    estimated: '28 AMP',
    critical: '28',
    stock: '20',
    borrowQty: '8',
    borrowHighlight: true,
  },
  {
    name: 'NSS 0.9% 1,000 mL',
    type: 'สนับสนุน',
    typeCls: 'ug-normal',
    rule: '2 ถุง/แดง · 1 ถุง/เหลือง',
    estimated: '24 ถุง',
    critical: '14',
    stock: '60',
    borrowQty: '0',
    borrowHighlight: false,
  },
  {
    name: 'dT vaccine 0.5 mL',
    type: 'สนับสนุน',
    typeCls: 'ug-normal',
    rule: '1 vial ต่อผู้ป่วยที่มีแผล (ทุกระดับ)',
    estimated: '37 VIAL',
    critical: '7',
    stock: '25',
    borrowQty: '12',
    borrowHighlight: true,
  },
  {
    name: 'PRC group O',
    type: 'โลหิต · เฉพาะโรงพยาบาล',
    typeCls: 'ug-critical',
    rule: 'เฉพาะ รพ.ที่มีธนาคารเลือดที่จองคลัง · สูงสุด 6 ยูนิต · ต้องให้ธนาคารเลือดประสาน ABO/Rh และ cross-match',
    estimated: '4 UNIT',
    critical: '-',
    stock: '12',
    borrowQty: '4',
    borrowHighlight: true,
  },
];

// ─── TAB 2: ยืมฉุกเฉิน UI-11 ──────────────────────────────────────────
export interface EmergencyBorrowHospital {
  hospital: string;
  eta: string;
  status: 'rejected' | 'timeout' | 'pending' | 'partial' | 'loaded' | 'in_transit' | 'cancelled' | 'not_sent';
  statusLabel: string;
  statusCls: string;
  detail: string;
  countdownSecs?: number;
}

export interface EmergencyBorrowItem {
  name: string;
  qty: string;
  tag: string;
  tagCls: string;
  extraBadge?: string;
  extraBadgeCls?: string;
  subHeader: string;
  hospitals: EmergencyBorrowHospital[];
}

export const EMERGENCY_BORROWS: EmergencyBorrowItem[] = [
  {
    name: 'Tranexamic acid 250 mg/5 mL',
    qty: '8 AMP',
    tag: 'วิกฤต',
    tagCls: 'ug-critical',
    extraBadge: 'ขยายไป รพ.ใกล้เคียง',
    extraBadgeCls: 'badge-blue',
    subHeader: 'วิกฤต · หมดเวลา 3 นาที · ส่ง 19:28',
    hospitals: [
      {
        hospital: 'รพ.พระสมุทรเจดีย์ฯ',
        eta: '11 นาที',
        status: 'rejected',
        statusLabel: 'ปฏิเสธ',
        statusCls: 'st-rejected',
        detail: 'ปฏิเสธ 19:29 · ไม่มีของพอ',
      },
      {
        hospital: 'รพ.บางพลี',
        eta: '14 นาที',
        status: 'timeout',
        statusLabel: 'หมดเวลา',
        statusCls: 'st-timeout',
        detail: 'ไม่ตอบภายใน 3 นาที (19:31)',
      },
      {
        hospital: 'รพ.บางเสาธง',
        eta: '19 นาที',
        status: 'pending',
        statusLabel: 'รอดำเนินการ',
        statusCls: 'st-pending',
        detail: 'ไม่มี รพ.ไหนมาทัน ETA → ส่งถึงแห่งที่เร็วที่สุด · ของจะถึงหลังผู้ป่วยราว 7 นาที (LATE_FOR_ETA) · แจ้งเจ้าหน้าที่แล้ว',
        countdownSecs: 95, // 01:35
      },
    ],
  },
  {
    name: 'Trauma Set',
    qty: '2 ชุด',
    tag: 'สนับสนุน',
    tagCls: 'ug-normal',
    extraBadge: 'ได้บางส่วน 1/2',
    extraBadgeCls: 'st-transit',
    subHeader: 'สนับสนุน · หมดเวลา 5 นาที · ส่ง 19:28',
    hospitals: [
      {
        hospital: 'รพ.พระสมุทรเจดีย์ฯ',
        eta: '11 นาที',
        status: 'partial',
        statusLabel: 'ได้บางส่วน',
        statusCls: 'st-approved',
        detail: 'ยืนยัน 1 ชุด 19:30 (รายแรก)',
      },
      {
        hospital: 'รพ.บางพลี',
        eta: '14 นาที',
        status: 'pending',
        statusLabel: 'รอดำเนินการ',
        statusCls: 'st-pending',
        detail: 'ปรับคำขอเหลือ 1 ชุดที่ขาด · ครบกำหนด 19:33',
        countdownSecs: 35, // 00:35
      },
      {
        hospital: 'รพ.บางเสาธง',
        eta: '19 นาที',
        status: 'not_sent',
        statusLabel: 'ไม่ส่ง',
        statusCls: 't-grey',
        detail: 'ไม่ส่ง · เดินทาง 19 นาที > ETA ที่เหลือ 15 นาที',
      },
    ],
  },
  {
    name: 'Intubation Set',
    qty: '1 ชุด',
    tag: 'วิกฤต',
    tagCls: 'ug-critical',
    extraBadge: 'ขึ้นรถแล้ว',
    extraBadgeCls: 'st-transit',
    subHeader: 'วิกฤต · หมดเวลา 3 นาที · ส่ง 19:28',
    hospitals: [
      {
        hospital: 'รพ.บางพลี',
        eta: '14 นาที',
        status: 'loaded',
        statusLabel: 'ขึ้นรถแล้ว',
        statusCls: 'st-transit',
        detail: 'ยืนยัน 19:29 (รายแรก) · ขึ้นรถ 19:30 · ถึงประมาณ 19:44',
      },
      {
        hospital: 'รพ.พระสมุทรเจดีย์ฯ',
        eta: '11 นาที',
        status: 'cancelled',
        statusLabel: 'ยกเลิก',
        statusCls: 't-grey',
        detail: 'ยกเลิกอัตโนมัติ · มีผู้ยืนยันก่อน · แจ้งแล้ว',
      },
    ],
  },
  {
    name: 'dT vaccine 0.5 mL',
    qty: '12 VIAL',
    tag: 'สนับสนุน',
    tagCls: 'ug-normal',
    extraBadge: 'กำลังขนส่ง',
    extraBadgeCls: 'st-transit',
    subHeader: 'v1 ขอ 10 (19:21) · v2 ขอเพิ่ม 2 (19:28)',
    hospitals: [
      {
        hospital: 'รพ.พระสมุทรเจดีย์ฯ',
        eta: '11 นาที',
        status: 'in_transit',
        statusLabel: 'กำลังขนส่ง',
        statusCls: 'st-transit',
        detail: 'ยืนยัน 10 (19:23) + 2 (19:29) · ออกเดินทาง 19:26',
      },
      {
        hospital: 'รพ.บางพลี',
        eta: '14 นาที',
        status: 'cancelled',
        statusLabel: 'ยกเลิก',
        statusCls: 't-grey',
        detail: 'ยกเลิกอัตโนมัติ (v1)',
      },
      {
        hospital: 'รพ.บางเสาธง',
        eta: '19 นาที',
        status: 'cancelled',
        statusLabel: 'ยกเลิก',
        statusCls: 't-grey',
        detail: 'ยกเลิกอัตโนมัติ (v1)',
      },
    ],
  },
  {
    name: 'PRC group O',
    qty: '4 UNIT',
    tag: 'วิกฤต',
    tagCls: 'ug-critical',
    extraBadge: 'กำลังขนส่ง',
    extraBadgeCls: 'st-transit',
    subHeader: 'เฉพาะ รพ.ที่มีธนาคารเลือด · ส่ง 19:22',
    hospitals: [
      {
        hospital: 'รพ.บางพลี',
        eta: '14 นาที',
        status: 'in_transit',
        statusLabel: 'กำลังขนส่ง',
        statusCls: 'st-transit',
        detail: 'ธนาคารเลือดยืนยัน 19:24 · ต้องตรวจ ABO/Rh และ cross-match ก่อนให้ · คืนแบบ BLOOD_REPLACEMENT',
      },
      {
        hospital: 'รพ.พระสมุทรเจดีย์ฯ',
        eta: '11 นาที',
        status: 'not_sent',
        statusLabel: 'ไม่ส่ง',
        statusCls: 't-grey',
        detail: 'ไม่ส่ง · ไม่มีธนาคารเลือด',
      },
    ],
  },
];

// ─── TAB 3: จัดชุด UI-13 ──────────────────────────────────────────────
export interface KitAssemblyItem {
  id: string;
  name: string;
  qty: number;
  status: 'done' | 'assembling' | 'waiting';
  statusLabel: string;
  statusCls: string;
  meta: string;
  parts: {
    name: string;
    perKit: number;
    needed: number;
    stock: number;
    checked: boolean;
  }[];
  footerText?: string;
  canConfirm?: boolean;
}

export const KIT_ASSEMBLIES: KitAssemblyItem[] = [
  {
    id: 'trauma-5',
    name: 'Trauma Set',
    qty: 5,
    status: 'done',
    statusLabel: 'จัดเสร็จ · ยืนยันแล้ว',
    statusCls: 'st-approved',
    meta: 'v1 · คุณประเสริฐ · ยืนยัน 19:26',
    parts: [
      { name: 'ผ้าก๊อซ 4×4 นิ้ว', perKit: 10, needed: 50, stock: 550, checked: true },
      { name: 'Elastic bandage 4 นิ้ว', perKit: 2, needed: 10, stock: 150, checked: true },
      { name: 'SAM splint', perKit: 1, needed: 5, stock: 0, checked: true },
      { name: 'Povidone-iodine 15 mL', perKit: 1, needed: 5, stock: 85, checked: true },
    ],
    footerText: 'ตัดของแยกตามสูตรแล้ว · ชุดพร้อมใช้ +5',
  },
  {
    id: 'intub-3',
    name: 'Intubation Set',
    qty: 3,
    status: 'assembling',
    statusLabel: 'กำลังจัด',
    statusCls: 'st-transit',
    meta: 'วิกฤต · เริ่ม 19:29 · คุณประเสริฐ',
    parts: [
      { name: 'ET tube 7.5', perKit: 1, needed: 3, stock: 3, checked: true },
      { name: 'Stylet', perKit: 1, needed: 3, stock: 0, checked: false },
      { name: 'Laryngoscope blade', perKit: 1, needed: 3, stock: 5, checked: false },
      { name: 'Syringe 10 mL', perKit: 1, needed: 3, stock: 197, checked: false },
    ],
    canConfirm: true,
  },
  {
    id: 'iv-5',
    name: 'IV Set',
    qty: 5,
    status: 'waiting',
    statusLabel: 'รอจัด',
    statusCls: 'st-pending',
    meta: 'รอเริ่ม',
    parts: [
      { name: 'IV catheter 18G', perKit: 1, needed: 5, stock: 35, checked: false },
      { name: 'สายให้น้ำเกลือ', perKit: 1, needed: 5, stock: 4, checked: false },
      { name: 'Transparent dressing', perKit: 1, needed: 5, stock: 45, checked: false },
      { name: 'Tourniquet', perKit: 1, needed: 5, stock: 25, checked: false },
    ],
  },
];

export const KIT_STOCK_OVERVIEW = [
  { name: 'Trauma Set', before: 30, now: '35' },
  { name: 'Intubation Set', before: 0, now: '0 (กำลังจัด 3)' },
  { name: 'IV Set', before: 12, now: '12 (รอจัด 5)' },
];

// ─── TAB 4: สรุปหลังเหตุการณ์ ──────────────────────────────────────────
export interface IncidentReturnRow {
  lender: string;
  item: string;
  category: string;
  received: string;
  actualUsed: string;
  returnPolicy: string;
}

export const INCIDENT_RETURNS: IncidentReturnRow[] = [
  {
    lender: 'รพ.บางพลี',
    item: 'Intubation Set',
    category: 'ชุดทั้งชุด',
    received: '1 ชุด',
    actualUsed: '1',
    returnPolicy: 'คืนเป็นชุดเดียวกันภายใน 30 วัน',
  },
  {
    lender: 'รพ.บางพลี',
    item: 'Trauma Set',
    category: 'ชุดทั้งชุด',
    received: 'รอยืนยัน 1',
    actualUsed: '',
    returnPolicy: '—',
  },
  {
    lender: 'รพ.บางพลี',
    item: 'PRC group O',
    category: 'โลหิต',
    received: '4 UNIT',
    actualUsed: '3',
    returnPolicy: 'BLOOD_REPLACEMENT ผ่านธนาคารเลือด',
  },
  {
    lender: 'รพ.พระสมุทรเจดีย์ฯ',
    item: 'Trauma Set',
    category: 'ชุดทั้งชุด',
    received: '1 ชุด',
    actualUsed: '1',
    returnPolicy: 'คืนเป็นชุดเดียวกันภายใน 30 วัน',
  },
  {
    lender: 'รพ.พระสมุทรเจดีย์ฯ',
    item: 'dT vaccine 0.5 mL',
    category: 'ยา',
    received: '12 VIAL',
    actualUsed: '9',
    returnPolicy: 'ที่ใช้คืนของเดิม 9 · ที่ไม่ได้ใช้ 3 ส่งคืนทันที',
  },
  {
    lender: 'รพ.บางเสาธง',
    item: 'Tranexamic acid 250 mg',
    category: 'ยา',
    received: 'รอยืนยัน 8',
    actualUsed: '',
    returnPolicy: '—',
  },
];
