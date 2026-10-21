/**
 * The ONLY place that changes `stock_lot` quantities. Every move updates the lot and appends a
 * `stock_ledger` row (append-only source of truth) in the caller's transaction. Other modules
 * (load, receive, kit confirm, return, release…) call these functions and never write that SQL themselves.
 *
 * Quantities are numeric(14,3). All arithmetic happens in SQL so concurrent moves cannot lose updates, and
 * the `qty_on_hand >= 0` / `qty_held <= qty_on_hand` constraints are enforced before the DB CHECKs fire.
 */
import type pg from 'pg';
import { HttpError } from '../middleware/httpError.js';

export type LedgerReason =
  | 'RECEIPT'
  | 'ISSUE_USAGE'
  | 'ADJUST'
  | 'LEND_OUT'
  | 'BORROW_IN'
  | 'RETURN_IN'
  | 'RETURN_OUT'
  | 'POOL_TRANSFER_OUT'
  | 'POOL_TRANSFER_IN'
  | 'KIT_PACK'
  | 'KIT_UNPACK'
  | 'EXPIRED_WRITEOFF'
  | 'IMPORT';

export interface StockMove {
  lotId: string;
  /** Signed quantity in base units: + stock in, − stock out. */
  delta: number;
  reason: LedgerReason;
  refType?: string | null;
  refId?: string | null;
  actorId?: string | null;
}

export interface StockLotState {
  id: string;
  hospitalId: string;
  hospitalDrugId: string;
  lotNo: string;
  expiryDate: string;
  qtyOnHand: string;
  qtyHeld: string;
  version: number;
}

const LOT_COLUMNS = `id, hospital_id, hospital_drug_id, lot_no, expiry_date::text AS expiry_date,
                     qty_on_hand::text AS qty_on_hand, qty_held::text AS qty_held, version`;

function toState(row: Record<string, any>): StockLotState {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    hospitalDrugId: row.hospital_drug_id,
    lotNo: row.lot_no,
    expiryDate: row.expiry_date,
    qtyOnHand: row.qty_on_hand,
    qtyHeld: row.qty_held,
    version: Number(row.version),
  };
}

function assertQuantity(value: number, label: string): void {
  if (!Number.isFinite(value) || value === 0) {
    throw new HttpError(400, 'VALIDATION', `${label} ต้องเป็นตัวเลขที่ไม่ใช่ศูนย์`);
  }
  if (Math.abs(Math.round(value * 1000) - value * 1000) > 1e-6) {
    throw new HttpError(400, 'VALIDATION', `${label} ทศนิยมได้ไม่เกิน 3 ตำแหน่ง`);
  }
}

/** Explains why a guarded UPDATE touched no row. */
async function explainFailure(client: pg.PoolClient, hospitalId: string, lotId: string, delta: number, held: boolean) {
  const lot = await client.query(`SELECT ${LOT_COLUMNS} FROM stock_lot WHERE id = $1 AND hospital_id = $2`, [lotId, hospitalId]);
  if (lot.rowCount === 0) return new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อตสต็อก');
  const state = toState(lot.rows[0]);
  if (held) {
    return new HttpError(409, delta > 0 ? 'INSUFFICIENT_STOCK' : 'VALIDATION', 'จำนวนที่กันไว้ไม่ถูกต้อง', {
      lotId,
      qtyOnHand: state.qtyOnHand,
      qtyHeld: state.qtyHeld,
      requested: delta,
    });
  }
  const available = Number(state.qtyOnHand) - Number(state.qtyHeld);
  const code = Number(state.qtyOnHand) + delta < 0 ? 'INSUFFICIENT_STOCK' : 'LOT_HELD';
  return new HttpError(409, code, code === 'LOT_HELD' ? 'ล็อตนี้ถูกกันไว้สำหรับรายการอื่น' : 'สต็อกไม่พอ', {
    lotId,
    qtyOnHand: state.qtyOnHand,
    qtyHeld: state.qtyHeld,
    available,
    requested: delta,
  });
}

/** Moves `delta` into/out of a lot (on-hand) and appends the ledger row. Lot must belong to `hospitalId`. */
export async function adjustStock(client: pg.PoolClient, hospitalId: string, move: StockMove): Promise<StockLotState> {
  assertQuantity(move.delta, 'จำนวน');
  const updated = await client.query(
    `UPDATE stock_lot
        SET qty_on_hand = qty_on_hand + $3, updated_at = now(), version = version + 1
      WHERE id = $1 AND hospital_id = $2
        AND qty_on_hand + $3 >= 0
        AND qty_on_hand + $3 >= qty_held
      RETURNING ${LOT_COLUMNS}`,
    [move.lotId, hospitalId, move.delta],
  );
  if (updated.rowCount === 0) throw await explainFailure(client, hospitalId, move.lotId, move.delta, false);
  await client.query(
    `INSERT INTO stock_ledger (hospital_id, lot_id, delta, reason, ref_type, ref_id, actor_id)
     VALUES ($1, $2, $3, $4::ledger_reason, $5, $6, $7)`,
    [hospitalId, move.lotId, move.delta, move.reason, move.refType ?? null, move.refId ?? null, move.actorId ?? null],
  );
  return toState(updated.rows[0]);
}

