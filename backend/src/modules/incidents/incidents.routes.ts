import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { emergencyBorrowService, listEmergencyLegs, previewBorrowing } from './emergency.borrow.js';
import { incidentsService } from './incidents.service.js';
import { ownIncident } from './incidents.shared.js';
import { pool } from '../../db/client.js';
import { kitsService } from './kits.service.js';
import { planService } from './plan.service.js';

/**
 * F3 emergency preparedness. Two sources disagree on who approves and sends: 07-api.md x-roles say PHARMACIST / HOSPITAL_ADMIN approve the plan and
 * PHARMACIST sends the urgent requests, while the permission matrix (spec §5.2, A8, FR-F3-009) and the UI RBAC (`approveIncidentPlan`, `manageIncident`)
 * give both to ER_STAFF. Each route allows the union of the two, so the ER screens work and the pharmacist / hospital admin can still act; the
 * close needs one ER and one pharmacist signature either way. Lender confirmation: WAREHOUSE_OFFICER / PHARMACIST (API) plus ER_STAFF (`confirmLend`);
 * packing a kit: WAREHOUSE_OFFICER (API) plus ER_STAFF (`manageIncident` packs a kit).
 * Every query is scoped to the caller's hospital in the services (other hospitals get 404).
 */
const er = requireRole('ER_STAFF');
const erOrPharmacist = requireRole('ER_STAFF', 'PHARMACIST');
const readers = requireRole('ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN', 'WAREHOUSE_OFFICER');

export const incidentsRouter = Router();
incidentsRouter.post('/', requireAuth, erOrPharmacist, idempotent(), asyncHandler(async (req, res) => res.status(201).json(await incidentsService.create(req)))); // API-F3-001
incidentsRouter.get('/', requireAuth, readers, asyncHandler(async (req, res) => res.json(await incidentsService.list(req.user!, req.query)))); // API-F3-002
incidentsRouter.get('/:id', requireAuth, readers, asyncHandler(async (req, res) => res.json(await incidentsService.detail(req.user!, req.params.id)))); // API-F3-003
incidentsRouter.patch('/:id/counts', requireAuth, er, asyncHandler(async (req, res) => res.json(await incidentsService.updateCounts(req, req.params.id)))); // API-F3-004
incidentsRouter.post('/:id/plan', requireAuth, erOrPharmacist, idempotent(), asyncHandler(async (req, res) => {
  const result = await planService.calculate(req, req.params.id);
  res.status(result.data.preview ? 200 : 201).json(result); // a preview stores nothing
})); // API-F3-005
incidentsRouter.post('/:id/plan/approve', requireAuth, requireRole('ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN'), idempotent(), asyncHandler(async (req, res) => res.json(await planService.approve(req, req.params.id)))); // API-F3-006
incidentsRouter.post('/:id/emergency-borrow', requireAuth, erOrPharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await emergencyBorrowService.send(req, req.params.id)))); // API-F3-007
incidentsRouter.get('/:id/emergency-borrow/preview', requireAuth, erOrPharmacist, asyncHandler(async (req, res) => res.json({ ok: true, data: await previewBorrowing(pool, await ownIncident(pool, req.user!, req.params.id)) })));
incidentsRouter.post('/:id/usage', requireAuth, erOrPharmacist, asyncHandler(async (req, res) => res.json(await incidentsService.recordUsage(req, req.params.id)))); // API-F3-011
incidentsRouter.post('/:id/close', requireAuth, erOrPharmacist, idempotent(), asyncHandler(async (req, res) => res.json(await incidentsService.close(req, req.params.id)))); // API-F3-012
incidentsRouter.get('/:id/reconciliation', requireAuth, requireRole('PHARMACIST', 'HOSPITAL_ADMIN', 'ER_STAFF'), asyncHandler(async (req, res) => res.json(await incidentsService.reconciliation(req.user!, req.params.id)))); // API-F3-013

export const emergencyLegsRouter = Router();
emergencyLegsRouter.get('/', requireAuth, requireRole('WAREHOUSE_OFFICER', 'PHARMACIST', 'ER_STAFF', 'HOSPITAL_ADMIN'), asyncHandler(async (req, res) => res.json(await listEmergencyLegs(req.user!, req.query))));
emergencyLegsRouter.post('/:legId/confirm', requireAuth, requireRole('WAREHOUSE_OFFICER', 'PHARMACIST', 'ER_STAFF'), idempotent(), asyncHandler(async (req, res) => res.json(await emergencyBorrowService.confirm(req, req.params.legId)))); // API-F3-008

export const kitTasksRouter = Router();
kitTasksRouter.get('/', requireAuth, requireRole('WAREHOUSE_OFFICER', 'PHARMACIST', 'ER_STAFF'), asyncHandler(async (req, res) => res.json(await kitsService.tasks(req.user!, req.query)))); // API-F3-009
kitTasksRouter.post('/:id/confirm', requireAuth, requireRole('WAREHOUSE_OFFICER', 'ER_STAFF'), idempotent(), asyncHandler(async (req, res) => res.json(await kitsService.confirmTask(req, req.params.id)))); // API-F3-010

export const kitStockRouter = Router();
kitStockRouter.get('/', requireAuth, requireRole('PHARMACIST', 'WAREHOUSE_OFFICER', 'ER_STAFF'), asyncHandler(async (req, res) => res.json(await kitsService.stock(req.user!)))); // API-F3-014
kitStockRouter.put('/:kitTypeId', requireAuth, requireRole('WAREHOUSE_OFFICER'), asyncHandler(async (req, res) => res.json(await kitsService.putStock(req, req.params.kitTypeId)))); // API-F3-015

const ruleReaders = requireRole('ER_STAFF', 'PHARMACIST', 'WAREHOUSE_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN');
export const presetKitsRouter = Router();
presetKitsRouter.get('/', requireAuth, ruleReaders, asyncHandler(async (_req, res) => res.json(await kitsService.presetKits())));
presetKitsRouter.put('/:kitTypeId', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => res.json(await kitsService.putPresetKit(req, req.params.kitTypeId))));

export const incidentRulesRouter = Router();
incidentRulesRouter.get('/', requireAuth, ruleReaders, asyncHandler(async (_req, res) => res.json(await kitsService.incidentRules())));
incidentRulesRouter.put('/:drugMasterId', requireAuth, requireRole('SYSTEM_ADMIN'), asyncHandler(async (req, res) => res.json(await kitsService.putIncidentRule(req, req.params.drugMasterId))));
