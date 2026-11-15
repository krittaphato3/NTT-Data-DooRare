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
}

const API_BASE = '/api/v1/demo';

export async function getDemoStats(): Promise<DbStats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export interface DemoPlan {
  forecastLoaded: boolean;
  nothingToAdd: boolean;
  f1: { hospital: string; severity: 'VERY_URGENT' | 'URGENT' | 'NORMAL'; have: number; want: number; missing: number }[];
  f2: { kind: string; owner: string; note: string; have: number; want: number; missing: number }[];
}

/** What a fill would add (writes nothing). */
export async function getDemoPlan(): Promise<DemoPlan> {
  const res = await fetch(`${API_BASE}/plan`);
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to read the plan: HTTP ${res.status}`);
  }
  return (await res.json()).data;
}

/** Tops the demo data up to its targets (only adds; pressing again finds nothing missing). */
export async function runFill(which: 'f1' | 'f2' | 'all'): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/fill/${which}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Failed to fill: HTTP ${res.status}`);
  return json;
}
