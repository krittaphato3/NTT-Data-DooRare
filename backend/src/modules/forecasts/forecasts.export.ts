/**
 * Option B: Export latest usage & stock snapshot from PostgreSQL into the CSV format consumed by the F1 model.
 *
 * Streams via PostgreSQL native COPY TO STDOUT with `pg-copy-streams` (approx 0.5s for ~676k rows).
 * Writes to a temporary file first and atomically renames to avoid partial reads by concurrent workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { to as copyTo } from 'pg-copy-streams';
import { pool } from '../../db/client.js';
import { config } from '../../config/env.js';

export interface TableExportSummary {
  table: string;
  path: string;
  rows: number;
  seconds: number;
}

export interface ForecastExportResult {
  ok: boolean;
  tables: TableExportSummary[];
  error?: string;
  totalSeconds: number;
}

export async function exportForecastPackFromDb(targetDir = config.forecasts.job.packCsvDir): Promise<ForecastExportResult> {
  const started = Date.now();
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const client = await pool.connect();
  const tables: TableExportSummary[] = [];

  try {
    const exports = [
      {
        table: 'usage_daily',
        query: `COPY (SELECT hospital_id, hospital_drug_id, usage_date, qty_used FROM usage_daily ORDER BY usage_date, hospital_id, hospital_drug_id) TO STDOUT WITH CSV HEADER`,
        file: 'usage_daily.csv',
      },
      {
        table: 'stock_snapshot',
        query: `COPY (SELECT hospital_id, hospital_drug_id, snap_date, qty_on_hand, qty_incoming, qty_held FROM stock_snapshot ORDER BY snap_date, hospital_id, hospital_drug_id) TO STDOUT WITH CSV HEADER`,
        file: 'stock_snapshot.csv',
      },
    ];

    for (const exp of exports) {
      const tableStart = Date.now();
      const filePath = path.join(targetDir, exp.file);
      const tempPath = `${filePath}.tmp-${Date.now()}`;

      const copyStream = client.query(copyTo(exp.query));
      const fileStream = fs.createWriteStream(tempPath);
      await pipeline(copyStream, fileStream);

      fs.renameSync(tempPath, filePath);

      const countRes = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${exp.table}`);
      const rows = Number(countRes.rows[0]?.count ?? 0);
      const seconds = Math.round((Date.now() - tableStart) / 100) / 10;
      tables.push({ table: exp.table, path: filePath, rows, seconds });
    }

    const totalSeconds = Math.round((Date.now() - started) / 100) / 10;
    return { ok: true, tables, totalSeconds };
  } catch (err) {
    const totalSeconds = Math.round((Date.now() - started) / 100) / 10;
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, tables, error, totalSeconds };
  } finally {
    client.release();
  }
}
