import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { catalogService } from './catalog.service.js';

/** API-F2b-006 / -007 / API-F3-016 (all authenticated) and `GET /hospital-drugs` (the hospital's own list, not in openapi). */
export const drugMasterRouter = Router();
drugMasterRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await catalogService.drugMaster(req.query));
}));

export const centralItemsRouter = Router();
centralItemsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await catalogService.drugMaster(req.query, ['SUPPLY', 'BLOOD']));
}));

export const kitTypesRouter = Router();
kitTypesRouter.get('/', requireAuth, asyncHandler(async (_req, res) => {
  res.status(200).json(await catalogService.kitTypes());
}));

export const hospitalDrugsRouter = Router();
const readers = requireRole('PHARMACIST', 'WAREHOUSE_OFFICER', 'ER_STAFF', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN');
hospitalDrugsRouter.get('/', requireAuth, readers, asyncHandler(async (req, res) => {
  res.status(200).json(await catalogService.hospitalDrugs(req.user!, req.query));
}));
hospitalDrugsRouter.get('/:id', requireAuth, readers, asyncHandler(async (req, res) => {
  res.status(200).json(await catalogService.hospitalDrug(req.user!, req.params.id, req.query));
}));

/** API-F1a-004 (PHARMACIST, HOSPITAL_ADMIN): VED / expiry threshold of the caller's own listing. */
hospitalDrugsRouter.patch('/:id/classification', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await catalogService.classify(req, req.params.id));
}));
