/**
 * Reads everything the F1b formulas need from the database: the borrower's need (F-08..F-11) and the candidate lenders
 * with their Si inputs (F-12..F-18). No decision is made here; `borrow.ladder.ts` applies the formulas.
 */
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import { dailyUsage, leadTimeDays, requiredQty, urgencyFor, windowMaxDays, borrowQty } from '../../core/formulas/borrow.js';
import type { DemandPattern, Urgency, Ved } from '../../core/formulas/borrow.js';
import type { BorrowConfig } from './borrow.config.js';

export interface DrugFacts {
  drugMasterId: string;
  name: string;
  baseUnit: string;
  coldChain: boolean;
  controlled: boolean;
  blood: boolean;
}

export interface Need {
  hospitalDrugId: string | null;
  ved: Ved;
  abc: string | null;
  drug: DrugFacts;
  stock: number;
  incoming: number;
  leadDays: number;
  u: number;
  sigma: number;
  pattern: DemandPattern;
  quantileOverLead: number | null;
  required: number | null;
  borrow: number;
  windowDays: number;
  urgency: Urgency;
  forecastBasis: { granularity: 'WEEK' | 'MONTH'; p50Week: number | null; p50Month: number | null; confidenceFlag: string | null; computedAt: string | null } | null;
  /** Reasons the numbers are approximate (no forecast, missing sigma, …). Shown to the pharmacist. */
  flags: string[];
}

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;

export async function loadDrugFacts(db: Db, drugMasterId: string): Promise<DrugFacts> {
  const r = (
    await db.query(
      `SELECT dm.id, ${DRUG_NAME} AS name, dm.base_unit, dm.is_cold_chain, dm.is_controlled, dm.is_blood_product FROM drug_master dm WHERE dm.id = $1`,
      [drugMasterId],
    )
  ).rows[0];
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการยา');
  return { drugMasterId: r.id, name: r.name, baseUnit: r.base_unit, coldChain: r.is_cold_chain, controlled: r.is_controlled, blood: r.is_blood_product };
}

/** The listing a hospital uses for a central drug (VERIFIED mapping preferred). */
export async function findListing(db: Db, hospitalId: string, drugMasterId: string): Promise<{ id: string; ved: Ved; abc: string | null; standardLeadDays: number | null; mapped: boolean } | null> {
  const r = (
    await db.query(
      `SELECT hd.id, hd.ved::text AS ved, hd.abc::text AS abc, hd.standard_lead_time_days AS lead, (m.status = 'VERIFIED') AS mapped
         FROM hospital_drug hd LEFT JOIN drug_mapping m ON m.hospital_drug_id = hd.id
        WHERE hd.hospital_id = $1 AND hd.drug_master_id = $2 AND hd.active
        ORDER BY (m.status = 'VERIFIED') DESC NULLS LAST, hd.local_code LIMIT 1`,
      [hospitalId, drugMasterId],
    )
  ).rows[0];
  return r ? { id: r.id, ved: r.ved, abc: r.abc, standardLeadDays: r.lead, mapped: Boolean(r.mapped) } : null;
}

/** Usable stock of a listing (not expired, not held; BR-F1a-019). `minRemainingDays` > 0 gives the lendable-lot sum (BR-F1b-013). */
export async function usableStock(db: Db, hospitalDrugId: string, minRemainingDays = 0): Promise<number> {
  const r = await db.query(
    `SELECT COALESCE(sum(qty_on_hand - qty_held), 0)::float8 AS s FROM stock_lot WHERE hospital_drug_id = $1 AND expiry_date > current_date + $2::int`,
    [hospitalDrugId, minRemainingDays],
  );
  return Number(r.rows[0].s);
}

export async function latestForecast(db: Db, hospitalDrugId: string, granularity: 'WEEK' | 'MONTH') {
  const r = (
    await db.query(
      `SELECT u_per_day::float8 AS u, sigma_per_day::float8 AS sigma, p50::float8 AS p50, total_target::float8 AS total_target,
              lead_time_quantile::float8 AS ltq, lead_time_days::float8 AS lead, demand_pattern, confidence_flag, computed_at
         FROM v_latest_forecast WHERE hospital_drug_id = $1 AND granularity = $2::forecast_granularity ORDER BY period_start DESC NULLS LAST LIMIT 1`,
      [hospitalDrugId, granularity],
    )
  ).rows[0];
  return r as { u: number; sigma: number | null; p50: number | null; total_target: number | null; ltq: number | null; lead: number; demand_pattern: DemandPattern; confidence_flag: string | null; computed_at: Date } | undefined;
}

