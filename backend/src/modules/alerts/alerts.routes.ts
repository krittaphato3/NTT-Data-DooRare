import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { alertsService } from './alerts.service.js';

/**
 * API-F1a-005 `GET /alerts` (spec: PHARMACIST, PROCUREMENT_OFFICER, HOSPITAL_ADMIN; WAREHOUSE_OFFICER and SYSTEM_ADMIN read-only per plan §4.2),
 * API-F1a-006 `POST /alerts/{id}/ack`, API-F1a-007 `POST /alerts/{id}/snooze` (PHARMACIST).
 */
export const alertsRouter = Router();

alertsRouter.get('/', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await alertsService.list(req.user!, req.query));
}));
alertsRouter.post('/:id/ack', requireAuth, requireRole('PHARMACIST'), asyncHandler(async (req, res) => {
  res.status(200).json(await alertsService.acknowledge(req, req.params.id));
}));
alertsRouter.post('/:id/snooze', requireAuth, requireRole('PHARMACIST'), asyncHandler(async (req, res) => {
  res.status(200).json(await alertsService.snooze(req, req.params.id));
}));
