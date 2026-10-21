/**
 * F1a forecast read service (API-F1a-001 list, API-F1a-002 detail).
 *
 * Source order: Postgres first (`v_latest_forecast`), then the Phase 7a JSON contract. A fresh environment has
 * no forecast rows, so the JSON fallback is a normal path — but it is always reported in `meta.source` /
 * `meta.dbError`, never silently.
 *
 * The API is deliberately decision-free: rows flagged `LOW_CONFIDENCE`, `COLD_START` or `FALLBACK_CLASSICAL`
 * are returned as-is with their flags. No stock alert, shortage or borrow decision is derived here.
 */
import { config } from '../../config/env.js';
import { HttpError } from '../../middleware/httpError.js';
import { forecastsRepository, type JsonForecastFile } from './forecasts.repository.js';
import type {
  AbcClass,
  DetailBundle,
  ForecastItem,
  ForecastListQuery,
  ForecastMeta,
  Granularity,
  VedClass,
} from './forecasts.types.js';

const GRANULARITIES: Granularity[] = ['WEEK', 'MONTH'];
const VED: VedClass[] = ['V', 'E', 'D'];
const ABC: AbcClass[] = ['A', 'B', 'C'];
const METHOD_FALLBACK = 'JSON_FALLBACK';
const CAVEAT = 'MOCK DATA - the F1 pack is synthetic; do not read these numbers as real accuracy';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECTED_LEVELS = ['50', '90', '95'];

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const dateOnly = (value: unknown): string | null => {
  const text = iso(value);
  return text ? text.slice(0, 10) : null;
};

const single = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** Decode the opaque offset cursor; anything unparseable is a 400, never a silent page restart. */
function parseCursor(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, 'INVALID_QUERY', 'cursor ต้องเป็นสตริงที่ได้จาก nextCursor');
  }
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const offset = Number(decoded);
    if (!Number.isInteger(offset) || offset < 0) throw new Error('bad offset');
    return offset;
  } catch {
    throw new HttpError(400, 'INVALID_QUERY', 'cursor ไม่ถูกต้อง');
  }
}

const encodeCursor = (offset: number): string => Buffer.from(String(offset), 'utf8').toString('base64url');

/** Parse + validate `GET /forecasts` query parameters (spec: cursor, limit; summary names hospital, drug, ved). */
export function parseListQuery(raw: Record<string, unknown>): ForecastListQuery {
  const granularity = (single(raw.granularity) ?? 'WEEK').toUpperCase() as Granularity;
  if (!GRANULARITIES.includes(granularity)) {
    throw new HttpError(400, 'INVALID_QUERY', 'granularity ต้องเป็น WEEK หรือ MONTH');
  }

  const limitRaw = single(raw.limit);
  const limit = limitRaw === undefined ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError(400, 'INVALID_QUERY', 'limit ต้องเป็นจำนวนเต็ม 1..200');
  }

  const kriteria: ForecastListQuery = {
    granularity,
    limit,
    offset: parseCursor(raw.cursor),
  };

  for (const key of ['hospitalId', 'hospitalDrugId'] as const) {
    const value = single(raw[key]);
    if (value === undefined) continue;
    if (!UUID.test(value)) throw new HttpError(400, 'INVALID_QUERY', `${key} ต้องเป็น UUID`);
    kriteria[key] = value;
  }

  const ved = single(raw.ved)?.toUpperCase();
  if (ved !== undefined) {
    if (!VED.includes(ved as VedClass)) throw new HttpError(400, 'INVALID_QUERY', 'ved ต้องเป็น V, E หรือ D');
    kriteria.ved = ved as VedClass;
  }

  const abc = single(raw.abc)?.toUpperCase();
  if (abc !== undefined) {
    if (!ABC.includes(abc as AbcClass)) throw new HttpError(400, 'INVALID_QUERY', 'abc ต้องเป็น A, B หรือ C');
    kriteria.abc = abc as AbcClass;
  }

  return kriteria;
}

function staleFlag(dataEnd: string | null): boolean | null {
  if (!dataEnd) return null;
  const end = new Date(`${dataEnd}T00:00:00Z`).getTime();
  if (!Number.isFinite(end)) return false;
  return (Date.now() - end) / 86_400_000 > config.forecasts.staleAfterDays;
}

/** Never echo raw driver text (host/port) to clients in production; keep it in development. */
function dbErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return config.nodeEnv === 'production' ? 'DATABASE_UNAVAILABLE' : message;
}

