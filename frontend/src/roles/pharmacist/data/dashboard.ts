/**
 * Pharmacist dashboard mock data: alerts, loan requests, nearby hospitals,
 * work history, near-expiry lots and network activity.
 * Shared shell data (user, nav, sessions) lives in src/data/.
 */

export interface AlertTab {
  key: string;
  label: string;
  count: number;
}

export interface Alert {
  type: string;
  sevCls: string;
  sevLabel: string;
  icon: string;
  drug: string;
  ved: 'V' | 'E' | 'D';
  vedLabel: string;
  typeLabel: string;
  msg: string;
  msgCritical: boolean;
  /** Countdown base (secs at tick=0) appended live as "– เหลือ HH:MM:SS". */
  liveSecs?: number;
  time: string;
  action: string;
  primary: boolean;
  /** Linked borrow request shown under the status badge (e.g. `#REQ-1050`). */
  req?: string;
  /** Live rows only: the API alert id and its SM-8 status. */
  alertId?: string;
  status?: 'open' | 'acknowledged' | 'linked' | 'snoozed';
}

export interface ReqRow {
  id: string;
  drug: string;
  qty: string;
  unit: string;
  from: string;
  to: string;
  ug: 'critical' | 'urgent' | 'normal';
  ugLabel: string;
  st: 'pending' | 'approved' | 'transit' | 'delivered' | 'rejected' | 'timeout';
  stTh: string;
  stEn: string;
  /** Seconds remaining on the mockup countdown at tick=0 (pending rows only). */
  secs?: number;
  step?: number;
  note?: string;
  action: string;
  actionPrimary: boolean;
}

export const ALERT_TABS: AlertTab[] = [
  { key: 'all', label: 'ทั้งหมด', count: 8 },
  { key: 'shortage', label: 'ขาดแคลน', count: 3 },
  { key: 'expiry', label: 'ใกล้หมดอายุ', count: 2 },
  { key: 'request', label: 'คำขอ', count: 1 },
  { key: 'emergency', label: 'เหตุฉุกเฉิน', count: 2 },
];

