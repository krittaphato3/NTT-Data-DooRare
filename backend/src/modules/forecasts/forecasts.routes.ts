import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { idempotent } from '../../middleware/idempotency.js';
import { forecastsController } from './forecasts.controller.js';
import { triggerForecastRuns } from './forecasts.runs.js';

/**
 * API-F1a-001 / API-F1a-002 (specification/openapi.yaml).
 *
 * API-F1a-003 `POST /forecasts/runs` loads the latest inference output into the DB and re-evaluates alerts (forecasts.runs.ts).
 */
export const forecastsRouter = Router();

forecastsRouter.get(
  '/',
  requireAuth,
  requireRole('PHARMACIST', 'PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'REGION_ADMIN', 'WAREHOUSE_OFFICER'),
  forecastsController.list,
);

forecastsRouter.get(
  '/:hospitalDrugId',
  requireAuth,
  requireRole('PHARMACIST', 'PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER'),
  forecastsController.detail,
);

forecastsRouter.post(
  '/runs',
  requireAuth,
  requireRole('SYSTEM_ADMIN', 'REGION_ADMIN'),
  idempotent(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await triggerForecastRuns(req));
  }),
);
