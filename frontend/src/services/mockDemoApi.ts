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

export async function runFullDemoSeed(): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to seed demo: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runF2NearExpirySeed(): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/f2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to seed F2: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runRoleScenarios(): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to seed scenarios: HTTP ${res.status}`);
  }
  return res.json();
}

export async function toggleNetworkSplit(split: boolean): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/networks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ split }),
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to toggle networks: HTTP ${res.status}`);
  }
  return res.json();
}

export async function cleanDemoRecords(): Promise<DemoOperationResponse> {
  const res = await fetch(`${API_BASE}/clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to clean demo records: HTTP ${res.status}`);
  }
  return res.json();
}