export const ALERTS: Alert[] = [
  {
    type: 'shortage', sevCls: 'sev-crit', sevLabel: 'ระดับวิกฤต', icon: 'tri',
    drug: 'Insulin Glargine pen', ved: 'V', vedLabel: 'Vital', typeLabel: 'ขาดแคลน',
    msg: 'Insulin Glargine: stock เหลือใช้ 1.5 วัน – ต่ำกว่า Predict (ต้องการ 84 ด้าม / 7 วัน)',
    msgCritical: true, time: '10 นาทีที่แล้ว', action: 'สร้างคำขอ', primary: true,
  },
  {
    type: 'shortage', sevCls: 'sev-crit', sevLabel: 'ระดับวิกฤต', icon: 'tri',
    drug: 'Adrenaline 1 mg/mL amp', ved: 'V', vedLabel: 'Vital', typeLabel: 'ขาดแคลน',
    msg: 'เหลือ 24 amp (ใช้ได้ 2 วัน) – ER ใช้เพิ่มขึ้น 40% สัปดาห์นี้ · คำขอ #REQ-1050 กำลังจัดส่ง',
    msgCritical: false, time: '25 นาทีที่แล้ว', action: 'ดูรายละเอียด', primary: false, req: 'REQ-1050',
  },
  {
    type: 'emergency', sevCls: 'sev-crit', sevLabel: 'ระดับวิกฤต', icon: 'siren',
    drug: 'Tranexamic acid 500 mg inj', ved: 'V', vedLabel: 'Vital', typeLabel: 'เหตุฉุกเฉิน',
    msg: 'เหตุฉุกเฉิน: อุบัติเหตุหมู่ ถ.เทพารักษ์ กม.12 – คาดใช้เพิ่ม 60 amp ใน 24 ชม.',
    msgCritical: true, time: '42 นาทีที่แล้ว', action: 'ดูรายละเอียด', primary: false,
  },
  {
    type: 'request', sevCls: 'sev-urg', sevLabel: 'ระดับเร่งด่วน', icon: 'inbox',
    drug: 'Amlodipine 5 mg tab', ved: 'E', vedLabel: 'Essential', typeLabel: 'คำขอ',
    msg: 'คำขอ #REQ-1047 จาก รพ.บางบ่อ (500 tab) รอคุณอนุมัติ',
    msgCritical: false, liveSecs: 2530, time: '1 ชม.ที่แล้ว', action: 'พิจารณา', primary: true, req: 'REQ-1047',
  },
  {
    type: 'expiry', sevCls: 'sev-urg', sevLabel: 'ระดับเร่งด่วน', icon: 'calx',
    drug: 'Metformin 500 mg tab', ved: 'E', vedLabel: 'Essential', typeLabel: 'ใกล้หมดอายุ',
    msg: 'Lot MF2405 · 3,000 tab หมดอายุใน 45 วัน – มี รพ. 2 แห่งต้องการใช้',
    msgCritical: false, time: 'วันนี้ 08:00', action: 'ดูรายละเอียด', primary: false,
  },
  {
    type: 'expiry', sevCls: 'sev-norm', sevLabel: 'ระดับปกติ', icon: 'calx',
    drug: 'Silver sulfadiazine 1% cream', ved: 'D', vedLabel: 'Desirable', typeLabel: 'ใกล้หมดอายุ',
    msg: 'Lot SS2311 · 40 หลอด หมดอายุใน 60 วัน',
    msgCritical: false, time: 'วันนี้ 08:00', action: 'ดูรายละเอียด', primary: false,
  },
  {
    type: 'shortage', sevCls: 'sev-urg', sevLabel: 'ระดับเร่งด่วน', icon: 'inbox',
    drug: 'CefTRIAXone 1 g inj', ved: 'V', vedLabel: 'Vital', typeLabel: 'ขาดแคลน',
    msg: 'เหลือ 8 vial (ใช้ได้ 0.9 วัน) – มีผู้ให้ยืม 2 แห่งตอบรับแล้ว',
    msgCritical: true, time: '1 ชม.ที่แล้ว', action: 'ดูคำขอ', primary: false, req: 'REQ-1053',
  },
  {
    type: 'emergency', sevCls: 'sev-urg', sevLabel: 'ระดับเร่งด่วน', icon: 'siren',
    drug: 'Dopamine 40 mg/mL inj', ved: 'E', vedLabel: 'Essential', typeLabel: 'เหตุฉุกเฉิน',
    msg: 'ER ขอสำรองเพิ่ม 30 amp สำหรับเวรดึก – สต็อกคงเหลือ 45 amp',
    msgCritical: false, time: '2 ชม.ที่แล้ว', action: 'ดูรายละเอียด', primary: false,
  },
];

export const ME = 'รพ.สมุทรปราการ';