function metaFor(
  source: 'DB' | 'JSON_FALLBACK',
  granularity: Granularity,
  extra: Partial<ForecastMeta>,
): ForecastMeta {
  return {
    source,
    granularity,
    modelVersion: null,
    originUsed: null,
    dataEnd: null,
    calibration: { enabled: null, variant: null },
    stale: null,
    staleAfterDays: config.forecasts.staleAfterDays,
    mockData: true,
    caveat: CAVEAT,
    ...extra,
  };
}

/** Fields the API intentionally returns as null because no column / no value exists (never invented). */
const SHARED_UNAVAILABLE = ['minLevel', 'maxLevel', 'borrowQty'];

export class ForecastsService {
  constructor(private repo = forecastsRepository) {}

  async list(rawQuery: Record<string, unknown>, sessionHospitalId: string | null) {
    const params = parseListQuery(rawQuery);
    // SEC-002: a user bound to one hospital never sees another hospital's rows, whatever the query says.
    if (sessionHospitalId) params.hospitalId = sessionHospitalId;

    let items: ForecastItem[] = [];
    let meta: ForecastMeta | null = null;

    try {
      const rows = await this.repo.listFromDb(params);
      if (rows.length > 0) {
        const mapped = rows.slice(0, params.limit).map((row) => this.mapDbRow(row));
        items = mapped;
        meta = metaFor('DB', params.granularity, {
          modelVersion: rows[0].model_version,
          note: 'source: forecast_result via v_latest_forecast',
          fieldsUnavailable: [
            ...SHARED_UNAVAILABLE,
            'p05',
            'p10',
            'p25',
            'p75',
            'projectedOnHand',
            'stockOnHand',
            'incoming',
            'originUsed',
            'dataEnd',
            'calibration',
          ],
        });
        const hasMore = rows.length > params.limit;
        return this.page(items, params, meta, hasMore);
      }
    } catch (error) {
      meta = metaFor('JSON_FALLBACK', params.granularity, {
        dbError: dbErrorText(error),
      });
    }

    const file = this.repo.readJsonForecast(params.granularity);
    if (!file) {
      throw new HttpError(
        404,
        'NOT_FOUND',
        'ไม่พบผลพยากรณ์ (ไม่มีข้อมูลในฐานข้อมูลและไม่พบไฟล์ JSON)',
        { forecastsDir: config.forecasts.dir },
      );
    }

    const rows = file.payload.rows
      .filter((row) => this.matches(row, params))
      .sort((a, b) =>
        String(a.hospitalCode).localeCompare(String(b.hospitalCode)) ||
        String(a.itemCode).localeCompare(String(b.itemCode)),
      );
    const slice = rows.slice(params.offset, params.offset + params.limit);
    items = slice.map((row) => this.mapJsonRow(row, file));
    const named = await this.enrichNames(items);
    meta = metaFor('JSON_FALLBACK', params.granularity, {
      modelVersion: file.payload.modelVersion,
      originUsed: file.payload.originUsed,
      dataEnd: file.payload.dataEnd,
      calibration: {
        enabled: file.payload.calibration?.enabled ?? false,
        variant: file.payload.calibration?.variant ?? null,
        rows: file.payload.calibration?.rows ?? null,
      },
      stale: staleFlag(file.payload.dataEnd),
      mockData: true,
      caveat: CAVEAT,
      note: `source: ${file.path} (JSON fallback; DB empty or unreachable)`,
      fieldsUnavailable: [
        ...SHARED_UNAVAILABLE,
        ...(named ? [] : ['hospitalName', 'itemName', 'genericName', 'baseUnit']),
        'computedAt',
        'history',
        'backtest',
      ],
      ...(meta?.dbError ? { dbError: meta.dbError } : {}),
    });
    return this.page(items, params, meta, rows.length > params.offset + params.limit);
  }

