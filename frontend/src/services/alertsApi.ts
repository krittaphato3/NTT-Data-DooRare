import { apiJson } from './apiFetch';

export type ApiAlertType = 'LOW_STOCK' | 'OVERSTOCK' | 'DATA_STALE' | 'LOW_CONFIDENCE' | 'ORDER_AHEAD' | 'ORDER_EARLIER' | 'MIN_MAX';
export type ApiAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'LINKED_TO_REQUEST' | 'SNOOZED' | 'RESOLVED' | 'AUTO_CLOSED';

/** `GET /alerts` item (backend/src/modules/alerts/alerts.service.ts). */
export interface ApiAlert {
  id: string;
  type: ApiAlertType;
  granularity: 'WEEK' | 'MONTH';
  severity: 'NORMAL' | 'URGENT' | 'VERY_URGENT';
  status: ApiAlertStatus;
  version: number;
  hospitalDrug: { id: string; localCode: string; localName: string; localUnit: string; ved: 'V' | 'E' | 'D'; abc: string | null };
  drugName: string | null;
  baseUnit: string | null;
  coldChain: boolean;
  stockQty: number | null;
  incomingQty: number | null;
  daysCover: number | null;
  suggestedBorrowQty: number | null;
  forecast: { method: string; p50: number | null; p90: number | null; p95: number | null; totalTarget: number | null; rop: number | null; uPerDay: number | null; leadTimeDays: number | null; confidenceFlag: string | null } | null;
  request: { id: string; requestNo: string; status: string } | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAlertList {
  ok: true;
  items: ApiAlert[];
  nextCursor: string | null;
  meta: { active: number; byStatus: Record<string, number>; bySeverity: Record<string, number> };
}

export const getAlerts = (limit = 200) => apiJson<ApiAlertList>(`/alerts?limit=${limit}`);

export const ackAlert = (id: string, version?: number) =>
  apiJson<{ ok: true; id: string; version: number; data: ApiAlert }>(`/alerts/${id}/ack`, { method: 'POST', body: JSON.stringify(version === undefined ? {} : { version }) });

export const snoozeAlert = (id: string, reason: string, hours: number, version?: number) =>
  apiJson<{ ok: true; id: string; version: number; data: ApiAlert }>(`/alerts/${id}/snooze`, { method: 'POST', body: JSON.stringify({ reason, hours, ...(version === undefined ? {} : { version }) }) });

export interface ApiInventorySummary {
  hospitalDrugId: string;
  onHand: number;
  held: number;
  free: number;
  usable: number;
  lots: number;
  nearestExpiry: string | null;
}

export const getInventorySummary = (limit = 200) => apiJson<{ ok: true; items: ApiInventorySummary[]; nextCursor: string | null }>(`/inventory?view=summary&limit=${limit}`);

/** API-F1a-004: VED / expiry threshold of one of the hospital's drug listings. */
export const classifyHospitalDrug = (id: string, body: { ved?: 'V' | 'E' | 'D'; expiryThresholdDays?: number | null; reason?: string }) =>
  apiJson<{ ok: true; id: string }>(`/hospital-drugs/${id}/classification`, { method: 'PATCH', body: JSON.stringify(body) });

/** API-F1a-003 (system admin): load the latest forecasts and re-evaluate alerts. */
export const runForecasts = (granularity: 'WEEK' | 'MONTH' | 'BOTH' = 'BOTH') =>
  apiJson<{ ok: true; jobId: string; status: string }>(`/forecasts/runs`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ granularity }) });
