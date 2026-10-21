import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
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

// API-F2a-013 / -014 / -017. Spec x-roles: WAREHOUSE_OFFICER, DRIVER (who may do which step is enforced in the workflow).
transportRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'DRIVER'),
  idempotent(),
  asyncHandler(transportController.status),
);
transportRouter.post(
  '/:id/events:sync',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'DRIVER'),
  idempotent(),
  asyncHandler(transportController.sync),
);
transportRouter.post('/:id/photos', requireAuth, requireRole('WAREHOUSE_OFFICER', 'DRIVER'), asyncHandler(transportController.photos));

/** `GET /vehicles` (not in openapi; the driver "offline queue & vehicle" screen needs it). */
export const vehiclesRouter = Router();

vehiclesRouter.get(
  '/',
  requireAuth,
  requireRole('WAREHOUSE_OFFICER', 'DRIVER', 'PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'),
  asyncHandler(transportController.vehicles),
);
