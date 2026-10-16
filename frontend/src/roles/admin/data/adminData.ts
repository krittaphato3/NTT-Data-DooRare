/**
 * Mock data & type models for DooRare System Admin Console (ADM-01).
 * Domain grounded in db/schema.sql and Health Region 6 network.
 */

export interface SystemKpis {
  totalDrugRequests: number;
  requestsTrend: string;
  totalCompletedDeliveries: number;
  totalRegisteredUsers: number;
  usersTrend: string;
  totalLoginsToday: number;
  totalLoginsMonth: number;
  activeOnlineUsers: number;
  overallApprovedCount: number;
  overallRejectedCount: number;
  overallTimeoutCount: number;
  successRate: number;
}

export type RequestContext = 'STOCK_ALERT' | 'MANUAL' | 'EMERGENCY';
export type RequestDirection = 'OUTGOING' | 'INCOMING';
export type RequestDeliveryStatus = 'APPROVED' | 'REJECTED' | 'TIMED_OUT' | 'IN_TRANSIT' | 'COMPLETED';

export interface HospitalDrugRequestLog {
  id: string;
  requestNo: string;
  createdAt: string;
  context: RequestContext;
  direction: RequestDirection;
  counterpartyHospital: string;
  drugName: string;
  drugForm: string;
  qtyRequested: number;
  qtyApproved: number;
  unit: string;
  status: RequestDeliveryStatus;
  rejectReason?: string;
  driverName?: string;
  vehiclePlate?: string;
  temperature?: string;
  etaOrDelivered?: string;
  docNo?: string;
}

export interface HospitalSummary {
  id: string;
  code: string;
  name: string;
  shortName: string;
  province: string;
  type: 'รพศ.' | 'รพท.' | 'รพช.';
  bedCount: number;
  hasColdChain: boolean;
  hasBloodBank: boolean;
  agentParticipation: boolean;
  requestCount: number;
  incomingCount: number;
  approvedCount: number;
  rejectedCount: number;
  timeoutCount: number;
  dispatchedCount: number;
  inTransitCount: number;
  staffCount: number;
  detailedLogs: HospitalDrugRequestLog[];
}

export type AdminUserRole =
  | 'SYSTEM_ADMIN'
  | 'HOSPITAL_ADMIN'
  | 'PHARMACIST'
  | 'WAREHOUSE_OFFICER'
  | 'DRIVER'
  | 'AUDITOR';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AdminUserRole;
  hospitalId: string;
  hospitalName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  isOnline: boolean;
  lastLogin: string;
  loginCount: number;
  createdAt: string;
}

export interface LoginHistoryRow {
  id: string;
  userName: string;
  userRole: string;
  hospitalName: string;
  timestamp: string;
  ip: string;
  device: string;
  browser: string;
  status: 'SUCCESS' | 'FAILED';
  failureReason?: string;
}

export interface SystemKillSwitch {
  id: string;
  key: string;
  name: string;
  description: string;
  category: 'AGENT' | 'DISPATCH' | 'SYNC' | 'NOTIFICATION';
  enabled: boolean;
  lastChanged: string;
  changedBy: string;
}

export interface SystemConfigParam {
  id: string;
  key: string;
  label: string;
  description: string;
  value: string;
  unit?: string;
  category: 'SAFETY' | 'TIMEOUT' | 'LOGISTICS';
}

export interface TopRequestedDrug {
  id: string;
  name: string;
  form: string;
  borrowCount: number;
  totalUnits: number;
  unit: string;
  valueThb: number;
  stockStatus: 'NORMAL' | 'LOW' | 'CRITICAL';
}

export interface SystemHealthStatus {
  hisGatewaysConnected: number;
  hisGatewaysTotal: number;
  coldChainSensorsOk: number;
  coldChainSensorsTotal: number;
  agentLatencySec: number;
  agentAccuracyPct: number;
  dbIntegrityVerified: boolean;
}

export interface ExecutiveValueStats {
  totalSharedValueThb: number;
  wastePreventedValueThb: number;
  emergencyDeliveriesCount: number;
  avgDeliveryMinutes: number;
}

export interface AuditLogRow {
  id: string;
  timestamp: string;
  action: string;
  actionCode: string;
  actionTone: 'green' | 'red' | 'blue' | 'amber' | 'purple';
  actorName: string;
  actorRole: string;
  hospitalName: string;
  entity: string;
  details: string;
  ip: string;
  sha256Hash: string;
}

export const ADMIN_KPIS: SystemKpis = {
  totalDrugRequests: 1482,
  requestsTrend: '+12.4% เทียบเดือนก่อน',
  totalCompletedDeliveries: 1329,
  totalRegisteredUsers: 128,
  usersTrend: '+6 บัญชีใหม่สัปดาห์นี้',
  totalLoginsToday: 342,
  totalLoginsMonth: 9840,
  activeOnlineUsers: 24,
  overallApprovedCount: 1329,
  overallRejectedCount: 118,
  overallTimeoutCount: 35,
  successRate: 89.7,
};

