import { Router } from 'express';
import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { byokService } from './byok.service.js';

export const aiConfigRouter = Router();

// Only SYSTEM_ADMIN can view, edit, or test central AI BYOK configurations
const systemAdminOnly = requireRole('SYSTEM_ADMIN');

aiConfigRouter.get(
  '/',
  requireAuth,
  systemAdminOnly,
  asyncHandler(async (_req, res) => {
    const config = await byokService.getConfig();
    res.status(200).json({ ok: true, data: config });
  }),
);

aiConfigRouter.put(
  '/',
  requireAuth,
  systemAdminOnly,
  asyncHandler(async (req, res) => {
    const updated = await byokService.updateConfig(req);
    res.status(200).json({ ok: true, data: updated });
  }),
);

aiConfigRouter.post(
  '/test-connection',
  requireAuth,
  systemAdminOnly,
  asyncHandler(async (req, res) => {
    const result = await byokService.testConnection(req);
    res.status(200).json(result);
  }),
);