export const INCOMING: ReqRow[] = [
  { id: 'REQ-1051', drug: 'Insulin Glargine pen', qty: '40', unit: 'pen', from: 'รพ.บางบ่อ', to: ME, ug: 'critical', ugLabel: 'เร่งด่วนมาก', st: 'pending', stTh: 'รอดำเนินการ', stEn: 'Pending', secs: 1125, action: 'ตรวจและอนุมัติ', actionPrimary: true },
  { id: 'REQ-1050', drug: 'Adrenaline 1 mg/mL amp', qty: '20', unit: 'amp', from: 'รพ.บางพลี', to: ME, ug: 'critical', ugLabel: 'เร่งด่วนมาก', st: 'transit', stTh: 'กำลังจัดส่ง', stEn: 'In Transit', step: 2, note: 'รถ สป-04 · ถึงประมาณ 19:40 น.', action: 'ติดตาม', actionPrimary: false },
  { id: 'REQ-1049', drug: 'Tranexamic acid 500 mg inj', qty: '60', unit: 'amp', from: 'รพ.พระสมุทรเจดีย์ฯ', to: ME, ug: 'urgent', ugLabel: 'เร่งด่วน', st: 'pending', stTh: 'รอดำเนินการ', stEn: 'Pending', secs: 4532, action: 'ติดตาม', actionPrimary: false },
  { id: 'REQ-1046', drug: 'Adrenaline 1 mg/mL amp', qty: '10', unit: 'amp', from: 'รพ.บางเสาธง', to: ME, ug: 'critical', ugLabel: 'เร่งด่วนมาก', st: 'approved', stTh: 'อนุมัติแล้ว', stEn: 'Approved', note: 'รอรถรับของ 19:30 น.', action: 'ดู', actionPrimary: false },
  { id: 'REQ-1042', drug: 'Amlodipine 5 mg tab', qty: '1,000', unit: 'tab', from: 'รพ.บางพลี', to: ME, ug: 'normal', ugLabel: 'ปกติ', st: 'timeout', stTh: 'หมดเวลา', stEn: 'Timeout', note: 'ไม่มีการตอบกลับใน 2 ชม. (18:47)', action: 'ส่งใหม่', actionPrimary: false },
  { id: 'REQ-1039', drug: 'Insulin Glargine pen', qty: '30', unit: 'pen', from: 'รพ.พระสมุทรเจดีย์ฯ', to: ME, ug: 'urgent', ugLabel: 'เร่งด่วน', st: 'rejected', stTh: 'ปฏิเสธ', stEn: 'Rejected', note: 'เหตุผล: สต็อกผู้ให้ยืมต่ำกว่าเกณฑ์', action: 'ดูเหตุผล', actionPrimary: false },
  { id: 'REQ-1043', drug: 'Insulin Glargine pen', qty: '20', unit: 'pen', from: 'รพ.บางพลี', to: ME, ug: 'urgent', ugLabel: 'เร่งด่วน', st: 'delivered', stTh: 'ส่งถึงแล้ว', stEn: 'Delivered', note: 'รับของแล้ว 12 ต.ค. 16:20', action: 'ดู', actionPrimary: false },
];

export const LENDING: ReqRow[] = [
  { id: 'REQ-1047', drug: 'Amlodipine 5 mg tab', qty: '500', unit: 'tab', from: ME, to: 'รพ.บางบ่อ', ug: 'normal', ugLabel: 'ปกติ', st: 'pending', stTh: 'รอดำเนินการ', stEn: 'Pending', secs: 2530, action: 'พิจารณา', actionPrimary: true },
  { id: 'REQ-1052', drug: 'Silver sulfadiazine 1% cream', qty: '15', unit: 'หลอด', from: ME, to: 'รพ.บางเสาธง', ug: 'normal', ugLabel: 'ปกติ', st: 'pending', stTh: 'รอดำเนินการ', stEn: 'Pending', secs: 6485, action: 'พิจารณา', actionPrimary: true },
  { id: 'REQ-1054', drug: 'Metformin 500 mg tab', qty: '1,000', unit: 'tab', from: ME, to: 'รพ.พระสมุทรเจดีย์ฯ', ug: 'urgent', ugLabel: 'เร่งด่วน', st: 'pending', stTh: 'รอดำเนินการ', stEn: 'Pending', secs: 9010, action: 'พิจารณา', actionPrimary: true },
  { id: 'REQ-1045', drug: 'Amlodipine 5 mg tab', qty: '300', unit: 'tab', from: ME, to: 'รพ.บางบ่อ', ug: 'normal', ugLabel: 'ปกติ', st: 'transit', stTh: 'กำลังจัดส่ง', stEn: 'In Transit', step: 2, note: 'ถึงประมาณ 20:05 น.', action: 'ติดตาม', actionPrimary: false },
  { id: 'REQ-1044', drug: 'Metformin 500 mg tab', qty: '2,000', unit: 'tab', from: ME, to: 'รพ.บางพลี', ug: 'normal', ugLabel: 'ปกติ', st: 'transit', stTh: 'กำลังจัดส่ง', stEn: 'In Transit', step: 1, note: 'ขึ้นรถแล้ว 19:05 น.', action: 'ติดตาม', actionPrimary: false },
  { id: 'REQ-1048', drug: 'Metformin 500 mg tab', qty: '500', unit: 'tab', from: ME, to: 'รพ.บางเสาธง', ug: 'normal', ugLabel: 'ปกติ', st: 'approved', stTh: 'อนุมัติแล้ว', stEn: 'Approved', note: 'อนุมัติโดยคุณ 18:52 · รอขึ้นรถ', action: 'ดู', actionPrimary: false },
  { id: 'REQ-1040', drug: 'Silver sulfadiazine 1% cream', qty: '10', unit: 'หลอด', from: ME, to: 'รพ.บางพลี', ug: 'normal', ugLabel: 'ปกติ', st: 'delivered', stTh: 'ส่งถึงแล้ว', stEn: 'Delivered', note: 'ปลายทางยืนยันรับ 16:40', action: 'ดู', actionPrimary: false },
];