export const HOURLY_LOGIN_STATS = [
  { hour: '00:00', logins: 4, online: 2 },
  { hour: '02:00', logins: 2, online: 1 },
  { hour: '04:00', logins: 3, online: 2 },
  { hour: '06:00', logins: 14, online: 8 },
  { hour: '08:00', logins: 86, online: 28 },
  { hour: '10:00', logins: 64, online: 26 },
  { hour: '12:00', logins: 38, online: 19 },
  { hour: '14:00', logins: 72, online: 24 },
  { hour: '16:00', logins: 45, online: 18 },
  { hour: '18:00', logins: 22, online: 11 },
  { hour: '20:00', logins: 16, online: 7 },
  { hour: '22:00', logins: 8, online: 4 },
];

export const DAILY_REQUEST_TRENDS = [
  { day: 'จันทร์ 10 ต.ค.', requested: 68, approved: 61, rejected: 5, timeout: 2 },
  { day: 'อังคาร 11 ต.ค.', requested: 74, approved: 68, rejected: 4, timeout: 2 },
  { day: 'พุธ 12 ต.ค.', requested: 82, approved: 75, rejected: 6, timeout: 1 },
  { day: 'พฤหัส 13 ต.ค.', requested: 79, approved: 72, rejected: 5, timeout: 2 },
  { day: 'ศุกร์ 14 ต.ค.', requested: 91, approved: 83, rejected: 7, timeout: 1 },
  { day: 'เสาร์ 15 ต.ค.', requested: 42, approved: 38, rejected: 3, timeout: 1 },
  { day: 'อาทิตย์ 16 ต.ค.', requested: 36, approved: 32, rejected: 3, timeout: 1 },
];

