import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { withTransaction } from '../../db/tx.js';
import { nearExpiryService } from './nearExpiry.service.js';
import { plansService, processPlanTimeouts } from './plans.service.js';
import { repeatService } from './repeat.service.js';
import { recomputeRepeatExpiry, scanNearExpiry } from './expiry.scan.js';

/** F2a: near-expiry review, regional pool, allocation plans, repeated-expiry flags (spec x-roles + WH read-only per plan §4.2). */
const readers = requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER');
const pharmacist = requireRole('PHARMACIST');

export const nearExpiryRouter = Router();
nearExpiryRouter.get('/', requireAuth, readers, asyncHandler(async (req, res) => res.json(await nearExpiryService.list(req.user!, req.query))));
nearExpiryRouter.post('/:id/release', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await nearExpiryService.release(req, req.params.id))));
nearExpiryRouter.post('/:id/keep', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await nearExpiryService.keep(req, req.params.id))));
nearExpiryRouter.post('/:id/dismiss', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await nearExpiryService.dismiss(req, req.params.id))));
nearExpiryRouter.post('/:id/withdraw', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await nearExpiryService.withdraw(req, req.params.id))));

export const poolRouter = Router();
poolRouter.get('/', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'), asyncHandler(async (req, res) => res.json(await plansService.pool(req.user!, req.query))));

export const allocationPlansRouter = Router();
allocationPlansRouter.get('/', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'), asyncHandler(async (req, res) => res.json(await plansService.list(req.user!, req.query))));
allocationPlansRouter.get('/:id', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'), asyncHandler(async (req, res) => res.json(await plansService.detail(req.user!, req.params.id))));
allocationPlansRouter.post('/:id/decision', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await plansService.decision(req, req.params.id))));
allocationPlansRouter.post('/:id/option', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await plansService.option(req, req.params.id))));
allocationPlansRouter.post('/:id/cancel', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await plansService.cancel(req, req.params.id))));

export const repeatExpiryRouter = Router();
repeatExpiryRouter.get('/', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN'), asyncHandler(async (req, res) => res.json(await repeatService.list(req.user!, req.query))));
repeatExpiryRouter.post('/:id/dismiss', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await repeatService.dismiss(req, req.params.id))));

/** JOB-05 / JOB-07 / plan timeouts (JOB-06 matching is the Agent's): operator trigger (the server also runs them on a timer). */
export const expiryJobsRouter = Router();
expiryJobsRouter.post('/near-expiry', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (_req, res) => res.json({ ok: true, ...(await runExpiryJobs()) })));

export async function runExpiryJobs(): Promise<Record<string, number>> {
  return withTransaction(async (client) => {
    const scan = await scanNearExpiry(client);
    const timeouts = await processPlanTimeouts(client);
    const repeat = await recomputeRepeatExpiry(client);
    return { ...scan, timedOutPlans: timeouts.timedOut, repeatFlags: repeat.flags };
  });
}