export const NEARBY = [
  { n: '1', name: 'รพ.พระสมุทรเจดีย์สวาทยานนท์', km: '7.2', min: '20', lend: '5' },
  { n: '2', name: 'รพ.บางพลี', km: '15.4', min: '25', lend: '12' },
  { n: '3', name: 'รพ.บางเสาธง', km: '21.0', min: '30', lend: '3' },
  { n: '4', name: 'รพ.บางบ่อ', km: '28.6', min: '38', lend: '8' },
  { n: '5', name: 'รพ.พระประแดง', km: '12.8', min: '22', lend: '6' },
  { n: '6', name: 'รพ.บางจาก', km: '18.3', min: '28', lend: '4' },
];

export const WORK = [
  { cls: 'av-good', icon: 'check', text: 'อนุมัติให้ยืม #REQ-1048 · Metformin 500 mg tab 500 tab → รพ.บางเสาธง', time: '18:52', sub: 'คำขอยืม' },
  { cls: 'av-edit', icon: 'edit', text: 'ปรับจำนวน #REQ-1050 Adrenaline จาก 30 → 20 amp (Agent เสนอ 30)', time: '17:30', sub: 'ปรับคำแนะนำ Agent' },
  { cls: 'av-ok', icon: 'pkg', text: 'ยืนยันปล่อย Lot SS2309 · Silver sulfadiazine 15 หลอด เข้าคลังกลาง', time: '15:05', sub: 'Near-Expiry Pool' },
  { cls: 'av-bad', icon: 'x', text: 'ปฏิเสธคำขอ #REQ-1041 จาก รพ.บางบ่อ (Adrenaline) – สต็อก V ต่ำกว่าเกณฑ์', time: '11:20', sub: 'คำขอยืม' },
  { cls: 'av-hosp', icon: 'hosp', text: 'ส่งคำขอยืม #REQ-1055 · CefTRIAXone 1 g 14 vial → รพ.บางพลี', time: '10:15', sub: 'คำขอยืม' },
  { cls: 'av-sys', icon: 'login', text: 'เข้าสู่ระบบ · Chrome / Windows 11', time: '08:31', sub: 'เซสชัน' },
  { cls: 'av-sys', icon: 'clock', text: 'HIS ซิงก์สต็อกประจำวันเสร็จ · 12 รายการอัปเดต', time: '07:30', sub: 'ระบบ' },
];

