/**
 * Creates the transport task of an accepted borrow leg (F1) or an approved allocation line (F2).
 * Called by the F1 `respond` endpoint and the F2 plan approval, inside their transaction, so the leg/plan change and
 * its shipment appear together. Task numbers are TR-<yyyy>-<seq6>, serialised per year.
 */
import type pg from 'pg';
import { HttpError } from '../middleware/httpError.js';

export interface NewTransportTask {
  refType: 'BORROW_LEG' | 'ALLOCATION_LINE';
  refId: string;
  fromHospitalId: string;
  toHospitalId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  etaAt?: Date | null;
}

export async function createTransportTask(client: pg.PoolClient, input: NewTransportTask): Promise<{ id: string; taskNo: string }> {
  if (input.fromHospitalId === input.toHospitalId) throw new HttpError(400, 'VALIDATION', 'ต้นทางและปลายทางต้องเป็นคนละโรงพยาบาล');
  const open = await client.query(
    `SELECT id, task_no FROM transport_task WHERE ref_type = $1 AND ref_id = $2 AND status <> 'CANCELLED' LIMIT 1`,
    [input.refType, input.refId],
  );
  if (open.rows[0]) return { id: open.rows[0].id, taskNo: open.rows[0].task_no };

  const prefix = `TR-${new Date().getFullYear()}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const last = await client.query(`SELECT max(substring(task_no FROM '[0-9]+$')::int) AS n FROM transport_task WHERE task_no LIKE $1`, [`${prefix}%`]);
  const taskNo = `${prefix}${String(Number(last.rows[0].n ?? 0) + 1).padStart(6, '0')}`;
  const inserted = await client.query(
    `INSERT INTO transport_task (ref_type, ref_id, from_hospital_id, to_hospital_id, driver_id, vehicle_id, eta_at, task_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [input.refType, input.refId, input.fromHospitalId, input.toHospitalId, input.driverId ?? null, input.vehicleId ?? null, input.etaAt?.toISOString() ?? null, taskNo],
  );
  return { id: inserted.rows[0].id, taskNo };
}
