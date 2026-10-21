import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { transportController } from './transport.controller.js';

/**
 * API-F2a-012 `GET /transport-tasks`. Spec x-roles: WAREHOUSE_OFFICER, DRIVER, PHARMACIST; ER_STAFF, HOSPITAL_ADMIN and
 * SYSTEM_ADMIN are added for the read-only transport views (docs/api plan §4.2). A DRIVER only sees tasks assigned to them.
 */
export const transportRouter = Router();

transportRouter.get(
  '/',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'DRIVER', 'PHARMACIST', 'ER_STAFF', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'),
  asyncHandler(transportController.list),
);

/** `GET /vehicles` (not in openapi; the driver "offline queue & vehicle" screen needs it). */
export const vehiclesRouter = Router();

vehiclesRouter.get(
  '/',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'DRIVER', 'PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'),
  asyncHandler(transportController.vehicles),
);
