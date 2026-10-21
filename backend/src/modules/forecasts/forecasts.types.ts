/** Types for the F1a read API (API-F1a-001 list, API-F1a-002 detail). */

export type Granularity = 'WEEK' | 'MONTH';
export type VedClass = 'V' | 'E' | 'D';
export type AbcClass = 'A' | 'B' | 'C';
export type ForecastMethod = 'QUANTILE_LGBM' | 'MA_ES' | 'COLD_START';
export type DemandPattern = 'REGULAR' | 'INTERMITTENT' | 'NO_USAGE';

/** One forecast row as the API returns it (DB row or JSON-contract row, same shape). */
export interface ForecastItem {
  id: string;
  granularity: Granularity;
  periodStart: string | null;
  originUsed: string | null;
  hospitalId: string | null;
  hospitalCode: string | null;
  hospitalName: string | null;
  hospitalDrugId: string;
  itemCode: string | null;
  itemName: string | null;
  genericName: string | null;
  baseUnit: string | null;
  method: ForecastMethod | string;
  demandPattern: DemandPattern | string;
  ved: VedClass;
  abc: AbcClass | null;
  p05: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  totalTarget: number | null;
  rop: number | null;
  uPerDay: number | null;
  sigmaPerDay: number | null;
  leadTimeDays: number | null;
  leadTimeQuantile: number | null;
  leadTimeQuantileApprox: boolean;
  stockOnHand: number | null;
  incoming: number | null;
  projectedOnHand: Record<string, number | null>;
  minLevel: number | null;
  maxLevel: number | null;
  borrowQty: number | null;
  confidenceFlag: string | null;
  confidenceFlags: string[];
  flags: string[];
  coverageOk: boolean | null;
  modelVersion: string | null;
  /** `enabled: null` = unknown (the DB has no calibration column); JSON rows always know. */
  calibration: { enabled: boolean | null; variant: string | null };
  computedAt: string | null;
}

/** `meta` block shared by list and detail: provenance the UI must show (source, model, caveat). */
export interface ForecastMeta {
  source: 'DB' | 'JSON_FALLBACK';
  granularity: Granularity;
  modelVersion: string | null;
  originUsed: string | null;
  dataEnd: string | null;
  calibration: { enabled: boolean | null; variant: string | null; rows?: number | null };
  /** `null` = unknown (the DB path exposes no data end); never reported as fresh without evidence. */
  stale: boolean | null;
  staleAfterDays: number;
  mockData: true;
  caveat: string;
  note?: string;
  dbError?: string;
  fieldsUnavailable?: string[];
}

export interface ForecastListQuery {
  granularity: Granularity;
  hospitalId?: string;
  hospitalDrugId?: string;
  ved?: VedClass;
  abc?: AbcClass;
  limit: number;
  offset: number;
}

export interface DbForecastRow {
  id: string;
  run_id: string;
  hospital_id: string;
  hospital_code: string | null;
  hospital_name: string | null;
  hospital_drug_id: string;
  item_code: string | null;
  item_name: string | null;
  generic_name: string | null;
  base_unit: string | null;
  granularity: Granularity;
  period_start: string | Date | null;
  method: string;
  ved: VedClass;
  abc: AbcClass | null;
  demand_pattern: string;
  p50: string | number | null;
  p90: string | number | null;
  p95: string | number | null;
  total_target: string | number | null;
  rop: string | number | null;
  min_level: string | number | null;
  max_level: string | number | null;
  u_per_day: string | number | null;
  sigma_per_day: string | number | null;
  lead_time_days: string | number | null;
  lead_time_quantile: string | number | null;
  confidence_flag: string | null;
  coverage_ok: boolean | null;
  computed_at: string | Date | null;
  model_version: string | null;
}

export interface DbHistoryRow {
  period_start: string | Date | null;
  method: string;
  p50: string | number | null;
  p90: string | number | null;
  p95: string | number | null;
  total_target: string | number | null;
  confidence_flag: string | null;
  computed_at: string | Date | null;
}

export interface DbBacktestRow {
  week_start: string | Date | null;
  predicted: string | number | null;
  actual: string | number | null;
  residual: string | number | null;
}

export interface DetailBundle {
  item: ForecastItem;
  history: Array<Record<string, unknown>>;
  backtest: Array<Record<string, unknown>>;
}
