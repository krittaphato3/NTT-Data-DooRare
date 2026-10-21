import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { forecastsController } from './forecasts.controller.js';

/**
 * API-F1a-001 / API-F1a-002 (specification/openapi.yaml).
 *
 * API-F1a-003 `POST /forecasts/runs` is intentionally not implemented: it triggers a forecast run, which is a
 * write/job operation (SYSTEM_ADMIN / REGION_ADMIN, Idempotency-Key) and this phase is read-only.
 */
export const forecastsRouter = Router();

forecastsRouter.get(
  '/',
  requireAuth,
  requireRole('PHARMACIST', 'PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'REGION_ADMIN'),
  forecastsController.list,
);

forecastsRouter.get(
  '/:hospitalDrugId',
  requireAuth,
  requireRole('PHARMACIST', 'PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN'),
  forecastsController.detail,
);