export const INITIAL_HOSPITALS: HospitalSummary[] = [
  {
    id: 'HOSP-01',
    code: '10670',
    name: 'โรงพยาบาลสมุทรปราการ',
    shortName: 'รพ.สมุทรปราการ',
    province: 'สมุทรปราการ',
    type: 'รพศ.',
    bedCount: 650,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 312,
    incomingCount: 284,
    approvedCount: 268,
    rejectedCount: 11,
    timeoutCount: 5,
    dispatchedCount: 279,
    inTransitCount: 2,
    staffCount: 24,
    detailedLogs: [
      {
        id: 'LOG-01-1',
        requestNo: 'REQ-2026-1052',
        createdAt: '16 ต.ค. 69 14:22',
        context: 'STOCK_ALERT',
        direction: 'OUTGOING',
        counterpartyHospital: 'โรงพยาบาลบางพลี',
        drugName: 'Insulin Glargine 100 IU/mL SoloStar',
        drugForm: 'Pen injector (Cold chain 2-8°C)',
        qtyRequested: 40,
        qtyApproved: 40,
        unit: 'ด้าม',
        status: 'COMPLETED',
        driverName: 'นายสุวิทย์ นำเจริญ',
        vehiclePlate: '1ฒข-4891 กทม.',
        temperature: '4.2°C (Safe)',
        etaOrDelivered: '15:18 น. (ส่งมอบสำเร็จ)',
        docNo: 'DR-10670-2026-00412',
      },
      {
        id: 'LOG-01-2',
        requestNo: 'REQ-2026-1049',
        createdAt: '16 ต.ค. 69 11:05',
        context: 'EMERGENCY',
        direction: 'INCOMING',
        counterpartyHospital: 'โรงพยาบาลบางบ่อ',
        drugName: 'Packed Red Cells (PRC) Group O Rh+',
        drugForm: 'Blood unit (Cold chain 2-6°C)',
        qtyRequested: 4,
        qtyApproved: 4,
        unit: 'ยูนิต',
        status: 'IN_TRANSIT',
        driverName: 'นายสมชาย วงศ์สวัสดิ์',
        vehiclePlate: 'ฮน-9214 สป.',
        temperature: '3.8°C (Safe)',
        etaOrDelivered: 'คาดการณ์ถึง 15:45 น.',
        docNo: 'DR-10670-2026-00411',
      },
      {
        id: 'LOG-01-3',
        requestNo: 'REQ-2026-1038',
        createdAt: '15 ต.ค. 69 16:40',
        context: 'MANUAL',
        direction: 'OUTGOING',
        counterpartyHospital: 'โรงพยาบาลชลบุรี',
        drugName: 'Snake Antivenom (Green pit viper)',
        drugForm: 'Vial 10 mL (Freeze-dried)',
        qtyRequested: 10,
        qtyApproved: 10,
        unit: 'ขวด',
        status: 'COMPLETED',
        driverName: 'นายกิตติชัย ภักดี',
        vehiclePlate: '4กต-2081 ชบ.',
        temperature: '22.0°C (Controlled)',
        etaOrDelivered: '18:10 น. (ส่งมอบสำเร็จ)',
        docNo: 'DR-10670-2026-00408',
      },
      {
        id: 'LOG-01-4',
        requestNo: 'REQ-2026-1025',
        createdAt: '15 ต.ค. 69 09:12',
        context: 'STOCK_ALERT',
        direction: 'INCOMING',
        counterpartyHospital: 'โรงพยาบาลพุทธโสธร',
        drugName: 'Albumin human 20% 50 mL',
        drugForm: 'Bottle',
        qtyRequested: 20,
        qtyApproved: 0,
        unit: 'ขวด',
        status: 'REJECTED',
        rejectReason: 'สต็อกคงเหลือต่ำกว่า Safety stock สำรองสำหรับผู้ป่วยวิกฤต',
        docNo: '-',
      },
      {
        id: 'LOG-01-5',
        requestNo: 'REQ-2026-0994',
        createdAt: '14 ต.ค. 69 18:30',
        context: 'MANUAL',
        direction: 'INCOMING',
        counterpartyHospital: 'โรงพยาบาลบางปะกง',
        drugName: 'Morphine sulfate 10 mg/mL inj',
        drugForm: 'Ampoule 1 mL (ยาเสพติดให้โทษ)',
        qtyRequested: 50,
        qtyApproved: 0,
        unit: 'แอมพูล',
        status: 'TIMED_OUT',
        rejectReason: 'หมดเวลาตอบรับอัตโนมัติ 15 นาทีตามกฎความปลอดภัย F1b-014',
        docNo: '-',
      },
    ],
  },
  {
    id: 'HOSP-02',
    code: '10671',
    name: 'โรงพยาบาลบางพลี',
    shortName: 'รพ.บางพลี',
    province: 'สมุทรปราการ',
    type: 'รพท.',
    bedCount: 280,
    hasColdChain: true,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 184,
    incomingCount: 198,
    approvedCount: 182,
    rejectedCount: 12,
    timeoutCount: 4,
    dispatchedCount: 180,
    inTransitCount: 1,
    staffCount: 16,
    detailedLogs: [
      {
        id: 'LOG-02-1',
        requestNo: 'REQ-2026-1052',
        createdAt: '16 ต.ค. 69 14:22',
        context: 'STOCK_ALERT',
        direction: 'INCOMING',
        counterpartyHospital: 'โรงพยาบาลสมุทรปราการ',
        drugName: 'Insulin Glargine 100 IU/mL SoloStar',
        drugForm: 'Pen injector',
        qtyRequested: 40,
        qtyApproved: 40,
        unit: 'ด้าม',
        status: 'COMPLETED',
        driverName: 'นายสุวิทย์ นำเจริญ',
        vehiclePlate: '1ฒข-4891 กทม.',
        temperature: '4.2°C (Safe)',
        etaOrDelivered: '15:18 น.',
        docNo: 'DR-10671-2026-00214',
      },
      {
        id: 'LOG-02-2',
        requestNo: 'REQ-2026-1011',
        createdAt: '14 ต.ค. 69 13:15',
        context: 'MANUAL',
        direction: 'OUTGOING',
        counterpartyHospital: 'โรงพยาบาลสมุทรปราการ',
        drugName: 'Meropenem 1 g inj',
        drugForm: 'Vial',
        qtyRequested: 60,
        qtyApproved: 60,
        unit: 'ขวด',
        status: 'COMPLETED',
        driverName: 'นายอนุรักษ์ มั่นคง',
        vehiclePlate: '2ฒผ-1120 สป.',
        temperature: 'ปกติ (Room temp)',
        etaOrDelivered: '14:20 น.',
        docNo: 'DR-10671-2026-00210',
      },
    ],
  },
  {
    id: 'HOSP-03',
    code: '10672',
    name: 'โรงพยาบาลบางบ่อ',
    shortName: 'รพ.บางบ่อ',
    province: 'สมุทรปราการ',
    type: 'รพช.',
    bedCount: 120,
    hasColdChain: true,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 124,
    incomingCount: 88,
    approvedCount: 81,
    rejectedCount: 5,
    timeoutCount: 2,
    dispatchedCount: 80,
    inTransitCount: 1,
    staffCount: 10,
    detailedLogs: [
      {
        id: 'LOG-03-1',
        requestNo: 'REQ-2026-1049',
        createdAt: '16 ต.ค. 69 11:05',
        context: 'EMERGENCY',
        direction: 'OUTGOING',
        counterpartyHospital: 'โรงพยาบาลสมุทรปราการ',
        drugName: 'Packed Red Cells (PRC) Group O Rh+',
        drugForm: 'Blood unit (Cold chain 2-6°C)',
        qtyRequested: 4,
        qtyApproved: 4,
        unit: 'ยูนิต',
        status: 'IN_TRANSIT',
        driverName: 'นายสมชาย วงศ์สวัสดิ์',
        vehiclePlate: 'ฮน-9214 สป.',
        temperature: '3.8°C',
        etaOrDelivered: 'คาดการณ์ถึง 15:45 น.',
        docNo: 'DR-10672-2026-00142',
      },
    ],
  },
  {
    id: 'HOSP-04',
    code: '10701',
    name: 'โรงพยาบาลชลบุรี',
    shortName: 'รพ.ชลบุรี',
    province: 'ชลบุรี',
    type: 'รพศ.',
    bedCount: 820,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 395,
    incomingCount: 370,
    approvedCount: 348,
    rejectedCount: 16,
    timeoutCount: 6,
    dispatchedCount: 342,
    inTransitCount: 3,
    staffCount: 28,
    detailedLogs: [
      {
        id: 'LOG-04-1',
        requestNo: 'REQ-2026-1038',
        createdAt: '15 ต.ค. 69 16:40',
        context: 'MANUAL',
        direction: 'INCOMING',
        counterpartyHospital: 'โรงพยาบาลสมุทรปราการ',
        drugName: 'Snake Antivenom (Green pit viper)',
        drugForm: 'Vial 10 mL',
        qtyRequested: 10,
        qtyApproved: 10,
        unit: 'ขวด',
        status: 'COMPLETED',
        driverName: 'นายกิตติชัย ภักดี',
        vehiclePlate: '4กต-2081 ชบ.',
        temperature: '22.0°C',
        etaOrDelivered: '18:10 น.',
        docNo: 'DR-10701-2026-00512',
      },
    ],
  },
  {
    id: 'HOSP-05',
    code: '10720',
    name: 'โรงพยาบาลระยอง',
    shortName: 'รพ.ระยอง',
    province: 'ระยอง',
    type: 'รพศ.',
    bedCount: 600,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 245,
    incomingCount: 220,
    approvedCount: 204,
    rejectedCount: 12,
    timeoutCount: 4,
    dispatchedCount: 202,
    inTransitCount: 1,
    staffCount: 18,
    detailedLogs: [],
  },
  {
    id: 'HOSP-06',
    code: '10740',
    name: 'โรงพยาบาลพุทธโสธร',
    shortName: 'รพ.พุทธโสธร',
    province: 'ฉะเชิงเทรา',
    type: 'รพศ.',
    bedCount: 540,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 198,
    incomingCount: 165,
    approvedCount: 154,
    rejectedCount: 8,
    timeoutCount: 3,
    dispatchedCount: 152,
    inTransitCount: 0,
    staffCount: 15,
    detailedLogs: [],
  },
  {
    id: 'HOSP-07',
    code: '10760',
    name: 'โรงพยาบาลเจ้าพระยาอภัยภูเบศร',
    shortName: 'รพ.เจ้าพระยาอภัยภูเบศร',
    province: 'ปราจีนบุรี',
    type: 'รพศ.',
    bedCount: 480,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 162,
    incomingCount: 145,
    approvedCount: 136,
    rejectedCount: 6,
    timeoutCount: 3,
    dispatchedCount: 135,
    inTransitCount: 1,
    staffCount: 14,
    detailedLogs: [],
  },
  {
    id: 'HOSP-08',
    code: '10702',
    name: 'โรงพยาบาลสัตหีบ กม.10',
    shortName: 'รพ.สัตหีบ กม.10',
    province: 'ชลบุรี',
    type: 'รพท.',
    bedCount: 200,
    hasColdChain: true,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 92,
    incomingCount: 68,
    approvedCount: 64,
    rejectedCount: 3,
    timeoutCount: 1,
    dispatchedCount: 64,
    inTransitCount: 0,
    staffCount: 8,
    detailedLogs: [],
  },
  {
    id: 'HOSP-09',
    code: '10721',
    name: 'โรงพยาบาลแกลง',
    shortName: 'รพ.แกลง',
    province: 'ระยอง',
    type: 'รพท.',
    bedCount: 180,
    hasColdChain: true,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 78,
    incomingCount: 54,
    approvedCount: 51,
    rejectedCount: 2,
    timeoutCount: 1,
    dispatchedCount: 50,
    inTransitCount: 0,
    staffCount: 7,
    detailedLogs: [],
  },
  {
    id: 'HOSP-10',
    code: '10741',
    name: 'โรงพยาบาลบางปะกง',
    shortName: 'รพ.บางปะกง',
    province: 'ฉะเชิงเทรา',
    type: 'รพช.',
    bedCount: 90,
    hasColdChain: false,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 64,
    incomingCount: 35,
    approvedCount: 32,
    rejectedCount: 2,
    timeoutCount: 1,
    dispatchedCount: 32,
    inTransitCount: 0,
    staffCount: 5,
    detailedLogs: [],
  },
  {
    id: 'HOSP-11',
    code: '10761',
    name: 'โรงพยาบาลกบินทร์บุรี',
    shortName: 'รพ.กบินทร์บุรี',
    province: 'ปราจีนบุรี',
    type: 'รพท.',
    bedCount: 150,
    hasColdChain: true,
    hasBloodBank: false,
    agentParticipation: true,
    requestCount: 85,
    incomingCount: 62,
    approvedCount: 58,
    rejectedCount: 3,
    timeoutCount: 1,
    dispatchedCount: 58,
    inTransitCount: 0,
    staffCount: 6,
    detailedLogs: [],
  },
  {
    id: 'HOSP-12',
    code: '10780',
    name: 'โรงพยาบาลสมเด็จพระยุพราชสระแก้ว',
    shortName: 'รพ.สระแก้ว',
    province: 'สระแก้ว',
    type: 'รพศ.',
    bedCount: 420,
    hasColdChain: true,
    hasBloodBank: true,
    agentParticipation: true,
    requestCount: 142,
    incomingCount: 110,
    approvedCount: 104,
    rejectedCount: 4,
    timeoutCount: 2,
    dispatchedCount: 102,
    inTransitCount: 1,
    staffCount: 12,
    detailedLogs: [],
  },
];

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'USR-001',
    name: 'ดร.สมเกียรติ วิจิตรพงศ์',
    email: 'somkiat.v@moph.go.th',
    phone: '081-456-7890',
    role: 'SYSTEM_ADMIN',
    hospitalId: 'HOSP-01',
    hospitalName: 'ศูนย์ประสานยา เขตสุขภาพที่ 6 (ประจำ รพ.สมุทรปราการ)',
    status: 'ACTIVE',
    isOnline: true,
    lastLogin: '16 ต.ค. 69 22:45 น.',
    loginCount: 384,
    createdAt: '01 ม.ค. 69',
  },
  {
    id: 'USR-002',
    name: 'ภก.ณัฐวุฒิ ศรีสุข',
    email: 'nattawut.s@spkhosp.go.th',
    phone: '089-123-4567',
    role: 'PHARMACIST',
    hospitalId: 'HOSP-01',
    hospitalName: 'โรงพยาบาลสมุทรปราการ',
    status: 'ACTIVE',
    isOnline: true,
    lastLogin: '16 ต.ค. 69 23:10 น.',
    loginCount: 512,
    createdAt: '15 ม.ค. 69',
  },
  {
    id: 'USR-003',
    name: 'ภญ.วิภาวรรณ โชคชัย',
    email: 'wipawan.c@bpk.go.th',
    phone: '084-987-6543',
    role: 'PHARMACIST',
    hospitalId: 'HOSP-02',
    hospitalName: 'โรงพยาบาลบางพลี',
    status: 'ACTIVE',
    isOnline: true,
    lastLogin: '16 ต.ค. 69 21:15 น.',
    loginCount: 420,
    createdAt: '20 ม.ค. 69',
  },
  {
    id: 'USR-004',
    name: 'นายกิตติชัย ภักดี',
    email: 'kittichai.p@cbh.go.th',
    phone: '086-333-2211',
    role: 'WAREHOUSE_OFFICER',
    hospitalId: 'HOSP-04',
    hospitalName: 'โรงพยาบาลชลบุรี',
    status: 'ACTIVE',
    isOnline: true,
    lastLogin: '16 ต.ค. 69 20:50 น.',
    loginCount: 295,
    createdAt: '01 ก.พ. 69',
  },
  {
    id: 'USR-005',
    name: 'นายสมชาย วงศ์สวัสดิ์',
    email: 'somchai.w@logistics.doorare.th',
    phone: '085-777-8899',
    role: 'DRIVER',
    hospitalId: 'HOSP-01',
    hospitalName: 'โรงพยาบาลสมุทรปราการ (หน่วยขนส่งยา)',
    status: 'ACTIVE',
    isOnline: true,
    lastLogin: '16 ต.ค. 69 22:00 น.',
    loginCount: 310,
    createdAt: '10 ก.พ. 69',
  },
  {
    id: 'USR-006',
    name: 'นพ.เกรียงไกร ธนกิจการุณ',
    email: 'kriangkrai.t@rayonghosp.go.th',
    phone: '082-111-4455',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'HOSP-05',
    hospitalName: 'โรงพยาบาลระยอง',
    status: 'ACTIVE',
    isOnline: false,
    lastLogin: '16 ต.ค. 69 17:30 น.',
    loginCount: 168,
    createdAt: '01 มี.ค. 69',
  },
  {
    id: 'USR-007',
    name: 'ภก.ธนภูมิ เจริญพงษ์',
    email: 'thanapoom.c@bbhosp.go.th',
    phone: '087-222-9900',
    role: 'PHARMACIST',
    hospitalId: 'HOSP-03',
    hospitalName: 'โรงพยาบาลบางบ่อ',
    status: 'ACTIVE',
    isOnline: false,
    lastLogin: '16 ต.ค. 69 16:45 น.',
    loginCount: 215,
    createdAt: '05 มี.ค. 69',
  },
  {
    id: 'USR-008',
    name: 'นางสาวพิมลวรรณ สุขเกษม',
    email: 'pimonwan.s@audit.moph.go.th',
    phone: '083-444-1122',
    role: 'AUDITOR',
    hospitalId: 'HOSP-01',
    hospitalName: 'กลุ่มงานตรวจสอบภายใน เขตสุขภาพที่ 6',
    status: 'ACTIVE',
    isOnline: false,
    lastLogin: '15 ต.ค. 69 14:20 น.',
    loginCount: 89,
    createdAt: '12 มี.ค. 69',
  },
  {
    id: 'USR-009',
    name: 'นายสุวิทย์ นำเจริญ',
    email: 'suwit.n@logistics.doorare.th',
    phone: '089-666-3322',
    role: 'DRIVER',
    hospitalId: 'HOSP-02',
    hospitalName: 'โรงพยาบาลบางพลี (หน่วยขนส่งยา)',
    status: 'ACTIVE',
    isOnline: false,
    lastLogin: '16 ต.ค. 69 18:00 น.',
    loginCount: 194,
    createdAt: '22 มี.ค. 69',
  },
  {
    id: 'USR-010',
    name: 'ภญ.ศศิธร บุญทวี',
    email: 'sasithorn.b@pts.go.th',
    phone: '081-999-5544',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'HOSP-06',
    hospitalName: 'โรงพยาบาลพุทธโสธร',
    status: 'INACTIVE',
    isOnline: false,
    lastLogin: '02 ต.ค. 69 09:10 น.',
    loginCount: 42,
    createdAt: '10 เม.ย. 69',
  },
];

