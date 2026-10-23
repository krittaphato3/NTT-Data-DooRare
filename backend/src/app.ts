import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { clientMetaMiddleware } from './middleware/clientMeta.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { authController } from './modules/auth/auth.controller.js';
import { healthRouter } from './modules/health/health.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { returnsRouter } from './modules/returns/returns.routes.js';
import { alertsRouter } from './modules/alerts/alerts.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { hospitalsRouter } from './modules/hospitals/hospitals.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { centralItemsRouter, drugMasterRouter, hospitalDrugsRouter, kitTypesRouter } from './modules/catalog/catalog.routes.js';
import { forecastsRouter, forecastJobsRouter } from './modules/forecasts/forecasts.routes.js';
import { borrowLegsRouter } from './modules/borrow-legs/borrow-legs.routes.js';
import { borrowJobsRouter, borrowRequestsRouter, lenderQueueRouter } from './modules/borrow/borrow.routes.js';
import { allocationPlansRouter, expiryJobsRouter, nearExpiryRouter, poolRouter, repeatExpiryRouter } from './modules/expiry/expiry.routes.js';
import { reportsRouter, valueRouter } from './modules/value/value.routes.js';
import { transportRouter, vehiclesRouter } from './modules/transport/transport.routes.js';
import { emergencyLegsRouter, incidentRulesRouter, incidentsRouter, kitStockRouter, kitTasksRouter, presetKitsRouter } from './modules/incidents/incidents.routes.js';
import { agentRouter, configRouter } from './modules/admin/config.routes.js';
import { usersRouter } from './modules/admin/users.routes.js';
import { auditRouter } from './modules/admin/audit.routes.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '3mb' })); // transport photos arrive as base64 (<= 1.5 MB each)
app.use(clientMetaMiddleware);

// API v1 routes
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/forecasts', forecastsRouter); // API-F1a-001 / API-F1a-002 (read-only)
app.use('/api/v1/transport-tasks', transportRouter); // API-F2a-012
app.use('/api/v1/vehicles', vehiclesRouter);
app.use('/api/v1/return-obligations', returnsRouter); // API-XC-003 / -004 / -005
app.use('/api/v1/documents', documentsRouter); // API-XC-001 / API-XC-002
app.use('/api/v1/borrow-legs', borrowLegsRouter); // API-F1b-009 / -010 / -011
app.use('/api/v1/borrow-requests', borrowRequestsRouter); // API-F1b-001..007, -012, -013
app.use('/api/v1/lender-queue', lenderQueueRouter); // API-F1b-008
app.use('/api/v1/jobs', borrowJobsRouter); // JOB-04 trigger
app.use('/api/v1/jobs', expiryJobsRouter); // JOB-05..07 trigger
app.use('/api/v1/jobs', forecastJobsRouter); // scheduled F1 predict (every 3 days) trigger
app.use('/api/v1/near-expiry', nearExpiryRouter); // API-F2a-001..005
app.use('/api/v1/pool', poolRouter); // API-F2a-006
app.use('/api/v1/allocation-plans', allocationPlansRouter); // API-F2a-007..011
app.use('/api/v1/repeat-expiry', repeatExpiryRouter); // API-F2a-015 / -016
app.use('/api/v1/value', valueRouter); // API-XC-006
app.use('/api/v1/reports', reportsRouter); // API-AD-005
app.use('/api/v1/hospitals', hospitalsRouter); // API-PL-002 / -003 (+ admin create/update)
app.use('/api/v1/drug-master', drugMasterRouter); // API-F2b-006
app.use('/api/v1/central-items', centralItemsRouter); // API-F2b-007 (read)
app.use('/api/v1/hospital-drugs', hospitalDrugsRouter);
app.use('/api/v1/kit-types', kitTypesRouter); // API-F3-016
app.use('/api/v1/incidents', incidentsRouter); // API-F3-001..007, -011..013
app.use('/api/v1/emergency-legs', emergencyLegsRouter); // API-F3-008
app.use('/api/v1/kit-tasks', kitTasksRouter); // API-F3-009 / -010
app.use('/api/v1/kit-stock', kitStockRouter); // API-F3-014 / -015
app.use('/api/v1/preset-kits', presetKitsRouter); // F3 rule tables (not in openapi)
app.use('/api/v1/incident-rules', incidentRulesRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/notifications', notificationsRouter); // API-PL-004 / -005
app.use('/api/v1/alerts', alertsRouter); // API-F1a-005 / -006 / -007
app.use('/api/v1/dashboard', dashboardRouter); // API-PL-006
app.use('/api/v1/config', configRouter); // API-AD-001 / API-AD-002
app.use('/api/v1/agent', agentRouter); // API-AD-004 (kill switch)
app.use('/api/v1/users', usersRouter); // API-AD-006 / API-AD-007 + PATCH
app.use('/api/v1/audit-log', auditRouter); // API-AD-003 (+ /verify)
app.get('/api/v1/me', authController.getMe); // API-PL-001

// Global error handler
app.use(errorHandler);
