/**
 * Ready-set stock (table `kit_stock`, F3). Packed sets are counted per hospital and kit type (no lots, no ledger table), so
 * every change here is audited by the caller. Like `core/stock.ts` this is the only place that writes the table; all
 * arithmetic happens in SQL with guards so concurrent moves cannot oversell a set (`qty_held <= qty_ready`).
 */
import type pg from 'pg';
import { HttpError } from '../middleware/httpError.js';

export interface KitStockState {
  ready: number;
  held: number;
  free: number;
}

const toState = (row: Record<string, any> | undefined): KitStockState => {
  const ready = Number(row?.qty_ready ?? 0);
  const held = Number(row?.qty_held ?? 0);
  return { ready, held, free: ready - held };
};

const assertCount = (qty: number, label: string): void => {
  if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'VALIDATION', `${label} ต้องเป็นจำนวนเต็มมากกว่า 0`);
};

export async function getKitStock(client: pg.PoolClient, hospitalId: string, kitTypeId: string, lock = false): Promise<KitStockState> {
  const r = await client.query(`SELECT qty_ready, qty_held FROM kit_stock WHERE hospital_id = $1 AND kit_type_id = $2 ${lock ? 'FOR UPDATE' : ''}`, [hospitalId, kitTypeId]);
  return toState(r.rows[0]);
}

const insufficient = async (client: pg.PoolClient, hospitalId: string, kitTypeId: string, requested: number) =>
  new HttpError(409, 'INSUFFICIENT_KITS', 'ชุดพร้อมใช้ไม่พอ', { kitTypeId, requested, ...(await getKitStock(client, hospitalId, kitTypeId)) });

/** Reserves `qty` ready sets (they stay in stock but cannot be lent or reserved again). */
export async function holdKits(client: pg.PoolClient, hospitalId: string, kitTypeId: string, qty: number): Promise<KitStockState> {
  assertCount(qty, 'จำนวนชุดที่กัน');
  const r = await client.query(
    `UPDATE kit_stock SET qty_held = qty_held + $3, updated_at = now()
      WHERE hospital_id = $1 AND kit_type_id = $2 AND qty_held + $3 <= qty_ready RETURNING qty_ready, qty_held`,
    [hospitalId, kitTypeId, qty],
  );
  if (r.rowCount === 0) throw await insufficient(client, hospitalId, kitTypeId, qty);
  return toState(r.rows[0]);
}

/** Releases up to `qty` of the reservation (never below zero); returns how many were released. */
export async function releaseKits(client: pg.PoolClient, hospitalId: string, kitTypeId: string, qty: number): Promise<number> {
  if (!(qty > 0)) return 0;
  const before = await getKitStock(client, hospitalId, kitTypeId, true);
  const release = Math.min(before.held, qty);
  if (release > 0) await client.query(`UPDATE kit_stock SET qty_held = qty_held - $3, updated_at = now() WHERE hospital_id = $1 AND kit_type_id = $2`, [hospitalId, kitTypeId, release]);
  return release;
}

/** Sets leave the hospital (lent out or used): ready goes down, the matching reservation (if any) is consumed first. */
export async function removeKits(client: pg.PoolClient, hospitalId: string, kitTypeId: string, qty: number): Promise<KitStockState> {
  assertCount(qty, 'จำนวนชุด');
  const before = await getKitStock(client, hospitalId, kitTypeId, true);
  if (before.ready < qty) throw await insufficient(client, hospitalId, kitTypeId, qty);
  const fromHeld = Math.min(before.held, qty);
  // sets taken from the unreserved part must not eat into what is reserved for others
  if (qty - fromHeld > before.free) throw await insufficient(client, hospitalId, kitTypeId, qty);
  const r = await client.query(
    `UPDATE kit_stock SET qty_ready = qty_ready - $3, qty_held = qty_held - $4, updated_at = now() WHERE hospital_id = $1 AND kit_type_id = $2 RETURNING qty_ready, qty_held`,
    [hospitalId, kitTypeId, qty, fromHeld],
  );
  return toState(r.rows[0]);
}

/** Sets arrive (packed here, or received from another hospital). Creates the row when the hospital never held this kit. */
export async function addKits(client: pg.PoolClient, hospitalId: string, kitTypeId: string, qty: number): Promise<KitStockState> {
  assertCount(qty, 'จำนวนชุด');
  const r = await client.query(
    `INSERT INTO kit_stock (hospital_id, kit_type_id, qty_ready, qty_held) VALUES ($1, $2, $3, 0)
     ON CONFLICT (hospital_id, kit_type_id) DO UPDATE SET qty_ready = kit_stock.qty_ready + EXCLUDED.qty_ready, updated_at = now()
     RETURNING qty_ready, qty_held`,
    [hospitalId, kitTypeId, qty],
  );
  return toState(r.rows[0]);
}

/** Stock count by the warehouse: the new ready count may not drop below what is reserved. */
export async function setReadyKits(client: pg.PoolClient, hospitalId: string, kitTypeId: string, qtyReady: number): Promise<{ before: KitStockState; after: KitStockState }> {
  if (!Number.isInteger(qtyReady) || qtyReady < 0) throw new HttpError(400, 'VALIDATION', 'qtyReady ต้องเป็นจำนวนเต็มตั้งแต่ 0');
  await client.query(`INSERT INTO kit_stock (hospital_id, kit_type_id, qty_ready, qty_held) VALUES ($1, $2, 0, 0) ON CONFLICT DO NOTHING`, [hospitalId, kitTypeId]);
  const before = await getKitStock(client, hospitalId, kitTypeId, true);
  if (qtyReady < before.held) throw new HttpError(409, 'KITS_RESERVED', `ชุดถูกกันไว้ ${before.held} ชุด ตั้งจำนวนต่ำกว่านี้ไม่ได้`, { held: before.held });
  const r = await client.query(`UPDATE kit_stock SET qty_ready = $3, updated_at = now() WHERE hospital_id = $1 AND kit_type_id = $2 RETURNING qty_ready, qty_held`, [hospitalId, kitTypeId, qtyReady]);
  return { before, after: toState(r.rows[0]) };
}