export const RECENT_LOGINS: LoginHistoryRow[] = [
  {
    id: 'SES-01',
    userName: 'ภก.ณัฐวุฒิ ศรีสุข',
    userRole: 'เภสัชกร (Pharmacist)',
    hospitalName: 'โรงพยาบาลสมุทรปราการ',
    timestamp: '16 ต.ค. 69 23:10 น.',
    ip: '10.24.6.18',
    device: 'Desktop PC (Windows 11)',
    browser: 'Chrome 129',
    status: 'SUCCESS',
  },
  {
    id: 'SES-02',
    userName: 'ดร.สมเกียรติ วิจิตรพงศ์',
    userRole: 'ผู้ดูแลระบบสูงสุด (System Admin)',
    hospitalName: 'ศูนย์ประสานยา เขตสุขภาพที่ 6',
    timestamp: '16 ต.ค. 69 22:45 น.',
    ip: '10.24.1.2',
    device: 'MacBook Pro (macOS 15)',
    browser: 'Safari 18',
    status: 'SUCCESS',
  },
  {
    id: 'SES-03',
    userName: 'นายสมชาย วงศ์สวัสดิ์',
    userRole: 'พนักงานขับรถส่งยา (Driver)',
    hospitalName: 'โรงพยาบาลสมุทรปราการ',
    timestamp: '16 ต.ค. 69 22:00 น.',
    ip: '110.168.42.7',
    device: 'Mobile (Android 14)',
    browser: 'Chrome Mobile',
    status: 'SUCCESS',
  },
  {
    id: 'SES-04',
    userName: 'ไม่ระบุตัวตน (Unknown)',
    userRole: 'Unknown',
    hospitalName: 'ภายนอกเครือข่าย',
    timestamp: '16 ต.ค. 69 21:58 น.',
    ip: '185.220.101.4',
    device: 'Linux Bot',
    browser: 'Firefox 130',
    status: 'FAILED',
    failureReason: 'IP ผิดปกติจากต่างประเทศ · ระบบบล็อกอัตโนมัติ (SEC-008)',
  },
  {
    id: 'SES-05',
    userName: 'ภญ.วิภาวรรณ โชคชัย',
    userRole: 'เภสัชกร (Pharmacist)',
    hospitalName: 'โรงพยาบาลบางพลี',
    timestamp: '16 ต.ค. 69 21:15 น.',
    ip: '10.24.7.40',
    device: 'iPad Pro (iPadOS 18)',
    browser: 'Mobile Safari',
    status: 'SUCCESS',
  },
];