/**
 * Reserves (`delta` > 0) or releases (`delta` < 0) quantity on a lot without moving stock out. A reservation
 * is not a stock movement, so no ledger row is written; the ledger records the later issue (LEND_OUT…).
 */
export async function holdStock(client: pg.PoolClient, hospitalId: string, lotId: string, delta: number): Promise<StockLotState> {
  assertQuantity(delta, 'จำนวนที่กัน');
  const updated = await client.query(
    `UPDATE stock_lot
        SET qty_held = qty_held + $3, updated_at = now(), version = version + 1
      WHERE id = $1 AND hospital_id = $2
        AND qty_held + $3 >= 0
        AND qty_held + $3 <= qty_on_hand
      RETURNING ${LOT_COLUMNS}`,
    [lotId, hospitalId, delta],
  );
  if (updated.rowCount === 0) throw await explainFailure(client, hospitalId, lotId, delta, true);
  return toState(updated.rows[0]);
}

/** Lot lookup for callers that need its state (scoped to the hospital; null when missing). */
export async function getLot(client: pg.PoolClient, hospitalId: string, lotId: string): Promise<StockLotState | null> {
  const result = await client.query(`SELECT ${LOT_COLUMNS} FROM stock_lot WHERE id = $1 AND hospital_id = $2`, [lotId, hospitalId]);
  return result.rowCount ? toState(result.rows[0]) : null;
}

/**
 * Finds (or creates with zero stock) the lot `lotNo` of a hospital's own listing, so goods arriving from another
 * hospital (BORROW_IN, POOL_TRANSFER_IN, RETURN_IN) can be booked with `adjustStock`.
 */
export async function ensureLot(
  client: pg.PoolClient,
  hospitalId: string,
  hospitalDrugId: string,
  lot: { lotNo: string; expiryDate: string; manufacturer?: string | null },
): Promise<string> {
  const found = await client.query(
    `INSERT INTO stock_lot (hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, qty_on_hand)
     VALUES ($1, $2, $3, $4::date, $5, 0)
     ON CONFLICT (hospital_id, hospital_drug_id, lot_no) DO UPDATE SET lot_no = EXCLUDED.lot_no
     RETURNING id`,
    [hospitalId, hospitalDrugId, lot.lotNo, lot.expiryDate, lot.manufacturer ?? null],
  );
  return found.rows[0].id;
}

/** The hospital's own listing of a central drug (needed before it can hold that drug's stock). */
export async function findHospitalDrug(client: pg.PoolClient, hospitalId: string, drugMasterId: string): Promise<string | null> {
  const result = await client.query(
    `SELECT id FROM hospital_drug WHERE hospital_id = $1 AND drug_master_id = $2 AND active ORDER BY local_code LIMIT 1`,
    [hospitalId, drugMasterId],
  );
  return result.rows[0]?.id ?? null;
}

/** Releases up to `qty` of a lot's reservation (never below zero) and returns how much was released. */
export async function releaseHeld(client: pg.PoolClient, hospitalId: string, lotId: string, qty: number): Promise<number> {
  const lot = await getLot(client, hospitalId, lotId);
  if (!lot) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อตสต็อก');
  const release = Math.min(Number(lot.qtyHeld), qty);
  if (release > 0) await holdStock(client, hospitalId, lotId, -release);
  return release;
}

export interface FefoPick {
  lotId: string;
  lotNo: string;
  expiryDate: string;
  manufacturer: string | null;
  qty: number;
}

/**
 * First-expiry-first-out picks of a drug's free stock (on hand minus reserved, not yet expired) at one hospital.
 * `minRemainingDays` keeps out lots closer to expiry (lending uses 180, BR-F1b-013). Locks the chosen lots; throws 409
 * INSUFFICIENT_STOCK when the hospital cannot cover `qty`.
 */
export async function pickFefo(client: pg.PoolClient, hospitalId: string, drugMasterId: string, qty: number, minRemainingDays = 0): Promise<FefoPick[]> {
  const lots = await client.query(
    `SELECT sl.id, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.manufacturer, (sl.qty_on_hand - sl.qty_held)::float8 AS free
       FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE sl.hospital_id = $1 AND hd.drug_master_id = $2 AND sl.expiry_date > current_date + $3::int AND sl.qty_on_hand > sl.qty_held
      ORDER BY sl.expiry_date, sl.lot_no
        FOR UPDATE OF sl`,
    [hospitalId, drugMasterId, minRemainingDays],
  );
  const picks: FefoPick[] = [];
  let remaining = qty;
  for (const lot of lots.rows) {
    if (remaining <= 1e-9) break;
    const take = Math.min(Number(lot.free), remaining);
    picks.push({ lotId: lot.id, lotNo: lot.lot_no, expiryDate: lot.expiry_date, manufacturer: lot.manufacturer, qty: take });
    remaining -= take;
  }
  if (remaining > 1e-9) {
    throw new HttpError(409, 'INSUFFICIENT_STOCK', 'สต็อกที่ใช้ได้ไม่พอ', { drugMasterId, requested: qty, short: Math.round(remaining * 1000) / 1000 });
  }
  return picks;
}
