import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { inventoryService } from './inventory.service.js';

/** `GET /inventory` (not in openapi; the warehouse stock / expiry screens need lot-level stock). Own hospital only. */
export const inventoryRouter = Router();
inventoryRouter.get(
  '/',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'PHARMACIST', 'HOSPITAL_ADMIN', 'ER_STAFF', 'SYSTEM_ADMIN'),
  asyncHandler(async (req, res) => {
    res.status(200).json(await inventoryService.list(req.user!, req.query));
  }),
);