export const INITIAL_KILL_SWITCHES: SystemKillSwitch[] = [
  {
    id: 'KS-01',
    key: 'AGENT_AUTO_MATCH_ENABLED',
    name: 'ระบบจับคู่คำขออัตโนมัติ (AI Agent Auto-Matching)',
    description: 'อนุญาตให้ AI Agent คำนวณแลดเดอร์และเลือกโรงพยาบาลผู้ให้ยืมอัตโนมัติ หากปิดระบบจะสลับเป็น Manual Rule-based',
    category: 'AGENT',
    enabled: true,
    lastChanged: '14 ต.ค. 69 08:00 น.',
    changedBy: 'ดร.สมเกียรติ วิจิตรพงศ์',
  },
  {
    id: 'KS-02',
    key: 'EMERGENCY_DISPATCH_ENABLED',
    name: 'การสร้างคำขอยืมฉุกเฉิน (Emergency Out-of-hours Dispatch)',
    description: 'เปิดรับคำขอยืมเวชภัณฑ์วิกฤตนอกเวลาทำการ 24 ชม. หากปิดต้องผ่านการอนุมัติระดับเขตโดยตรง',
    category: 'DISPATCH',
    enabled: true,
    lastChanged: '10 ต.ค. 69 12:30 น.',
    changedBy: 'ดร.สมเกียรติ วิจิตรพงศ์',
  },
  {
    id: 'KS-03',
    key: 'AUTOMATED_HIS_SYNC',
    name: 'การซิงค์ข้อมูล HIS อัตโนมัติ (Automated HIS Drug Sync)',
    description: 'ดึงข้อมูลสต็อกและยอดการใช้ยาจากระบบ HIS โรงพยาบาลทุก 30 นาที หากปิดระบบจะหยุดการดึงข้อมูลชั่วคราว',
    category: 'SYNC',
    enabled: true,
    lastChanged: '08 ต.ค. 69 15:40 น.',
    changedBy: 'ดร.สมเกียรติ วิจิตรพงศ์',
  },
  {
    id: 'KS-04',
    key: 'EXTERNAL_SMS_NOTIFICATIONS',
    name: 'การส่งแจ้งเตือน SMS และ LINE Notify ภายนอก',
    description: 'ส่งข้อความแจ้งเตือนด่วนไปยังเบอร์มือถือของเจ้าหน้าที่เวรคลังยาและคนขับรถ',
    category: 'NOTIFICATION',
    enabled: true,
    lastChanged: '01 ต.ค. 69 09:00 น.',
    changedBy: 'ดร.สมเกียรติ วิจิตรพงศ์',
  },
];

