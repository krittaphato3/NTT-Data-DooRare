/**
 * Alert evaluation (spec BR-F1a-010…021, FR-F1a-008): compares the USABLE stock of each hospital listing with the latest
 * forecast and opens / updates / closes at most one active alert per hospital drug and granularity.
 *
 *   stock >= Total Target                 no action, close an open alert              (BR-F1a-013)
 *   Predict <= stock < Total Target       ORDER_AHEAD, NORMAL                         (BR-F1a-014)
 *   stock < Predict   WEEK                LOW_STOCK, severity by days of cover (F-11) (BR-F1a-015 -> agent trigger)
 *   stock < Predict   MONTH               ORDER_EARLIER, NORMAL                       (BR-F1a-015)
 *   VED D with min/max                    MIN_MAX when below min, never an agent run  (BR-F1a-010/020)
 *   nothing above but low confidence      LOW_CONFIDENCE, NORMAL
 * Blood products are skipped (BR-F1a-024). Usable stock = not expired and not held (BR-F1a-019).
 * Not done: stale-usage suppression (BR-F1a-021) — the demo data ends in the past, see `usageDataEnd` in the run result.
 */
import type pg from 'pg';

export type Granularity = 'WEEK' | 'MONTH';
export interface EvaluateResult {
  evaluated: number;
  opened: number;
  updated: number;
  closed: number;
  reopened: number;
}

type Desired = { type: string; severity: string } | null;

/** F-11 urgency from days of stock: V: <=2 very urgent, <=7 urgent; E: <=2 urgent; D normal. */
export function urgencyFor(ved: string, daysCover: number | null): string {
  if (daysCover === null) return 'NORMAL';
  if (ved === 'V') return daysCover <= 2 ? 'VERY_URGENT' : daysCover <= 7 ? 'URGENT' : 'NORMAL';
  if (ved === 'E') return daysCover <= 2 ? 'URGENT' : 'NORMAL';
  return 'NORMAL';
}

export function desiredAlert(
  granularity: Granularity,
  f: { ved: string; stock: number; p50: number | null; totalTarget: number | null; uPerDay: number | null; flag: string | null },
): { desired: Desired; daysCover: number | null } {
  const daysCover = f.uPerDay && f.uPerDay > 0 ? Math.round((f.stock / f.uPerDay) * 100) / 100 : null;
  if (f.totalTarget === null || f.p50 === null) return { desired: null, daysCover };
  if (f.stock >= f.totalTarget) {
    const lowConfidence = f.flag === 'LOW_CONFIDENCE' || (granularity === 'WEEK' && f.flag === 'COLD_START');
    return { desired: lowConfidence ? { type: 'LOW_CONFIDENCE', severity: 'NORMAL' } : null, daysCover };
  }
  if (f.stock >= f.p50) return { desired: { type: 'ORDER_AHEAD', severity: 'NORMAL' }, daysCover };
  return {
    desired: granularity === 'WEEK' ? { type: 'LOW_STOCK', severity: urgencyFor(f.ved, daysCover) } : { type: 'ORDER_EARLIER', severity: 'NORMAL' },
    daysCover,
  };
}

const ACTIVE = `('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED')`;

async function apply(
  client: pg.PoolClient,
  r: { hospitalId: string; hospitalDrugId: string; granularity: Granularity; stock: number; daysCover: number | null; forecastResultId: string | null },
  desired: Desired,
  result: EvaluateResult,
): Promise<void> {
  const existing = (
    await client.query(
      `SELECT id, status::text AS status, snoozed_until FROM stock_alert WHERE hospital_drug_id = $1 AND granularity = $2 AND status IN ${ACTIVE} FOR UPDATE`,
      [r.hospitalDrugId, r.granularity],
    )
  ).rows[0];
  if (!desired) {
    if (existing && ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'].includes(existing.status)) {
      await client.query(`UPDATE stock_alert SET status = 'AUTO_CLOSED', stock_qty = $2, days_cover = $3, updated_at = now(), version = version + 1 WHERE id = $1`, [existing.id, r.stock, r.daysCover]);
      result.closed += 1;
    }
    return;
  }
  if (!existing) {
    await client.query(
      `INSERT INTO stock_alert (hospital_id, hospital_drug_id, type, granularity, severity, status, stock_qty, days_cover, forecast_result_id)
       VALUES ($1, $2, $3::alert_type, $4::forecast_granularity, $5::alert_severity, 'OPEN', $6, $7, $8)`,
      [r.hospitalId, r.hospitalDrugId, desired.type, r.granularity, desired.severity, r.stock, r.daysCover, r.forecastResultId],
    );
    result.opened += 1;
    return;
  }
  const snoozeOver = existing.status === 'SNOOZED' && existing.snoozed_until && new Date(existing.snoozed_until) <= new Date();
  // Only touch the row when something differs, so a re-evaluation with unchanged stock does not bump `version` (If-Match of open screens).
  const changed = await client.query(
    `UPDATE stock_alert SET type = $2::alert_type, severity = $3::alert_severity, stock_qty = $4, days_cover = $5,
            forecast_result_id = COALESCE($6, forecast_result_id),
            status = CASE WHEN $7 THEN 'OPEN'::alert_status ELSE status END, snoozed_until = CASE WHEN $7 THEN NULL ELSE snoozed_until END,
            updated_at = now(), version = version + 1
      WHERE id = $1
        AND ($7 OR type IS DISTINCT FROM $2::alert_type OR severity IS DISTINCT FROM $3::alert_severity
             OR stock_qty IS DISTINCT FROM $4::numeric(14,3) OR days_cover IS DISTINCT FROM $5::numeric(8,2)
             OR forecast_result_id IS DISTINCT FROM COALESCE($6::uuid, forecast_result_id))`,
    [existing.id, desired.type, desired.severity, r.stock, r.daysCover, r.forecastResultId, Boolean(snoozeOver)],
  );
  if (snoozeOver) result.reopened += 1;
  else if (changed.rowCount) result.updated += 1;
}

