import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { auditService } from './audit.service.js';

/**
 * API-AD-003 `GET /audit-log` (HOSPITAL_ADMIN own hospital, SYSTEM_ADMIN all — matrix §2).
 * `GET /audit-log/verify` is not in openapi; it exposes JOB-15 (`audit_chain_verify()`) to SYSTEM_ADMIN.
 */
export const auditRouter = Router();

auditRouter.get('/verify', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await auditService.verify(req));
}));
auditRouter.get('/', requireAuth, requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await auditService.list(req.user!, req.query));
}));