export const INITIAL_CONFIG_PARAMS: SystemConfigParam[] = [
  {
    id: 'CFG-01',
    key: 'EMERGENCY_TIMEOUT_MINUTES',
    label: 'เวลาตอบรับคำขอฉุกเฉินสูงสุด (Critical Timeout)',
    description: 'ระยะเวลาที่โรงพยาบาลผู้ให้ยืมต้องตอบรับคำขอยืมกรณีผู้ป่วยวิกฤต ก่อนตัดส่งโรงพยาบาลลำดับถัดไป',
    value: '3',
    unit: 'นาที',
    category: 'TIMEOUT',
  },
  {
    id: 'CFG-02',
    key: 'ROUTINE_TIMEOUT_MINUTES',
    label: 'เวลาตอบรับคำขอทั่วไปสูงสุด (Routine Timeout)',
    description: 'ระยะเวลาตอบรับคำขอยืมยาปกติจากการแจ้งเตือนสต็อกต่ำ',
    value: '15',
    unit: 'นาที',
    category: 'TIMEOUT',
  },
  {
    id: 'CFG-03',
    key: 'COLD_CHAIN_MIN_TEMP',
    label: 'อุณหภูมิต่ำสุดของระบบ Cold Chain (Min Safe Temp)',
    description: 'เกณฑ์อุณหภูมิต่ำสุดที่ยอมรับได้สำหรับตู้แช่และกล่องขนส่งยาควบคุมความเย็น',
    value: '2.0',
    unit: '°C',
    category: 'SAFETY',
  },
  {
    id: 'CFG-04',
    key: 'COLD_CHAIN_MAX_TEMP',
    label: 'อุณหภูมิสูงสุดของระบบ Cold Chain (Max Safe Temp)',
    description: 'เกณฑ์อุณหภูมิสูงสุดที่ยอมรับได้สำหรับเวชภัณฑ์ควบคุมความเย็น',
    value: '8.0',
    unit: '°C',
    category: 'SAFETY',
  },
  {
    id: 'CFG-05',
    key: 'MAX_DISPATCH_RADIUS_KM',
    label: 'รัศมีการจัดส่งยาขั้นต้นสูงสุด (Default Max Radius)',
    description: 'ขอบเขตระยะทางสูงสุดในการจัดสรรและค้นหาโรงพยาบาลผู้ให้ยืมในเขตสุขภาพที่ 6',
    value: '85',
    unit: 'กิโลเมตร',
    category: 'LOGISTICS',
  },
];

