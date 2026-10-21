import { apiJson } from './apiFetch';

export type ForecastGranularity = 'WEEK' | 'MONTH';

/** Subset of the `GET /forecasts` item (backend/src/modules/forecasts/forecasts.types.ts) the UI reads. */
export interface ForecastItem {
  id: string;
  granularity: ForecastGranularity;
  hospitalId: string | null;
  hospitalCode: string | null;
  hospitalName: string | null;
  hospitalDrugId: string;
  itemCode: string | null;
  itemName: string | null;
  genericName: string | null;
  baseUnit: string | null;
  method: string | null;
  ved: 'V' | 'E' | 'D' | null;
  abc: string | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  totalTarget: number | null;
  rop: number | null;
  uPerDay: number | null;
  stockOnHand: number | null;
  confidenceFlag: string | null;
  flags: string[];
}

export interface ForecastMeta {
  source: 'DB' | 'JSON_FALLBACK';
  modelVersion: string | null;
  originUsed: string | null;
  dataEnd: string | null;
  stale: boolean | null;
  mockData?: boolean;
}

export interface ForecastList {
  items: ForecastItem[];
  nextCursor: string | null;
  meta: ForecastMeta;
}

/** API-F1a-001. Scoped server-side to the signed-in user's hospital (SEC-002). */
export function getForecasts(granularity: ForecastGranularity = 'WEEK', limit = 200): Promise<ForecastList> {
  return apiJson<ForecastList>(`/forecasts?granularity=${granularity}&limit=${limit}`);
}
