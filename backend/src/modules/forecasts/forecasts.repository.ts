/**
 * Data access for the F1a forecast read API.
 *
 * Two sources, tried in this order by the service:
 * 1. Postgres (`forecast_run` / `forecast_result` through the `v_latest_forecast` view) — the durable source.
 * 2. The Python inference JSON (`models/artifacts/forecasts/<modelVersion>/forecast_<GRAN>_<origin>.json`),
 *    used when the DB is unreachable or has no forecast rows. The JSON is produced by Phase 7a and is the
 *    same contract the future writer will load into `forecast_result`.
 *
 * Reads only: no INSERT/UPDATE anywhere in this module.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/env.js';
import { query } from '../../db/client.js';
import type {
  DbBacktestRow,
  DbForecastRow,
  DbHistoryRow,
  ForecastListQuery,
} from './forecasts.types.js';

export interface JsonForecastPayload {
  modelVersion: string;
  granularity: 'WEEK' | 'MONTH';
  asOf?: string;
  originUsed: string;
  dataEnd: string;
  calibration?: { enabled: boolean; variant?: string | null; rows?: number | null };
  counts?: Record<string, unknown>;
  definitions?: Record<string, string>;
  notes?: string[];
  rows: Array<Record<string, any>>;
}

export interface JsonForecastFile {
  path: string;
  payload: JsonForecastPayload;
}

/** Cached JSON payloads, keyed by absolute path and invalidated by mtime (the CLI rewrites the files). */
const jsonCache = new Map<string, { mtimeMs: number; file: JsonForecastFile }>();

const SELECT_ROW = `
  SELECT f.id,
         f.run_id,
         f.hospital_id,
         h.code            AS hospital_code,
         COALESCE(h.name_en, h.name_th) AS hospital_name,
         f.hospital_drug_id,
         hd.local_code     AS item_code,
         hd.local_name     AS item_name,
         dm.generic_name,
         dm.base_unit,
         f.granularity,
         f.period_start,
         f.method,
         f.ved,
         f.abc,
         f.demand_pattern,
         f.p50,
         f.p90,
         f.p95,
         f.total_target,
         f.rop,
         f.min_level,
         f.max_level,
         f.u_per_day,
         f.sigma_per_day,
         f.lead_time_days,
         f.lead_time_quantile,
         f.confidence_flag,
         f.coverage_ok,
         f.computed_at,
         r.model_version
    FROM v_latest_forecast f
    JOIN hospital h        ON h.id = f.hospital_id
    JOIN hospital_drug hd  ON hd.id = f.hospital_drug_id
    LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
    LEFT JOIN forecast_run r ON r.id = f.run_id
`;

export interface ItemNames {
  hospitalName: string | null;
  itemName: string | null;
  genericName: string | null;
  baseUnit: string | null;
}

export class ForecastsRepository {
  /**
   * Display names for series that came from the JSON contract (it carries codes only).
   * Same joins as the DB read path, so both sources label a row identically.
   */
  async lookupNames(hospitalDrugIds: string[]): Promise<Map<string, ItemNames>> {
    const names = new Map<string, ItemNames>();
    if (hospitalDrugIds.length === 0) return names;
    const result = await query<{
      id: string;
      hospital_name: string | null;
      item_name: string | null;
      generic_name: string | null;
      base_unit: string | null;
    }>(
      `SELECT hd.id,
              COALESCE(h.name_en, h.name_th) AS hospital_name,
              hd.local_name                  AS item_name,
              dm.generic_name,
              dm.base_unit
         FROM hospital_drug hd
         JOIN hospital h ON h.id = hd.hospital_id
         LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
        WHERE hd.id = ANY($1::uuid[])`,
      [hospitalDrugIds],
    );
    for (const row of result.rows) {
      names.set(row.id, {
        hospitalName: row.hospital_name,
        itemName: row.item_name,
        genericName: row.generic_name,
        baseUnit: row.base_unit,
      });
    }
    return names;
  }