/**
 * SM-8 SNOOZED -> OPEN as soon as the snooze is over. Without this the alert stays hidden until the next 6-hourly
 * re-evaluation, so a 4-hour snooze could last 10 hours. Run once a minute with the borrow timers.
 */
export async function reopenSnoozedAlerts(client: pg.PoolClient): Promise<number> {
  const reopened = await client.query(
    `UPDATE stock_alert SET status = 'OPEN', snoozed_until = NULL, updated_at = now(), version = version + 1
      WHERE status = 'SNOOZED' AND snoozed_until <= now()`,
  );
  return reopened.rowCount ?? 0;
}

/** Evaluates the forecasts of one run (one granularity) for every hospital it covers. */
export async function evaluateAlerts(client: pg.PoolClient, runId: string, granularity: Granularity): Promise<EvaluateResult> {
  const result: EvaluateResult = { evaluated: 0, opened: 0, updated: 0, closed: 0, reopened: 0 };
  const rows = (
    await client.query(
      `SELECT f.id, f.hospital_id, f.hospital_drug_id, f.ved::text AS ved, f.p50::float8 AS p50, f.total_target::float8 AS total_target,
              f.u_per_day::float8 AS u_per_day, f.confidence_flag,
              COALESCE((SELECT sum(sl.qty_on_hand - sl.qty_held) FROM stock_lot sl WHERE sl.hospital_drug_id = f.hospital_drug_id AND sl.expiry_date > current_date), 0)::float8 AS stock
         FROM forecast_result f
         JOIN hospital_drug hd ON hd.id = f.hospital_drug_id
         LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
        WHERE f.run_id = $1 AND f.granularity = $2::forecast_granularity AND COALESCE(dm.is_blood_product, false) = false AND f.ved <> 'D'`,
      [runId, granularity],
    )
  ).rows;
  for (const row of rows) {
    const { desired, daysCover } = desiredAlert(granularity, { ved: row.ved, stock: row.stock, p50: row.p50, totalTarget: row.total_target, uPerDay: row.u_per_day, flag: row.confidence_flag });
    await apply(client, { hospitalId: row.hospital_id, hospitalDrugId: row.hospital_drug_id, granularity, stock: row.stock, daysCover, forecastResultId: row.id }, desired, result);
    result.evaluated += 1;
  }
  if (granularity === 'WEEK') {
    const minMax = (
      await client.query(
        `SELECT hd.hospital_id, hd.id AS hospital_drug_id, hd.min_level::float8 AS min_level,
                COALESCE((SELECT sum(sl.qty_on_hand - sl.qty_held) FROM stock_lot sl WHERE sl.hospital_drug_id = hd.id AND sl.expiry_date > current_date), 0)::float8 AS stock
           FROM hospital_drug hd LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
          WHERE hd.active AND hd.ved = 'D' AND hd.min_level IS NOT NULL AND COALESCE(dm.is_blood_product, false) = false`,
      )
    ).rows;
    for (const row of minMax) {
      const desired: Desired = row.stock < row.min_level ? { type: 'MIN_MAX', severity: 'NORMAL' } : null;
      await apply(client, { hospitalId: row.hospital_id, hospitalDrugId: row.hospital_drug_id, granularity: 'WEEK', stock: row.stock, daysCover: null, forecastResultId: null }, desired, result);
      result.evaluated += 1;
    }
  }
  return result;
}
