import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { valueService } from './value.service.js';

const readers = requireRole('HOSPITAL_ADMIN', 'PHARMACIST', 'SYSTEM_ADMIN');

/** API-XC-006 `GET /value` (spec: HOSPITAL_ADMIN; the pharmacist's report page uses it too, plan §4.2). */
export const valueRouter = Router();
valueRouter.get('/', requireAuth, readers, asyncHandler(async (req, res) => res.json(await valueService.value(req.user!, req.query))));

/** API-AD-005 `GET /reports/{reportId}`. */
export const reportsRouter = Router();
reportsRouter.get('/:reportId', requireAuth, readers, asyncHandler(async (req, res) => res.json(await valueService.report(req.user!, req.params.reportId, req.query))));