/** Open purchase orders of the listing: quantity still expected and the earliest not-overdue eta (F-08). */
/** Open purchase orders still expected (an order past its expected date is overdue and is not counted as stock on the way). */
export async function incomingOrders(db: Db, hospitalDrugId: string): Promise<{ qty: number; eta: Date | null }> {
  const r = (
    await db.query(
      `SELECT COALESCE(sum(qty), 0)::float8 AS qty, min(expected_date) FILTER (WHERE expected_date >= current_date) AS eta
         FROM incoming_order WHERE hospital_drug_id = $1 AND status = 'OPEN' AND expected_date >= current_date`,
      [hospitalDrugId],
    )
  ).rows[0];
  return { qty: Number(r.qty), eta: r.eta ? new Date(r.eta) : null };
}

/**
 * The borrower's need for one drug. With a forecast the quantity is R from F-09; without one (manual request) `required` is null
 * and the caller supplies the quantity. `manualQty` overrides the computed borrow quantity (the pharmacist's choice).
 */
export async function loadNeed(db: Db, cfg: BorrowConfig, hospitalId: string, drugMasterId: string, manualQty?: number, today = new Date()): Promise<Need> {
  const drug = await loadDrugFacts(db, drugMasterId);
  if (drug.blood) throw new HttpError(422, 'VALIDATION', 'เลือดและส่วนประกอบเลือดยืมได้เฉพาะในเหตุฉุกเฉิน (F3)');
  if (drug.controlled) throw new HttpError(422, 'VALIDATION', 'ยาควบคุมพิเศษไม่เข้ากระบวนการอัตโนมัติ ต้องใช้ขั้นตอนมือ (BR-F1b-014)');
  const listing = await findListing(db, hospitalId, drugMasterId);
  if (!listing) throw new HttpError(422, 'VALIDATION', 'โรงพยาบาลนี้ยังไม่มียานี้ในบัญชียา');
  if (!listing.mapped) throw new HttpError(422, 'MAPPING_NOT_VERIFIED', 'รายการยายังไม่ได้รับการยืนยันการจับคู่รหัส');
  if (listing.ved === 'D') throw new HttpError(422, 'VALIDATION', 'ยา VED = D ไม่เข้ากระบวนการยืม (BR-F1b-001)');

  const flags: string[] = [];
  const stock = await usableStock(db, listing.id);
  const inc = await incomingOrders(db, listing.id);
  const [week, month] = await Promise.all([latestForecast(db, listing.id, 'WEEK'), latestForecast(db, listing.id, 'MONTH')]);
  const leadDays = leadTimeDays(inc.eta, today, listing.standardLeadDays ?? week?.lead ?? month?.lead ?? 3);
  const u = dailyUsage(week?.p50 ?? null, month?.p50 ?? null, leadDays);
  if (u === null) flags.push('NO_FORECAST');
  const base = leadDays <= 7 ? week : month;
  const pattern = (base?.demand_pattern ?? 'REGULAR') as DemandPattern;
  let sigma = base?.sigma ?? week?.sigma ?? month?.sigma ?? null;
  if (sigma === null) {
    sigma = 0;
    flags.push('SIGMA_UNAVAILABLE');
  }
  const z = cfg.z[listing.ved];
  const required =
    u === null ? null : requiredQty({ pattern, u, leadDays, sigma, z, quantileOverLead: base?.ltq ?? null });
  if (pattern === 'INTERMITTENT' && base?.ltq == null) flags.push('QUANTILE_UNAVAILABLE_USED_CLASSICAL');
  const computedBorrow = required === null ? 0 : borrowQty(required, stock, inc.qty);
  const borrow = manualQty ?? computedBorrow;
  const windowDays = windowMaxDays(stock, u ?? 0);
  return {
    hospitalDrugId: listing.id,
    ved: listing.ved,
    abc: listing.abc,
    drug,
    stock,
    incoming: inc.qty,
    leadDays,
    u: u ?? 0,
    sigma,
    pattern,
    quantileOverLead: base?.ltq ?? null,
    required,
    borrow,
    windowDays,
    urgency: urgencyFor(listing.ved, windowDays, cfg.urgency),
    forecastBasis: base ? { granularity: leadDays <= 7 ? 'WEEK' : 'MONTH', p50Week: week?.p50 ?? null, p50Month: month?.p50 ?? null, confidenceFlag: base.confidence_flag, computedAt: base.computed_at ? new Date(base.computed_at).toISOString() : null } : null,
    flags,
  };
}
