import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { withTransaction } from '../../db/tx.js';
import { borrowService } from './borrow.service.js';
import { lenderService } from './lender.service.js';
import { processLegTimers } from './borrow.flow.js';
import { processEmergencyTimers } from '../incidents/emergency.borrow.js';

/**
 * F1b borrow requests. Spec x-roles: PHARMACIST creates / proposes / approves / edits; reads are open to the pharmacist,
 * warehouse officer, hospital admin and system admin of the hospitals involved (scoping is done in the service).
 */
export const borrowRequestsRouter = Router();
const readers = requireRole('PHARMACIST', 'WAREHOUSE_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN');
const pharmacist = requireRole('PHARMACIST');

borrowRequestsRouter.post('/', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.status(201).json(await borrowService.create(req))));
borrowRequestsRouter.get('/', requireAuth, readers, asyncHandler(async (req, res) => res.json(await borrowService.list(req.user!, req.query))));
borrowRequestsRouter.get('/:id', requireAuth, readers, asyncHandler(async (req, res) => res.json(await borrowService.detail(req.user!, req.params.id))));
borrowRequestsRouter.get('/:id/agent-runs', requireAuth, readers, asyncHandler(async (req, res) => res.json(await borrowService.agentRuns(req.user!, req.params.id))));
borrowRequestsRouter.post('/:id/propose', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.propose(req, req.params.id))));
borrowRequestsRouter.patch('/:id/ladder', requireAuth, pharmacist, asyncHandler(async (req, res) => res.json(await borrowService.editLadder(req, req.params.id))));
borrowRequestsRouter.post('/:id/approve', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.approve(req, req.params.id))));
borrowRequestsRouter.post('/:id/reject', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.reject(req, req.params.id))));
borrowRequestsRouter.post('/:id/cancel', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.cancel(req, req.params.id))));
borrowRequestsRouter.post('/:id/legs/:legId/skip', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.skipLeg(req, req.params.id, req.params.legId))));
borrowRequestsRouter.post('/:id/escalate-manual', requireAuth, pharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await borrowService.escalateManual(req, req.params.id))));

/** API-F1b-008 `GET /lender-queue` (mounted at /api/v1/lender-queue). */
export const lenderQueueRouter = Router();
lenderQueueRouter.get('/', requireAuth, requireRole('PHARMACIST', 'WAREHOUSE_OFFICER', 'HOSPITAL_ADMIN'), asyncHandler(async (req, res) => res.json(await lenderService.queue(req.user!, req.query))));

/** JOB-04 trigger for operators / tests: reminders and timeouts of waiting legs. */
export const borrowJobsRouter = Router();
borrowJobsRouter.post('/borrow-timers', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (_req, res) => {
  const result = await withTransaction(async (client) => ({ ...(await processLegTimers(client)), emergency: await processEmergencyTimers(client) }));
  res.json({ ok: true, ...result });
}));
