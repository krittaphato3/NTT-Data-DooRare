import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { configService } from './config.service.js';

/**
 * API-AD-001 `GET /config` and API-AD-002 `PUT /config/{key}` (HOSPITAL_ADMIN own hospital, SYSTEM_ADMIN all
 * scopes — matrix §2). The 6-role plan does not grant REGION_ADMIN / AUDITOR these routes.
 */
export const configRouter = Router();
const configReaders = requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN');

configRouter.get('/', requireAuth, configReaders, asyncHandler(async (req, res) => {
  res.status(200).json(await configService.list(req.user!, req.query));
}));
configRouter.put('/:key', requireAuth, configReaders, asyncHandler(async (req, res) => {
  res.status(200).json(await configService.update(req, req.params.key));
}));

/**
 * API-AD-004 `POST /agent/kill-switch` — SYSTEM_ADMIN only (matrix §2). One switch exists: `agent.enabled`
 * at GLOBAL scope; the extra mock switches in the SA console are not part of the spec.
 */
export const agentRouter = Router();

agentRouter.post('/kill-switch', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  res.status(200).json(await configService.killSwitch(req));
}));
