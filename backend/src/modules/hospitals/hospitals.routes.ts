import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { hospitalsService } from './hospitals.service.js';

/** API-PL-002 / API-PL-003 (all authenticated); create / update are admin-console additions (SYSTEM_ADMIN). */
export const hospitalsRouter = Router();

hospitalsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await hospitalsService.list(req.user!, req.query));
}));
hospitalsRouter.get('/:hospitalId', requireAuth, asyncHandler(async (req, res) => {
  res.status(200).json(await hospitalsService.get(req.user!, req.params.hospitalId));
}));
hospitalsRouter.post('/', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(201).json(await hospitalsService.create(req));
}));
hospitalsRouter.patch('/:hospitalId', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await hospitalsService.update(req, req.params.hospitalId));
}));
