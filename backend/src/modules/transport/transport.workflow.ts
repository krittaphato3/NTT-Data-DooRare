/**
 * Transport state machine SM-6 and its stock side effects (spec §11 SM-6, FR-F2a-011/012):
 *
 *   WAITING_DISPATCH -> LOADED      officer/driver of the sender + photo   sender stock OUT (reservation released first)
 *   LOADED           -> IN_TRANSIT  driver / officer of the sender         leg status follows
 *   IN_TRANSIT       -> ARRIVED     driver / officer + photo
 *   ARRIVED          -> RECEIVED    officer of the receiver                receiver stock IN, return obligation (F1)
 *
 * Everything for one transition (task row, event, photos, stock, leg, audit) runs in the caller's transaction.
 */
import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { auditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { getSetting } from '../../core/settings.js';
import { adjustStock, ensureLot, findHospitalDrug, releaseHeld } from '../../core/stock.js';
import { config } from '../../config/env.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { transportRepository } from './transport.repository.js';
import { mapTask } from './transport.service.js';
import type { TransportStatus, TransportTaskView } from './transport.types.js';

export type MoveStatus = 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED';
export const MOVE_STATUSES: readonly MoveStatus[] = ['LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED'];

const NEXT: Partial<Record<TransportStatus, MoveStatus>> = {
  WAITING_DISPATCH: 'LOADED',
  LOADED: 'IN_TRANSIT',
  IN_TRANSIT: 'ARRIVED',
  ARRIVED: 'RECEIVED',
};
const PHOTO_REQUIRED: ReadonlySet<MoveStatus> = new Set(['LOADED', 'ARRIVED']);
const MAX_PHOTOS = 10;

export interface TransitionInput {
  taskId: string;
  toStatus: MoveStatus;
  photoKeys?: string[];
  /** Optimistic lock: when given it must equal the task version (409 VERSION_CONFLICT). */
  version?: number;
  capturedAt?: Date;
  clientEventId?: string;
  seq?: number;
  temperatureC?: number | null;
  /** RECEIVED only: quantity actually received (default = shipped). */
  qtyReceived?: number;
  /** A pharmacist may confirm receipt through `POST /borrow-legs/{id}/receive`. */
  allowPharmacistReceive?: boolean;
}

export const photoPath = (key: string): string => path.join(config.uploads.dir, ...key.split('/'));

export function validatePhotoKeys(taskId: string, keys: string[]): void {
  if (keys.length > MAX_PHOTOS) throw new HttpError(400, 'VALIDATION', `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
  const pattern = new RegExp(`^transport/${taskId}/[A-Za-z0-9._-]+$`);
  for (const key of keys) {
    if (!pattern.test(key) || !fs.existsSync(photoPath(key))) {
      throw new HttpError(400, 'VALIDATION', 'photoKeys มีรูปที่ไม่ได้อัปโหลดสำหรับงานนี้', { key });
    }
  }
}

/** Who may perform which step. Hospital membership is checked first so other hospitals get 404, not 403. */
function assertMayAct(user: AuthSessionUser, task: Record<string, any>, to: MoveStatus, input: TransitionInput): void {
  const mine = user.hospitalId;
  if (!mine || (task.from_hospital_id !== mine && task.to_hospital_id !== mine)) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบงานขนส่ง');
  }
  const role = user.role;
  const forbidden = (message: string) => new HttpError(403, 'FORBIDDEN', message);
  if (role === 'DRIVER') {
    if (to === 'RECEIVED') throw forbidden('คนขับยืนยันรับของไม่ได้');
    if (task.driver_id !== user.id) throw forbidden('งานนี้ไม่ได้มอบหมายให้คุณ');
    if (mine !== task.from_hospital_id && mine !== task.to_hospital_id) throw forbidden('ไม่มีสิทธิ์');
    return;
  }
  const officer = role === 'WAREHOUSE_OFFICER' || (to === 'RECEIVED' && input.allowPharmacistReceive && role === 'PHARMACIST');
  if (!officer) throw forbidden('ต้องเป็นเจ้าหน้าที่คลังเท่านั้น');
  if ((to === 'LOADED' || to === 'IN_TRANSIT') && mine !== task.from_hospital_id) throw forbidden('ต้องเป็นคลังของโรงพยาบาลต้นทาง');
  if (to === 'RECEIVED' && mine !== task.to_hospital_id) throw forbidden('ต้องเป็นคลังของโรงพยาบาลปลายทาง');
}

interface ShipLot {
  lotId: string;
  qty: number;
  lotNo: string;
  expiryDate: string;
  manufacturer: string | null;
  drugMasterId: string | null;
}

/** The lots a task carries (empty for kit legs, whose stock lives in kit_stock — F3). */
async function lotsOfTask(client: pg.PoolClient, task: Record<string, any>): Promise<ShipLot[]> {
  const result =
    task.ref_type === 'BORROW_LEG'
      ? await client.query(
          `SELECT x.lot_id, x.qty::float8 AS qty, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.manufacturer, hd.drug_master_id
             FROM borrow_leg_lot x JOIN stock_lot sl ON sl.id = x.lot_id JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
            WHERE x.leg_id = $1 ORDER BY sl.expiry_date, sl.lot_no`,
          [task.ref_id],
        )
      : await client.query(
          `SELECT sl.id AS lot_id, al.qty::float8 AS qty, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.manufacturer, hd.drug_master_id
             FROM allocation_line al
             JOIN allocation_plan ap ON ap.id = al.plan_id
             JOIN pool_entry pe ON pe.id = ap.pool_entry_id
             JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
             JOIN stock_lot sl ON sl.id = ne.lot_id
             JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
            WHERE al.id = $1`,
          [task.ref_id],
        );
  return result.rows.map((row) => ({
    lotId: row.lot_id,
    qty: Number(row.qty),
    lotNo: row.lot_no,
    expiryDate: row.expiry_date,
    manufacturer: row.manufacturer,
    drugMasterId: row.drug_master_id,
  }));
}

async function isKitLeg(client: pg.PoolClient, task: Record<string, any>): Promise<boolean> {
  if (task.ref_type !== 'BORROW_LEG') return false;
  const result = await client.query(
    `SELECT i.kind::text AS kind FROM borrow_leg bl
       JOIN borrow_request_item i ON i.id = COALESCE(bl.request_item_id, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = bl.request_id))
      WHERE bl.id = $1`,
    [task.ref_id],
  );
  return result.rows[0]?.kind === 'KIT';
}

async function shipFromSender(client: pg.PoolClient, task: Record<string, any>, user: AuthSessionUser, lots: ShipLot[]): Promise<void> {
  if (lots.length === 0) throw new HttpError(409, 'NO_LOT_ASSIGNED', 'งานนี้ยังไม่ได้ระบุล็อตที่จะส่ง');
  const reason = task.ref_type === 'BORROW_LEG' ? 'LEND_OUT' : 'POOL_TRANSFER_OUT';
  for (const lot of lots) {
    await releaseHeld(client, task.from_hospital_id, lot.lotId, lot.qty);
    await adjustStock(client, task.from_hospital_id, {
      lotId: lot.lotId,
      delta: -lot.qty,
      reason,
      refType: task.ref_type === 'BORROW_LEG' ? 'borrow_leg' : 'allocation_line',
      refId: task.ref_id,
      actorId: user.id,
    });
  }
}

/** Books the received quantity into the receiver's own lots; returns the quantity booked. */
async function receiveAtReceiver(
  client: pg.PoolClient,
  task: Record<string, any>,
  user: AuthSessionUser,
  lots: ShipLot[],
  qtyReceived: number | undefined,
): Promise<number> {
  const shipped = lots.reduce((sum, lot) => sum + lot.qty, 0);
  const total = qtyReceived ?? shipped;
  if (!(total > 0) || total > shipped + 1e-9) {
    throw new HttpError(400, 'VALIDATION', `จำนวนที่รับต้องมากกว่า 0 และไม่เกินจำนวนที่ส่ง (${shipped})`);
  }
  let remaining = total;
  const reason = task.ref_type === 'BORROW_LEG' ? 'BORROW_IN' : 'POOL_TRANSFER_IN';
  for (const lot of lots) {
    const take = Math.min(lot.qty, remaining);
    if (take <= 0) continue;
    const listing = lot.drugMasterId ? await findHospitalDrug(client, task.to_hospital_id, lot.drugMasterId) : null;
    if (!listing) {
      throw new HttpError(409, 'MAPPING_NOT_VERIFIED', 'โรงพยาบาลปลายทางยังไม่มีรายการยานี้ในบัญชียาของตน', { drugMasterId: lot.drugMasterId });
    }
    const lotId = await ensureLot(client, task.to_hospital_id, listing, { lotNo: lot.lotNo, expiryDate: lot.expiryDate, manufacturer: lot.manufacturer });
    await adjustStock(client, task.to_hospital_id, {
      lotId,
      delta: take,
      reason,
      refType: task.ref_type === 'BORROW_LEG' ? 'borrow_leg' : 'allocation_line',
      refId: task.ref_id,
      actorId: user.id,
    });
    remaining -= take;
  }
  return total;
}

/** F1 bookkeeping once goods are received: leg, request item, request status and the return obligation (BR-XC-004/005/013). */
async function settleBorrowLeg(client: pg.PoolClient, task: Record<string, any>, received: number): Promise<void> {
  const leg = (
    await client.query(
      `UPDATE borrow_leg SET status = 'RECEIVED', qty_received = $2 WHERE id = $1
       RETURNING request_id, request_item_id, lender_hospital_id`,
      [task.ref_id, received],
    )
  ).rows[0];
  if (!leg) return;
  const item = (
    await client.query(
      `UPDATE borrow_request_item SET qty_fulfilled = qty_fulfilled + $3
        WHERE id = COALESCE($2::uuid, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = $1))
       RETURNING id, kind::text AS kind, drug_master_id, kit_type_id, qty_requested::float8 AS requested`,
      [leg.request_id, leg.request_item_id, received],
    )
  ).rows[0];
  // Provisional progress rule; the F-20 stop rule (V >= 90 %, E >= 100 %) replaces it when F1b is built.
  await client.query(
    `UPDATE borrow_request r SET updated_at = now(), version = version + 1,
            status = CASE WHEN NOT EXISTS (SELECT 1 FROM borrow_request_item i WHERE i.request_id = r.id AND i.qty_fulfilled < i.qty_requested)
                          THEN 'FULFILLED'::request_status ELSE 'PARTIALLY_FULFILLED'::request_status END
      WHERE r.id = $1 AND r.status IN ('IN_PROGRESS', 'PARTIALLY_FULFILLED')`,
    [leg.request_id],
  );
  if (!item) return;
  const days = await getSetting<number>(client, 'return.default_days', 30);
  const blood = item.drug_master_id
    ? (await client.query(`SELECT is_blood_product FROM drug_master WHERE id = $1`, [item.drug_master_id])).rows[0]?.is_blood_product
    : false;
  await client.query(
    `INSERT INTO return_obligation (leg_id, debtor_hospital_id, creditor_hospital_id, drug_master_id, kit_type_id, qty, return_mode, due_date)
     SELECT $1, $2, $3, $4, $5, $6, $7, current_date + $8::int
      WHERE NOT EXISTS (SELECT 1 FROM return_obligation WHERE leg_id = $1)`,
    [task.ref_id, task.to_hospital_id, leg.lender_hospital_id, item.drug_master_id, item.kit_type_id, received, blood ? 'BLOOD_REPLACEMENT' : 'IN_KIND', days],
  );
}

/** Applies one SM-6 transition. Throws HttpError (404/403/400/409) without leaving partial writes (caller rolls back). */
export async function applyTransition(client: pg.PoolClient, ctx: AuditContext, user: AuthSessionUser, input: TransitionInput): Promise<void> {
  const task = await transportRepository.getById(client, input.taskId, true);
  if (!task) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบงานขนส่ง');
  assertMayAct(user, task, input.toStatus, input);

  if (input.version !== undefined && input.version !== Number(task.version)) {
    throw new HttpError(409, 'VERSION_CONFLICT', 'งานขนส่งถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(task.version) });
  }
  if (NEXT[task.status as TransportStatus] !== input.toStatus) {
    throw new HttpError(409, 'INVALID_TRANSITION', `เปลี่ยนสถานะจาก ${task.status} เป็น ${input.toStatus} ไม่ได้`, { from: task.status, to: input.toStatus });
  }
  const photoKeys = input.photoKeys ?? [];
  if (PHOTO_REQUIRED.has(input.toStatus) && photoKeys.length === 0) {
    throw new HttpError(400, 'VALIDATION', 'ต้องแนบรูปถ่ายอย่างน้อย 1 รูปสำหรับขั้นตอนนี้');
  }
  validatePhotoKeys(task.id, photoKeys);

  const kit = await isKitLeg(client, task);
  let received: number | undefined;
  if (input.toStatus === 'LOADED' && !kit) {
    await shipFromSender(client, task, user, await lotsOfTask(client, task));
  }
  if (input.toStatus === 'RECEIVED') {
    received = kit ? input.qtyReceived : await receiveAtReceiver(client, task, user, await lotsOfTask(client, task), input.qtyReceived);
    if (received === undefined) {
      received = Number((await client.query(`SELECT qty_accepted::float8 AS q FROM borrow_leg WHERE id = $1`, [task.ref_id])).rows[0]?.q ?? 0);
    }
  }

  const at = input.capturedAt ?? new Date();
  await client.query(
    `UPDATE transport_task SET status = $2::transport_status,
            loaded_at   = CASE WHEN $2 = 'LOADED'     THEN $3::timestamptz ELSE loaded_at   END,
            departed_at = CASE WHEN $2 = 'IN_TRANSIT' THEN $3::timestamptz ELSE departed_at END,
            arrived_at  = CASE WHEN $2 = 'ARRIVED'    THEN $3::timestamptz ELSE arrived_at  END,
            received_at = CASE WHEN $2 = 'RECEIVED'   THEN $3::timestamptz ELSE received_at END,
            updated_at = now(), version = version + 1
      WHERE id = $1`,
    [task.id, input.toStatus, at.toISOString()],
  );
  await client.query(
    `INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, actor_id, photo_keys, applied, temperature_c)
     VALUES ($1, COALESCE($2::uuid, gen_random_uuid()),
             COALESCE($3::int, (SELECT COALESCE(max(seq), 0) + 1 FROM transport_event WHERE task_id = $1)),
             $4::transport_status, $5::timestamptz, $6, $7::text[], true, $8)`,
    [task.id, input.clientEventId ?? null, input.seq ?? null, input.toStatus, at.toISOString(), user.id, photoKeys, input.temperatureC ?? null],
  );
  if (input.toStatus === 'LOADED' || input.toStatus === 'ARRIVED') {
    for (const key of photoKeys) {
      await client.query(
        `INSERT INTO transport_photo (task_id, stage, s3_key, taken_at, taken_by) VALUES ($1, $2, $3, $4::timestamptz, $5)`,
        [task.id, input.toStatus, key, at.toISOString(), user.id],
      );
    }
  }
  if (task.ref_type === 'BORROW_LEG') {
    if (input.toStatus === 'LOADED' || input.toStatus === 'IN_TRANSIT') {
      await client.query(`UPDATE borrow_leg SET status = $2::leg_status WHERE id = $1`, [task.ref_id, input.toStatus]);
    } else if (input.toStatus === 'RECEIVED') {
      await settleBorrowLeg(client, task, received ?? 0);
    }
  }
  await writeAudit(client, ctx, {
    action: `TRANSPORT_${input.toStatus}`,
    entityType: 'transport_task',
    entityId: task.id,
    before: { status: task.status, version: Number(task.version) },
    after: { status: input.toStatus, photos: photoKeys.length, ...(received !== undefined ? { qtyReceived: received } : {}) },
  });
}

export async function loadTaskView(db: pg.PoolClient | pg.Pool, id: string, user: AuthSessionUser): Promise<TransportTaskView> {
  const row = await transportRepository.getById(db, id);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบงานขนส่ง');
  const [lines, events] = await Promise.all([
    transportRepository.linesFor(db, [row as { id: string; ref_type: string; ref_id: string }]),
    transportRepository.eventsFor(db, [id]),
  ]);
  return mapTask(row, user, lines.get(id) ?? [], events.get(id) ?? []);
}

export { auditContext };
