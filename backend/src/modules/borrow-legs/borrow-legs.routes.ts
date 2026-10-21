import { Router } from 'express';
import type { Request, Response } from 'express';
import { auditContext } from '../../core/audit.js';
import { bodyObject, optionalNumber, optionalStringArray, uuidParam } from '../../core/validate.js';
import { pool } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/httpError.js';
import { idempotent } from '../../middleware/idempotency.js';
import { applyTransition, loadTaskView } from '../transport/transport.workflow.js';
import type { MoveStatus } from '../transport/transport.workflow.js';

/**
 * Leg-side entry points of the transport workflow (API-F1b-010 / API-F1b-011). A leg has one transport task;
 * these endpoints find it and apply the same transition as `POST /transport-tasks/{id}/status`.
 * (`respond` / create-leg belong to the F1b borrow-request module.)
 */
export const borrowLegsRouter = Router();

async function taskOfLeg(legId: string): Promise<string> {
  const result = await pool.query(
    `SELECT id FROM transport_task WHERE ref_type = 'BORROW_LEG' AND ref_id = $1 AND status <> 'CANCELLED' ORDER BY created_at DESC LIMIT 1`,
    [legId],
  );
  if (!result.rows[0]) throw new HttpError(409, 'NO_TRANSPORT_TASK', 'คำขอนี้ยังไม่มีงานขนส่ง (ผู้ให้ยืมต้องตอบรับก่อน)');
  return result.rows[0].id;
}

async function viaLeg(req: Request, res: Response, toStatus: MoveStatus, allowPharmacistReceive: boolean): Promise<void> {
  const legId = uuidParam(req.params.legId, 'legId');
  const body = bodyObject(req.body ?? {});
  const taskId = await taskOfLeg(legId);
  const user = req.user!;
  const task = await withTransaction(async (client) => {
    await applyTransition(client, auditContext(req), user, {
      taskId,
      toStatus,
      allowPharmacistReceive,
      version: optionalNumber(body.version, 'version', { min: 1 }),
      photoKeys: optionalStringArray(body.photoKeys, 'photoKeys', 10),
      qtyReceived: optionalNumber(body.qtyReceived, 'qtyReceived', { min: 0.001 }),
    });
    return loadTaskView(client, taskId, user);
  });
  const leg = (
    await pool.query(`SELECT id, status::text AS status, qty_accepted::float8 AS qty_accepted, qty_received::float8 AS qty_received FROM borrow_leg WHERE id = $1`, [legId])
  ).rows[0];
  res.status(200).json({
    ok: true,
    id: legId,
    data: { id: legId, status: leg.status, qtyAccepted: leg.qty_accepted, qtyReceived: leg.qty_received, task },
  });
}

borrowLegsRouter.post(
  '/:legId/load',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER'),
  idempotent(),
  asyncHandler((req, res) => viaLeg(req, res, 'LOADED', false)),
);
borrowLegsRouter.post(
  '/:legId/receive',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'PHARMACIST'),
  idempotent(),
  asyncHandler((req, res) => viaLeg(req, res, 'RECEIVED', true)),
);