  async detail(hospitalDrugId: string, rawQuery: Record<string, unknown>, sessionHospitalId: string | null) {
    if (!UUID.test(hospitalDrugId)) {
      throw new HttpError(400, 'INVALID_QUERY', 'hospitalDrugId ต้องเป็น UUID');
    }
    const granularity = (single(rawQuery.granularity) ?? 'WEEK').toUpperCase() as Granularity;
    if (!GRANULARITIES.includes(granularity)) {
      throw new HttpError(400, 'INVALID_QUERY', 'granularity ต้องเป็น WEEK หรือ MONTH');
    }

    let meta: ForecastMeta | null = null;
    try {
      const bundle = await this.repo.detailFromDb(hospitalDrugId, granularity);
      if (bundle) {
        const item = this.mapDbRow(bundle.row);
        this.assertHospitalScoped(item, sessionHospitalId);
        const result: DetailBundle = {
          item,
          history: bundle.history.map((row) => ({
            periodStart: dateOnly(row.period_start),
            method: row.method,
            p50: num(row.p50),
            p90: num(row.p90),
            p95: num(row.p95),
            totalTarget: num(row.total_target),
            confidenceFlag: row.confidence_flag,
            computedAt: iso(row.computed_at),
          })),
          backtest: bundle.backtest.map((row) => ({
            weekStart: dateOnly(row.week_start),
            predicted: num(row.predicted),
            actual: num(row.actual),
            residual: num(row.residual),
          })),
        };
        meta = metaFor('DB', granularity, {
          modelVersion: bundle.row.model_version,
          note: 'source: forecast_result via v_latest_forecast',
          fieldsUnavailable: [
            ...SHARED_UNAVAILABLE,
            'p05',
            'p10',
            'p25',
            'p75',
            'projectedOnHand',
            'stockOnHand',
            'incoming',
            'originUsed',
            'dataEnd',
            'calibration',
          ],
        });
        return this.detailPayload(result, meta);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      meta = metaFor('JSON_FALLBACK', granularity, {
        dbError: dbErrorText(error),
      });
    }

    const file = this.repo.readJsonForecast(granularity);
    if (!file) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผลพยากรณ์สำหรับรายการนี้', { hospitalDrugId });
    }
    const row = file.payload.rows.find((entry) => entry.hospitalDrugId === hospitalDrugId);
    if (!row) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผลพยากรณ์สำหรับรายการนี้', { hospitalDrugId });
    }
    const item = this.mapJsonRow(row, file);
    this.assertHospitalScoped(item, sessionHospitalId);
    const named = await this.enrichNames([item]);
    meta = metaFor('JSON_FALLBACK', granularity, {
      modelVersion: file.payload.modelVersion,
      originUsed: file.payload.originUsed,
      dataEnd: file.payload.dataEnd,
      calibration: {
        enabled: file.payload.calibration?.enabled ?? false,
        variant: file.payload.calibration?.variant ?? null,
        rows: file.payload.calibration?.rows ?? null,
      },
      stale: staleFlag(file.payload.dataEnd),
      note: `source: ${file.path} (JSON fallback; DB empty or unreachable)`,
      fieldsUnavailable: [
        ...SHARED_UNAVAILABLE,
        ...(named ? [] : ['hospitalName', 'itemName', 'genericName', 'baseUnit']),
        'computedAt',
      ],
      ...(meta?.dbError ? { dbError: meta.dbError } : {}),
    });
    return this.detailPayload(
      { item, history: [], backtest: [] },
      meta,
      'the JSON contract stores the current period only; history/backtest need the DB writer',
    );
  }

  // --------------------------------------------------------------------------------------------- mapping

  private page(items: ForecastItem[], params: ForecastListQuery, meta: ForecastMeta, hasMore: boolean) {
    return {
      items,
      nextCursor: hasMore ? encodeCursor(params.offset + params.limit) : null,
      meta,
    };
  }

  private detailPayload(bundle: DetailBundle, meta: ForecastMeta, note?: string) {
    return {
      id: bundle.item.id,
      // forecast_result has no version column; null says "unknown", 0 would look like a real revision.
      version: null,
      data: {
        ...bundle.item,
        history: bundle.history,
        backtest: bundle.backtest,
      },
      meta: note ? { ...meta, note: `${meta.note ?? ''}${meta.note ? '; ' : ''}${note}` } : meta,
    };
  }

  private assertHospitalScoped(item: ForecastItem, sessionHospitalId: string | null): void {
    if (sessionHospitalId && item.hospitalId && item.hospitalId !== sessionHospitalId) {
      // 404 (not 403): do not confirm that another hospital holds this series (SEC-002).
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผลพยากรณ์สำหรับรายการนี้');
    }
  }

  private matches(row: Record<string, any>, params: ForecastListQuery): boolean {
    if (params.hospitalId && row.hospitalId !== params.hospitalId) return false;
    if (params.hospitalDrugId && row.hospitalDrugId !== params.hospitalDrugId) return false;
    if (params.ved && row.ved !== params.ved) return false;
    if (params.abc && row.abc !== params.abc) return false;
    return true;
  }

  private mapDbRow(row: any): ForecastItem {
    return {
      id: String(row.id),
      granularity: row.granularity,
      periodStart: dateOnly(row.period_start),
      originUsed: null,
      hospitalId: row.hospital_id,
      hospitalCode: row.hospital_code,
      hospitalName: row.hospital_name,
      hospitalDrugId: row.hospital_drug_id,
      itemCode: row.item_code,
      itemName: row.item_name,
      genericName: row.generic_name,
      baseUnit: row.base_unit,
      method: row.method,
      demandPattern: row.demand_pattern,
      ved: row.ved,
      abc: row.abc,
      p05: null,
      p10: null,
      p25: null,
      p50: num(row.p50),
      p75: null,
      p90: num(row.p90),
      p95: num(row.p95),
      totalTarget: num(row.total_target),
      rop: num(row.rop),
      uPerDay: num(row.u_per_day),
      sigmaPerDay: num(row.sigma_per_day),
      leadTimeDays: num(row.lead_time_days),
      leadTimeQuantile: num(row.lead_time_quantile),
      leadTimeQuantileApprox: false,
      stockOnHand: null,
      incoming: null,
      projectedOnHand: {},
      minLevel: num(row.min_level),
      maxLevel: num(row.max_level),
      borrowQty: null,
      confidenceFlag: row.confidence_flag,
      confidenceFlags: row.confidence_flag ? [row.confidence_flag] : [],
      flags: row.confidence_flag ? [row.confidence_flag] : [],
      coverageOk: row.coverage_ok,
      modelVersion: row.model_version,
      // Calibration is not stored in forecast_result, so the DB path reports "unknown", not "off".
      calibration: { enabled: null, variant: null },
      computedAt: iso(row.computed_at),
    };
  }

  /**
   * The JSON contract has codes but no names. Fill them from the DB when it is reachable; if the lookup
   * fails the items keep `null` names and the caller keeps them in `fieldsUnavailable`.
   */
  private async enrichNames(items: ForecastItem[]): Promise<boolean> {
    try {
      const names = await this.repo.lookupNames([...new Set(items.map((item) => item.hospitalDrugId))]);
      for (const item of items) {
        const found = names.get(item.hospitalDrugId);
        if (!found) continue;
        item.hospitalName = found.hospitalName;
        item.itemName = found.itemName;
        item.genericName = found.genericName;
        item.baseUnit = found.baseUnit;
      }
      return true;
    } catch {
      return false;
    }
  }

  private mapJsonRow(row: Record<string, any>, file: JsonForecastFile): ForecastItem {
    const projected: Record<string, number | null> = {};
    for (const level of PROJECTED_LEVELS) {
      projected[`p${level}`] = num(row[`projectedOnHand_p${level}`]);
    }
    return {
      id: `${METHOD_FALLBACK}:${file.payload.modelVersion}:${file.payload.granularity}:${row.hospitalDrugId}:${row.periodStart}`,
      granularity: file.payload.granularity,
      periodStart: row.periodStart ?? null,
      originUsed: row.originPeriod ?? file.payload.originUsed,
      hospitalId: row.hospitalId ?? null,
      hospitalCode: row.hospitalCode ?? null,
      hospitalName: null,
      hospitalDrugId: row.hospitalDrugId,
      itemCode: row.itemCode ?? null,
      itemName: null,
      genericName: null,
      baseUnit: null,
      method: row.method,
      demandPattern: row.demandPattern,
      ved: row.ved,
      abc: row.abc ?? null,
      p05: num(row.p05),
      p10: num(row.p10),
      p25: num(row.p25),
      p50: num(row.p50),
      p75: num(row.p75),
      p90: num(row.p90),
      p95: num(row.p95),
      totalTarget: num(row.totalTarget),
      rop: num(row.rop),
      uPerDay: num(row.uPerDay),
      sigmaPerDay: num(row.sigmaPerDay),
      leadTimeDays: num(row.leadTimeDays),
      leadTimeQuantile: num(row.leadTimeQuantile),
      leadTimeQuantileApprox: Boolean(row.leadTimeQuantileApprox),
      stockOnHand: num(row.stockOnHand),
      incoming: num(row.incoming),
      projectedOnHand: projected,
      minLevel: null,
      maxLevel: null,
      borrowQty: null,
      confidenceFlag: row.confidenceFlag ?? null,
      confidenceFlags: Array.isArray(row.confidenceFlags) ? row.confidenceFlags : [],
      flags: Array.isArray(row.flags) ? row.flags : [],
      coverageOk: typeof row.coverageOk === 'boolean' ? row.coverageOk : null,
      modelVersion: file.payload.modelVersion,
      calibration: {
        enabled: Boolean(file.payload.calibration?.enabled),
        variant: file.payload.calibration?.variant ?? null,
      },
      computedAt: null,
    };
  }
}

export const forecastsService = new ForecastsService();
