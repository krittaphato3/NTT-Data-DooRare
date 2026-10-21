import { apiJson } from './apiFetch';

export type ApiItemType = 'DRUG' | 'SUPPLY' | 'BLOOD';

export interface ApiDrugMaster {
  id: string;
  type: ApiItemType;
  gpId: string | null;
  internalCode: string | null;
  genericName: string;
  strength: string | null;
  dosageForm: string | null;
  baseUnit: string;
  coldChain: boolean;
  blood: boolean;
  highAlert: boolean;
  controlled: boolean;
  emergencyClass: 'CRITICAL' | 'SUPPORTIVE';
}

export interface ApiHospitalDrug {
  id: string;
  localCode: string;
  localName: string;
  localUnit: string;
  price: number | null;
  ved: 'V' | 'E' | 'D';
  abc: string | null;
  tmtId: string | null;
  gpId: string | null;
  active: boolean;
  expiryThresholdDays: number | null;
  minLevel: number | null;
  maxLevel: number | null;
  leadTimeDays: number | null;
  master: ApiDrugMaster | null;
  mapping: {
    status: 'UNMATCHED' | 'SUGGESTED' | 'VERIFIED' | 'REJECTED' | 'DEPRECATED';
    method: 'TMT' | 'CENTRAL_LIST';
    confidence: number | null;
    factor: number;
    packUnit: string | null;
    basePerPack: number | null;
    manufacturer: string | null;
    suggestedBy: string;
    verifiedAt: string | null;
  } | null;
}

/** `GET /hospital-drugs`: the signed-in hospital's drug list with its central master and mapping status. */
export function getHospitalDrugs(params: { q?: string; limit?: number } = {}) {
  const q = new URLSearchParams({ limit: String(params.limit ?? 200) });
  if (params.q) q.set('q', params.q);
  return apiJson<{ ok: true; items: ApiHospitalDrug[]; nextCursor: string | null }>(`/hospital-drugs?${q}`);
}

export interface ApiHospital {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  region: { id: string; code: string };
  network: { id: string; name: string } | null;
  province: string | null;
  tier: 'TERTIARY' | 'SECONDARY' | 'COMMUNITY' | 'PRIMARY' | null;
  bedCount: number | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  isUrban: boolean;
  hasColdChain: boolean;
  hasBloodBank: boolean;
  agentParticipation: boolean;
  active: boolean;
  version: number;
  updatedAt: string;
}

export function getHospitals(params: { active?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams({ limit: String(params.limit ?? 200) });
  if (params.active !== undefined) q.set('active', String(params.active));
  return apiJson<{ ok: true; items: ApiHospital[]; nextCursor: string | null }>(`/hospitals?${q}`);
}

export interface ApiDashboard {
  ok: true;
  generatedAt: string;
  scope: { hospitalId: string | null; code: string; name: string };
  role: string;
  tiles: {
    stockAlerts: { active: number; urgent: number };
    borrowRequests: { pendingApproval: number; inProgress: number; escalated: number };
    lenderQueue: { waiting: number };
    nearExpiry: { detected: number; inPool: number };
    incidents: { open: number };
    transport: { waitingDispatch: number; outInFlight: number; inOnTheWay: number; toReceive: number };
    returns: { open: number; overdue: number };
    inventory: { lotsInStock: number; expiringWithin90Days: number };
    driver?: { assignedTasks: number };
  };
}

export const getDashboard = () => apiJson<ApiDashboard>('/dashboard');
