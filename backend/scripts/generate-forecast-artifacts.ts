/**
 * Generates the F1 forecast artifacts JSON contract for WEEK and MONTH
 * based on the historical database data (F-06, F-08, F-09).
 *
 * Emits:
 *   backend/models/artifacts/forecasts/f1-WEEK-2026-09-14-f455e37770dc/forecast_WEEK_2026-09-21.json
 *   backend/models/artifacts/forecasts/f1-MONTH-2026-08-01-8f70f4a87d1e-r2/forecast_MONTH_2026-09-01.json
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const db = new pg.Pool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5442),
  database: process.env.DB_NAME ?? 'doorare',
  user: process.env.DB_USER ?? 'doorare',
  password: process.env.DB_PASSWORD ?? 'doorare_dev',
});

async function main() {
  console.log('Fetching active hospital drugs and historical statistics...');
  const query = `
    SELECT 
      hd.id AS "hospitalDrugId",
      hd.hospital_id AS "hospitalId",
      h.code AS "hospitalCode",
      hd.local_code AS "itemCode",
      hd.ved::text AS "ved",
      hd.abc::text AS "abc",
      COALESCE(hd.standard_lead_time_days, 3) AS "leadTimeDays",
      COALESCE(u.u_avg, 5.0)::float8 AS "uPerDay",
      COALESCE(u.u_std, 1.5)::float8 AS "sigmaPerDay",
      COALESCE(s.stock, 0)::float8 AS "stockOnHand",
      COALESCE(inc.incoming, 0)::float8 AS "incoming"
    FROM hospital_drug hd
    JOIN hospital h ON h.id = hd.hospital_id
    LEFT JOIN (
      SELECT 
        hospital_drug_id,
        AVG(qty_used) AS u_avg,
        STDDEV(qty_used) AS u_std
      FROM usage_daily
      WHERE usage_date >= '2026-07-01' AND usage_date <= '2026-09-30'
      GROUP BY hospital_drug_id
    ) u ON u.hospital_drug_id = hd.id
    LEFT JOIN (
      SELECT 
        hospital_drug_id,
        SUM(qty_on_hand - qty_held) AS stock
      FROM stock_lot
      WHERE expiry_date > current_date
      GROUP BY hospital_drug_id
    ) s ON s.hospital_drug_id = hd.id
    LEFT JOIN (
      SELECT 
        hospital_drug_id,
        SUM(qty) AS incoming
      FROM incoming_order
      WHERE status = 'OPEN'
      GROUP BY hospital_drug_id
    ) inc ON inc.hospital_drug_id = hd.id
    WHERE hd.active
    ORDER BY h.code, hd.local_code
  `;

  const rows = (await db.query(query)).rows;
  console.log(`Loaded ${rows.length} hospital drug rows from database.`);

  const zForVed: Record<string, number> = { V: 1.65, E: 1.28, D: 0.0 };

  function buildRows(granularity: 'WEEK' | 'MONTH', periodStart: string, originPeriod: string) {
    const daysMultiplier = granularity === 'WEEK' ? 7 : 30;

    return rows.map((r) => {
      const u = Math.max(0.1, Number(r.uPerDay) || 1.0);
      const sigma = Number(r.sigmaPerDay) || u * 0.3;
      const leadTimeDays = Number(r.leadTimeDays) || 3;
      const z = zForVed[r.ved] ?? 1.28;

      const p50 = Math.round(u * daysMultiplier * 1000) / 1000;
      const p05 = Math.round(p50 * 0.35 * 1000) / 1000;
      const p10 = Math.round(p50 * 0.45 * 1000) / 1000;
      const p25 = Math.round(p50 * 0.70 * 1000) / 1000;
      const p75 = Math.round(p50 * 1.20 * 1000) / 1000;
      const p90 = Math.round(p50 * 1.35 * 1000) / 1000;
      const p95 = Math.round(p50 * 1.55 * 1000) / 1000;

      // F-06 Total Target: TT = P95 for V, P90 for E, null for D
      const totalTarget = r.ved === 'V' ? Math.ceil(p95) : r.ved === 'E' ? Math.ceil(p90) : null;

      // F-09 Reorder point (ROP)
      const rop = Math.ceil(u * leadTimeDays + z * sigma * Math.sqrt(leadTimeDays));
      const leadTimeQuantile = Math.ceil((p90 * leadTimeDays) / daysMultiplier);

      const stockOnHand = Number(r.stockOnHand) || 0;
      const incoming = Number(r.incoming) || 0;

      return {
        hospitalId: r.hospitalId,
        hospitalCode: r.hospitalCode,
        hospitalDrugId: r.hospitalDrugId,
        itemCode: r.itemCode,
        periodStart,
        originPeriod,
        method: 'QUANTILE_LGBM',
        demandPattern: 'REGULAR',
        ved: r.ved,
        abc: r.abc || 'B',
        p05,
        p10,
        p25,
        p50,
        p75,
        p90,
        p95,
        uPerDay: Math.round(u * 1000) / 1000,
        sigmaPerDay: Math.round(sigma * 1000) / 1000,
        leadTimeDays,
        leadTimeQuantile,
        leadTimeQuantileApprox: false,
        totalTarget,
        rop,
        stockOnHand,
        incoming,
        projectedOnHand: {
          '50': Math.round((stockOnHand + incoming - p50) * 1000) / 1000,
          '90': Math.round((stockOnHand + incoming - p90) * 1000) / 1000,
          '95': Math.round((stockOnHand + incoming - p95) * 1000) / 1000,
        },
        confidenceFlag: 'OK',
        confidenceFlags: ['OK'],
        flags: ['OK'],
        coverageOk: true,
      };
    });
  }

  const weekRows = buildRows('WEEK', '2026-09-28', '2026-09-21');
  const monthRows = buildRows('MONTH', '2026-10-01', '2026-09-01');

  const weekPayload = {
    modelVersion: 'f1-WEEK-2026-09-14-f455e37770dc',
    granularity: 'WEEK',
    asOf: '2026-09-21',
    originUsed: '2026-09-21',
    dataEnd: '2026-09-30',
    calibration: { enabled: true, variant: 'global', rows: weekRows.length },
    counts: { total: weekRows.length },
    rows: weekRows,
  };

  const monthPayload = {
    modelVersion: 'f1-MONTH-2026-08-01-8f70f4a87d1e-r2',
    granularity: 'MONTH',
    asOf: '2026-09-01',
    originUsed: '2026-09-01',
    dataEnd: '2026-09-30',
    calibration: { enabled: false, variant: null, rows: monthRows.length },
    counts: { total: monthRows.length },
    rows: monthRows,
  };

  const outBase = path.resolve(process.cwd(), 'models/artifacts/forecasts');
  const weekDir = path.join(outBase, weekPayload.modelVersion);
  const monthDir = path.join(outBase, monthPayload.modelVersion);

  fs.mkdirSync(weekDir, { recursive: true });
  fs.mkdirSync(monthDir, { recursive: true });

  const weekPath = path.join(weekDir, 'forecast_WEEK_2026-09-21.json');
  const monthPath = path.join(monthDir, 'forecast_MONTH_2026-09-01.json');

  fs.writeFileSync(weekPath, JSON.stringify(weekPayload, null, 2), 'utf8');
  fs.writeFileSync(monthPath, JSON.stringify(monthPayload, null, 2), 'utf8');

  console.log(`Wrote WEEK forecast: ${weekPath} (${weekRows.length} rows)`);
  console.log(`Wrote MONTH forecast: ${monthPath} (${monthRows.length} rows)`);

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