export const INITIAL_AUDIT_LOGS: AuditLogRow[] = [
  {
    id: 'AUD-1089',
    timestamp: '16 ต.ค. 69 23:10 น.',
    action: 'เข้าสู่ระบบสำเร็จ (LOGIN_SUCCESS)',
    actionCode: 'LOGIN_SUCCESS',
    actionTone: 'green',
    actorName: 'ภก.ณัฐวุฒิ ศรีสุข',
    actorRole: 'PHARMACIST',
    hospitalName: 'โรงพยาบาลสมุทรปราการ',
    entity: 'session:Chrome-129',
    details: 'เข้าสู่ระบบจากเครือข่ายภายในโรงพยาบาล ผ่าน 2-Factor Authentication สำเร็จ',
    ip: '10.24.6.18',
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    id: 'AUD-1088',
    timestamp: '16 ต.ค. 69 22:45 น.',
    action: 'แก้ไขค่าระบบ (CONFIG_UPDATE)',
    actionCode: 'CONFIG_UPDATE',
    actionTone: 'amber',
    actorName: 'ดร.สมเกียรติ วิจิตรพงศ์',
    actorRole: 'SYSTEM_ADMIN',
    hospitalName: 'ศูนย์ประสานยา เขตสุขภาพที่ 6',
    entity: 'config:MAX_DISPATCH_RADIUS_KM',
    details: 'ปรับรัศมีขนส่งสูงสุดจาก 80 กม. เป็น 85 กม. เพื่อรองรับ รพ.สระแก้ว',
    ip: '10.24.1.2',
    sha256Hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
  },
  {
    id: 'AUD-1087',
    timestamp: '16 ต.ค. 69 21:58 น.',
    action: 'ความปลอดภัย: บล็อกการเข้าถึง (SEC_BLOCK)',
    actionCode: 'SEC_BLOCK',
    actionTone: 'red',
    actorName: 'ระบบรักษาความปลอดภัยอัตโนมัติ (Firewall)',
    actorRole: 'SECURITY_DAEMON',
    hospitalName: 'ศูนย์กลางระบบ เขต 6',
    entity: 'auth:failed_attempt',
    details: 'ตรวจพบการพยายามเข้าถึงจาก IP ต่างประเทศที่มีความเสี่ยงสูง (185.220.101.4) · บล็อกอัตโนมัติ',
    ip: '185.220.101.4',
    sha256Hash: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
  },
  {
    id: 'AUD-1086',
    timestamp: '16 ต.ค. 69 15:18 น.',
    action: 'ส่งมอบยาสำเร็จ (DISPATCH_FULFILLED)',
    actionCode: 'DISPATCH_FULFILLED',
    actionTone: 'blue',
    actorName: 'นายสุวิทย์ นำเจริญ',
    actorRole: 'DRIVER',
    hospitalName: 'โรงพยาบาลบางพลี',
    entity: 'borrow_leg:REQ-2026-1052',
    details: 'ส่งมอบ Insulin Glargine 40 ด้าม ที่ รพ.สมุทรปราการ · อุณหภูมิส่งมอบ 4.2°C ปลอดภัย 100%',
    ip: '110.168.42.7',
    sha256Hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  },
  {
    id: 'AUD-1085',
    timestamp: '16 ต.ค. 69 14:25 น.',
    action: 'อนุมัติคำขอส่งยา (REQUEST_APPROVED)',
    actionCode: 'REQUEST_APPROVED',
    actionTone: 'green',
    actorName: 'ภญ.วิภาวรรณ โชคชัย',
    actorRole: 'PHARMACIST',
    hospitalName: 'โรงพยาบาลบางพลี',
    entity: 'borrow_request:REQ-2026-1052',
    details: 'อนุมัติให้ยืม Insulin Glargine SoloStar 40 ด้าม แก่ รพ.สมุทรปราการ ผ่าน AI Auto-matching',
    ip: '10.24.7.40',
    sha256Hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
  },
  {
    id: 'AUD-1084',
    timestamp: '16 ต.ค. 69 11:10 น.',
    action: 'สร้างคำขอยืมฉุกเฉิน (EMERGENCY_REQUEST)',
    actionCode: 'EMERGENCY_REQUEST',
    actionTone: 'red',
    actorName: 'ภก.ธนภูมิ เจริญพงษ์',
    actorRole: 'PHARMACIST',
    hospitalName: 'โรงพยาบาลบางบ่อ',
    entity: 'borrow_request:REQ-2026-1049',
    details: 'สร้างคำขอยืมโลหิตฉุกเฉิน PRC Group O Rh+ จำนวน 4 ยูนิต ส่งไปยัง รพ.สมุทรปราการ (คลังเลือด)',
    ip: '10.24.8.12',
    sha256Hash: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
  },
  {
    id: 'AUD-1083',
    timestamp: '16 ต.ค. 69 09:12 น.',
    action: 'ปฏิเสธคำขอยืม (REQUEST_REJECTED)',
    actionCode: 'REQUEST_REJECTED',
    actionTone: 'amber',
    actorName: 'ภก.ณัฐวุฒิ ศรีสุข',
    actorRole: 'PHARMACIST',
    hospitalName: 'โรงพยาบาลสมุทรปราการ',
    entity: 'borrow_leg:REQ-2026-1025',
    details: 'ปฏิเสธคำขอ Albumin 20% จาก รพ.พุทธโสธร เนื่องจากสต็อกคงเหลือต่ำกว่าเกณฑ์ Safety Stock',
    ip: '10.24.6.18',
    sha256Hash: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
  },
];