export const EXPIRY = [
  { k: 'MF2405', drug: 'Metformin 500 mg tab', ved: 'E' as const, lot: 'MF2405', qty: '3,000 tab', where: 'คลังยาหลัก', days: '45', exp: '27 พ.ย. 2569', value: '2,400', urgent: true },
  { k: 'SS2311', drug: 'Silver sulfadiazine 1% cream', ved: 'D' as const, lot: 'SS2311', qty: '40 หลอด', where: 'คลังยา OPD', days: '60', exp: '12 ธ.ค. 2569', value: '3,200', urgent: false },
  { k: 'AM2402', drug: 'Amlodipine 5 mg tab', ved: 'E' as const, lot: 'AM2402', qty: '1,200 tab', where: 'คลังยาหลัก', days: '74', exp: '26 ธ.ค. 2569', value: '600', urgent: false },
  { k: 'AX2408', drug: 'Amoxicillin 500 mg cap', ved: 'E' as const, lot: 'AX2408', qty: '2,500 แคปซูล', where: 'คลังยาหลัก', days: '88', exp: '9 ม.ค. 2570', value: '1,750', urgent: false },
  { k: 'OM2403', drug: 'Omeprazole 20 mg cap', ved: 'E' as const, lot: 'OM2403', qty: '900 แคปซูล', where: 'คลังยา OPD', days: '102', exp: '23 ม.ค. 2570', value: '540', urgent: false },
];

export const ACTIVITY = [
  { cls: 'av-truck', icon: 'truck', who: 'รพ.บางพลี', text: 'ส่ง Adrenaline 1 mg/mL amp 20 amp ขึ้นรถ สป-04 แล้ว (#REQ-1050)', time: '19:05', tag: 'กำลังจัดส่ง', tagCls: 'st-transit' },
  { cls: 'av-hosp', icon: 'hosp', who: 'รพ.บางพลี', text: 'ยืนยันให้ยืม Adrenaline 20 amp', time: '18:58', tag: 'อนุมัติแล้ว', tagCls: 'st-approved' },
  { cls: 'av-sys', icon: 'clock', who: 'ระบบ:', text: 'คำขอ #1042 หมดเวลา (Timeout) – ไม่มีการตอบกลับภายใน 2 ชม.', time: '18:47', tag: 'หมดเวลา', tagCls: 'st-timeout' },
  { cls: 'av-agent', icon: 'sparkle', who: 'Agent', text: 'พยากรณ์ Insulin Glargine pen ต่ำกว่าเกณฑ์ และเสนอคำแนะนำการยืม (รอเจ้าหน้าที่อนุมัติ)', time: '18:30', tag: '', tagCls: '' },
  { cls: 'av-hosp', icon: 'hosp', who: 'รพ.บางบ่อ', text: 'ส่งคำขอยืม Amlodipine 5 mg tab 500 tab (#REQ-1047)', time: '18:05', tag: 'รอดำเนินการ', tagCls: 'st-pending' },
  { cls: 'av-ok', icon: 'pkg', who: 'รพ.บางพลี', text: 'ยืนยันรับ Silver sulfadiazine 1% cream 10 หลอด (#REQ-1040)', time: '16:40', tag: 'ส่งถึงแล้ว', tagCls: 'st-delivered' },
];

export const UG_ICON: Record<string, string> = { critical: 'tri', urgent: 'alertc', normal: 'minusc' };
export const ST_ICON: Record<string, string> = {
  pending: 'hourglass', approved: 'checkc', transit: 'truck',
  delivered: 'pkg', rejected: 'xc', timeout: 'clock',
};
export const UG_CLS: Record<string, string> = { critical: 'ug-critical', urgent: 'ug-urgent', normal: 'ug-normal' };
export const ST_CLS: Record<string, string> = {
  pending: 'st-pending', approved: 'st-approved', transit: 'st-transit',
  delivered: 'st-delivered', rejected: 'st-rejected', timeout: 'st-timeout',
};

