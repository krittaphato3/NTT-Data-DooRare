import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { documentsService } from './documents.service.js';

/**
 * API-XC-001 `GET /documents/{id}` (all authenticated), API-XC-002 `POST /documents` (PHARMACIST, WAREHOUSE_OFFICER).
 * `GET /documents` (list, scoped to the issuing/receiving hospital) is added for the documents screen; spec §7.15 names it.
 */
export const documentsRouter = Router();

documentsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await documentsService.list(req.user!, req.query));
}));
documentsRouter.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await documentsService.get(req.user!, req.params.id));
}));
documentsRouter.post('/', requireAuth, requireRole('PHARMACIST', 'WAREHOUSE_OFFICER'), idempotent(), asyncHandler(async (req, res) => {
  const result = await documentsService.create(req);
  res.status(result.existing ? 200 : 201).json(result);
}));