export const TOP_REQUESTED_DRUGS: TopRequestedDrug[] = [
  {
    id: 'DRUG-01',
    name: 'Insulin Glargine 100 IU/mL SoloStar',
    form: 'Pen injector (Cold chain 2-8°C)',
    borrowCount: 184,
    totalUnits: 7360,
    unit: 'ด้าม',
    valueThb: 1840000,
    stockStatus: 'NORMAL',
  },
  {
    id: 'DRUG-02',
    name: 'Albumin human 20% 50 mL',
    form: 'Vial/Bottle',
    borrowCount: 126,
    totalUnits: 2520,
    unit: 'ขวด',
    valueThb: 3780000,
    stockStatus: 'LOW',
  },
  {
    id: 'DRUG-03',
    name: 'Snake Antivenom (Green pit viper)',
    form: 'Freeze-dried powder 10 mL',
    borrowCount: 64,
    totalUnits: 640,
    unit: 'ขวด',
    valueThb: 1920000,
    stockStatus: 'CRITICAL',
  },
  {
    id: 'DRUG-04',
    name: 'Packed Red Cells (PRC) Group O Rh+',
    form: 'Blood unit (2-6°C Blood bank)',
    borrowCount: 48,
    totalUnits: 192,
    unit: 'ยูนิต',
    valueThb: 576000,
    stockStatus: 'LOW',
  },
  {
    id: 'DRUG-05',
    name: 'Meropenem 1 g powder for inj',
    form: 'Vial',
    borrowCount: 42,
    totalUnits: 4200,
    unit: 'ขวด',
    valueThb: 1260000,
    stockStatus: 'NORMAL',
  },
];

export const SYSTEM_HEALTH: SystemHealthStatus = {
  hisGatewaysConnected: 12,
  hisGatewaysTotal: 12,
  coldChainSensorsOk: 18,
  coldChainSensorsTotal: 18,
  agentLatencySec: 1.2,
  agentAccuracyPct: 98.4,
  dbIntegrityVerified: true,
};

export const EXECUTIVE_VALUE: ExecutiveValueStats = {
  totalSharedValueThb: 14850000,
  wastePreventedValueThb: 3240000,
  emergencyDeliveriesCount: 142,
  avgDeliveryMinutes: 42.5,
};