  /** Latest rows from the DB, ordered deterministically so the offset cursor is stable. */
  async listFromDb(params: ForecastListQuery): Promise<DbForecastRow[]> {
    const where: string[] = ['f.granularity = $1'];
    const values: unknown[] = [params.granularity];
    const add = (sql: string, value: unknown): void => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (params.hospitalId) add('f.hospital_id = ?::uuid', params.hospitalId);
    if (params.hospitalDrugId) add('f.hospital_drug_id = ?::uuid', params.hospitalDrugId);
    if (params.ved) add('f.ved = ?::ved_class', params.ved);
    if (params.abc) add('f.abc = ?::abc_class', params.abc);

    // limit + 1 rows tells the service whether a next page exists without a COUNT query
    values.push(params.limit + 1, params.offset);
    const sql = `${SELECT_ROW} WHERE ${where.join(' AND ')}
                 ORDER BY h.code, hd.local_code, f.hospital_drug_id
                 LIMIT $${values.length - 1} OFFSET $${values.length}`;
    const result = await query<DbForecastRow>(sql, values);
    return result.rows;
  }

  /** One series at its latest period, plus its stored history and weekly backtest rows. */
  async detailFromDb(
    hospitalDrugId: string,
    granularity: 'WEEK' | 'MONTH',
  ): Promise<{
    row: DbForecastRow;
    history: DbHistoryRow[];
    backtest: DbBacktestRow[];
  } | null> {
    const latest = await query<DbForecastRow>(
      `${SELECT_ROW}
        WHERE f.hospital_drug_id = $1::uuid AND f.granularity = $2
        ORDER BY f.period_start DESC NULLS LAST
        LIMIT 1`,
      [hospitalDrugId, granularity],
    );
    const row = latest.rows[0];
    if (!row) return null;

    const history = await query<DbHistoryRow>(
      `SELECT period_start, method, p50, p90, p95, total_target, confidence_flag, computed_at
         FROM forecast_result
        WHERE hospital_drug_id = $1::uuid AND granularity = $2
        ORDER BY period_start NULLS LAST
        LIMIT 104`,
      [hospitalDrugId, granularity],
    );
    // forecast_backtest has no granularity column (documented in backend/models/README.md), so it is only
    // meaningful for weekly series; monthly detail returns an empty list instead of mislabelled weeks.
    const backtest =
      granularity === 'WEEK'
        ? await query<DbBacktestRow>(
            `SELECT week_start, predicted, actual, residual
               FROM forecast_backtest
              WHERE hospital_drug_id = $1::uuid
              ORDER BY week_start
              LIMIT 104`,
            [hospitalDrugId],
          )
        : { rows: [] as DbBacktestRow[] };

    return { row, history: history.rows, backtest: backtest.rows };
  }

  /**
   * Latest inference JSON for a granularity.
   *
   * Picks by `originUsed` (newest origin), then by model version string, across every
   * `artifacts/forecasts/*` directory. Returns `null` when the directory or files are missing.
   */
  readJsonForecast(granularity: 'WEEK' | 'MONTH'): JsonForecastFile | null {
    const root = config.forecasts.dir;
    let directories: string[];
    try {
      directories = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name));
    } catch {
      return null;
    }

    const candidates: string[] = [];
    for (const directory of directories) {
      let files: string[];
      try {
        files = fs.readdirSync(directory);
      } catch {
        continue;
      }
      for (const file of files) {
        if (file.startsWith(`forecast_${granularity}_`) && file.endsWith('.json')) {
          candidates.push(path.join(directory, file));
        }
      }
    }
    if (candidates.length === 0) return null;

    const parsed = candidates
      .map((file): JsonForecastFile | null => {
        try {
          return { path: file, payload: this.parseJsonFile(file) };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is JsonForecastFile => entry !== null);

    if (parsed.length === 0) return null;
    parsed.sort((a, b) => {
      const origin = String(b.payload.originUsed).localeCompare(String(a.payload.originUsed));
      if (origin !== 0) return origin;
      return String(b.payload.modelVersion).localeCompare(String(a.payload.modelVersion));
    });
    return parsed[0];
  }

  private parseJsonFile(file: string): JsonForecastPayload {
    const stat = fs.statSync(file);
    const cached = jsonCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.file.payload;
    const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as JsonForecastPayload;
    if (!Array.isArray(payload.rows)) {
      throw new Error(`forecast JSON has no rows array: ${file}`);
    }
    jsonCache.set(file, { mtimeMs: stat.mtimeMs, file: { path: file, payload } });
    return payload;
  }
}

export const forecastsRepository = new ForecastsRepository();
