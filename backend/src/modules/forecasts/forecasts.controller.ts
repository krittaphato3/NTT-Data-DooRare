import type { Request, Response, NextFunction } from 'express';
import { scopeHospitalId } from '../../middleware/auth.js';
import { forecastsService, ForecastsService } from './forecasts.service.js';

export class ForecastsController {
  constructor(private service: ForecastsService = forecastsService) {}

  /** API-F1a-001 — latest forecast rows, filterable by hospital / drug / VED / ABC. */
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.list(req.query as Record<string, unknown>, scopeHospitalId(req));
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  };

  /** API-F1a-002 — one series: latest row + stored history and backtest (empty when only JSON exists). */
  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.detail(
        req.params.hospitalDrugId,
        req.query as Record<string, unknown>,
        scopeHospitalId(req),
      );
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  };
}

export const forecastsController = new ForecastsController();
