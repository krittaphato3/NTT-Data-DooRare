import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { usersService } from './users.service.js';

/**
 * API-AD-006 `GET /users`, API-AD-007 `POST /users` (Idempotency-Key required) and `PATCH /users/{id}`
 * (§4.1 edit / deactivate). HOSPITAL_ADMIN (own hospital) and SYSTEM_ADMIN (all) per matrix §2;
 * no REGION_ADMIN / AUDITOR in this 6-role plan.
 */
export const usersRouter = Router();
const userAdmins = requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN');

usersRouter.get('/', requireAuth, userAdmins, asyncHandler(async (req, res) => {
  res.status(200).json(await usersService.list(req.user!, req.query));
}));
usersRouter.post('/', requireAuth, userAdmins, idempotent(), asyncHandler(async (req, res) => {
  res.status(201).json(await usersService.create(req));
}));
usersRouter.patch('/:id', requireAuth, userAdmins, asyncHandler(async (req, res) => {
  res.status(200).json(await usersService.update(req, req.params.id));
}));
