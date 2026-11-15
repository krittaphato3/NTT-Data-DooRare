import { apiFetch } from './apiFetch';

/**
 * Service for interacting with backend Mock Demo Generator API (/api/v1/demo).
 */

export interface DbStats {
  hospitals: number;
  drugs: number;
  totalLots: number;
  demoLots: number;
  activeAlerts: number;
  borrowRequests: number;
  nearExpiryDetected: number;
  nearExpiryPool: number;
  allocationPlans: number;
  isNetworkSplit: boolean;
  database: { host: string; name: string; local: boolean };
  networks: { code: string; name: string; network: string }[];
}

export interface DemoOperationResponse {
  success: boolean;
  message: string;
  logs: string[];
  stats: DbStats;
  /** what a fill added (fill buttons only) */
  added?: {
    f2: { kind: string; owner: string; receivers: string[]; name: string; qty: number; days: number }[];
    f1: { code: string; sev: string; name: string }[];
    snoozed: number;
  };
}

const API_BASE = '/demo'; // apiFetch adds /api/v1 and the session token (SYSTEM_ADMIN only on the backend)

export async function getDemoStats(): Promise<DbStats> {
  const res = await apiFetch(`${API_BASE}/stats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export interface DemoPlan {
  forecastLoaded: boolean;
  nothingToAdd: boolean;
  /** how many items a fill could really add now (can be less than the sum of `missing`) */
  canAddTotal: number;
  f1: { hospital: string; severity: 'VERY_URGENT' | 'URGENT' | 'NORMAL'; have: number; hidden: number; want: number; missing: number; canAdd: number }[];
  f2: { kind: string; owner: string; note: string; have: number; want: number; missing: number; canAdd: number }[];
}

/** What a fill would add (writes nothing). */
export async function getDemoPlan(relaxed = true): Promise<DemoPlan> {
  const res = await apiFetch(`${API_BASE}/plan?relaxed=${relaxed ? 1 : 0}`);
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || errorJson.title || `Failed to read the plan: HTTP ${res.status}`);
  }
  return (await res.json()).data;
}

/** Tops the demo data up to its targets (only adds; pressing again finds nothing missing). */
export async function runFill(which: 'f1' | 'f2' | 'all', relaxed = true): Promise<DemoOperationResponse> {
  const res = await apiFetch(`${API_BASE}/fill/${which}?relaxed=${relaxed ? 1 : 0}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.title || `Failed to fill: HTTP ${res.status}`);
  return json;
}

// ---- stock form (/mock-stock): receive / use stock of one drug at one hospital ----

export interface StockHospital { code: string; name: string }
export interface StockDrug {
  id: string;
  name: string;
  local_name: string | null;
  unit: string | null;
  ved: string | null;
  price: number;
  free: number;
  u_per_day: number | null;
  target: number | null;
  alert: { severity: string; status: string } | null;
}
export interface StockAdjustResult {
  success: boolean;
  hospital: string;
  drug: string;
  requested: number;
  applied: number;
  before: { free: number; alert: string | null };
  after: { free: number; alert: string | null };
  alertsChanged: { granularity: string; opened: number; closed: number }[];
  nearExpiryDetected: number | null;
}

async function stockJson<T>(res: Response, what: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.title || `${what}: HTTP ${res.status}`);
  return json as T;
}

export async function getStockHospitals(): Promise<StockHospital[]> {
  return (await stockJson<{ data: StockHospital[] }>(await apiFetch(`${API_BASE}/stock/hospitals`), 'อ่านรายชื่อ รพ. ไม่สำเร็จ')).data;
}
export async function getStockDrugs(hospital: string, q: string): Promise<StockDrug[]> {
  const qs = new URLSearchParams({ hospital, q });
  return (await stockJson<{ data: StockDrug[] }>(await apiFetch(`${API_BASE}/stock/drugs?${qs}`), 'อ่านรายการยาไม่สำเร็จ')).data;
}
export async function adjustStock(body: { hospital: string; hospitalDrugId: string; delta: number; expiryDays?: number }): Promise<StockAdjustResult> {
  return stockJson<StockAdjustResult>(await apiFetch(`${API_BASE}/stock/adjust`, { method: 'POST', body: JSON.stringify(body) }), 'ปรับสต็อกไม่สำเร็จ');
}
