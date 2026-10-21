import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { returnsService } from './returns.service.js';

/** API-XC-003 list (PH, HA, WH), API-XC-004 record a return (WH, PH), API-XC-005 waive (HOSPITAL_ADMIN). */
export const returnsRouter = Router();

returnsRouter.get('/', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER'), asyncHandler(async (req, res) => {
  res.status(200).json(await returnsService.list(req.user!, req.query));
}));
returnsRouter.post('/:id/return', requireAuth, requireRole('WAREHOUSE_OFFICER', 'PHARMACIST'), idempotent(), asyncHandler(async (req, res) => {
  res.status(200).json(await returnsService.recordReturn(req, req.params.id));
}));
returnsRouter.post('/:id/waive', requireAuth, requireRole('HOSPITAL_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await returnsService.waive(req, req.params.id));
}));
