import { Router } from 'express';
import type { Request, Response } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { withTransaction } from '../../db/tx.js';
import { query } from '../../db/client.js';
import { HttpError } from '../../middleware/httpError.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { config } from '../../config/env.js';
import {
  calculateRoute,
  getOrRefreshHospitalDistance,
  syncHospitalDistances,
} from './location.service.js';

export const locationRouter = Router();

/**
 * GET /api/v1/location/status
 * Check configuration of Amazon Location Service.
 */
locationRouter.get('/status', (req: Request, res: Response) => {
  const key = config.location.apiKey;
  const isConfigured = Boolean(key && key.trim().length > 0);
  const preview = isConfigured ? `${key.slice(0, 10)}...${key.slice(-6)}` : null;

  res.json({
    ok: true,
    data: {
      provider: 'Amazon Location Service v2',
      region: config.location.region,
      enabled: isConfigured,
      apiKeyPreview: preview,
    },
  });
});

/**
 * GET /api/v1/location/route
 * Calculates driving route between two points or two hospitals.
 * Query params:
 *   - fromHospitalId, toHospitalId (optional UUIDs)
 *   - originLon, originLat, destLon, destLat (optional floats)
 *   - live: 'true' (force live route computation)
 */
locationRouter.get('/route', async (req: Request, res: Response, next) => {
  try {
    const { fromHospitalId, toHospitalId, live } = req.query;
    const originLat = req.query.originLat;
    const originLon = req.query.originLon ?? req.query.originLng;
    const destLat = req.query.destLat;
    const destLon = req.query.destLon ?? req.query.destLng;

    if (fromHospitalId && toHospitalId) {
      const forceLive = live === 'true';
      const result = await withTransaction(async (client) => {
        return getOrRefreshHospitalDistance(client, String(fromHospitalId), String(toHospitalId), forceLive);
      });
      return res.json({ ok: true, data: result });
    }

    if (originLon && originLat && destLon && destLat) {
      const origin: [number, number] = [Number(originLon), Number(originLat)];
      const destination: [number, number] = [Number(destLon), Number(destLat)];

      if (origin.some(Number.isNaN) || destination.some(Number.isNaN)) {
        throw new HttpError(400, 'INVALID_COORDINATES', 'Coordinates must be valid numbers');
      }

      const result = await calculateRoute(origin, destination);
      return res.json({ ok: true, data: result });
    }

    throw new HttpError(
      400,
      'MISSING_PARAMS',
      'Provide either (fromHospitalId, toHospitalId) or (originLon, originLat, destLon, destLat)'
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/location/sync-matrix
 * Updates hospital_distance table with real-time driving distance from Amazon Location Service.
 * Restricted to SYSTEM_ADMIN and REGION_ADMIN.
 */
locationRouter.post(
  '/sync-matrix',
  requireAuth,
  requireRole('SYSTEM_ADMIN', 'REGION_ADMIN'),
  async (req: Request, res: Response, next) => {
    try {
      const ctx = auditContext(req);

      const result = await withTransaction(async (client) => {
        const syncResult = await syncHospitalDistances(client);
        await writeAudit(client, ctx, {
          action: 'SYNC_LOCATION_MATRIX',
          entityType: 'hospital_distance',
          after: syncResult,
        });
        return syncResult;
      });

      res.json({
        ok: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);