/**
 * Return obligations — mockup `owe` list verbatim (Return obligations · UI section).
 * `overdue` renders the red "เกินกำหนด" highlight; pharmacist-critical.
 */
export interface ReturnObligation {
  drug: string;
  qty: number;
  unit: string;
  /** Hospital we owe to. */
  to: string;
  ref: string;
  mode: string;
  due: string;
  overdue: boolean;
}

export const RETURNS_OWE: ReturnObligation[] = [
  { drug: 'CefTRIAXone 1 g', qty: 20, unit: 'VIAL', to: 'รพ.บางพลี', ref: 'BR-2026-000091', mode: 'คืนเป็นยาเดิม', due: '12 ต.ค. (เมื่อวาน)', overdue: true },
  { drug: 'NORepinephrine 4 mg', qty: 20, unit: 'AMP', to: 'รพ.บางพลี', ref: 'BR-2026-000117', mode: 'คืนเป็นยาเดิม', due: '10 พ.ย.', overdue: false },
  { drug: 'NORepinephrine 4 mg', qty: 10, unit: 'AMP', to: 'รพ.พระสมุทรเจดีย์ฯ', ref: 'BR-2026-000117', mode: 'คืนเป็นยาเดิม', due: '10 พ.ย.', overdue: false },
  { drug: 'PRC group O', qty: 4, unit: 'UNIT', to: 'รพ.บางพลี', ref: 'BR-2026-000120', mode: 'คืนผ่านธนาคารเลือด', due: '11 พ.ย.', overdue: false },
  { drug: 'Omeprazole 40 mg', qty: 100, unit: 'VIAL', to: 'รพ.บางเสาธง', ref: 'BR-2026-000122', mode: 'คืนเป็นยาเดิม', due: '15 พ.ย.', overdue: false },
  { drug: 'Metformin 500 mg tab', qty: 2000, unit: 'เม็ด', to: 'รพ.บางบ่อ', ref: 'BR-2026-000123', mode: 'คืนเป็นยาเดิม', due: '18 พ.ย.', overdue: false },
];

export interface ReturnInbound {
  drug: string;
  qty: number;
  unit: string;
  from: string;
  ref: string;
  due: string;
}

export const RETURNS_INBOUND: ReturnInbound = {
  drug: 'AMLOdipine 5 mg tab', qty: 300, unit: 'เม็ด', from: 'รพ.บางเสาธง', ref: 'BR-2026-000115', due: '8 พ.ย.',
};

/** Held lot excluded from lendable stock — mockup near-expiry planning row verbatim. */
export const HELD_LOT = {
  drug: 'Omeprazole 40 mg',
  lot: 'OMP-2403',
  qty: '180',
  unit: 'vial',
  plan: 'AP-2026-000045',
  note: 'ยังไม่เริ่มเรียกใช้',
};

/** Agent daily summary — mockup "สรุปประจำวันจาก Agent" (agentbox) verbatim. */
export const AGENT_SUMMARY = {
  title: 'สรุปประจำวันจาก Agent',
  conf: 'มั่นใจสูง · HIGH',
  confCls: 't-green',
  meta: 'F1_T6 · สร้างอัตโนมัติ 07:30 น. วันนี้ · สถานะ OK',
  text: 'เช้านี้ยังไม่มีคำขอยืมเปิดอยู่ ยาที่ควรจับตาคือ CefTRIAXone 1 g (ใช้ได้อีก 1.3 วัน), 5-FU 120 SYRINGE (1.8 วัน) และ ALprostadil (6 วัน) ภาระคืน CefTRIAXone 20 vial ให้ รพ.บางพลี ครบกำหนดเมื่อวาน 12 ต.ค. และยังไม่ได้คืน',
  risk: ['CefTRIAXone 1 g · 1.3 วัน', '5-FU 120 SYRINGE · 1.8 วัน', 'ALprostadil · 6 วัน'],
  flags: ['RETURN_OVERDUE'],
};
