import type { Request, Response } from 'express';
import { oneOf, parsePage } from '../../core/pagination.js';
import { HttpError } from '../../middleware/httpError.js';
import { advanceStatus, syncEvents, uploadPhoto } from './transport.actions.js';
import { transportService } from './transport.service.js';
import { TRANSPORT_STATUSES } from './transport.types.js';
import type { Direction, TransportListQuery } from './transport.types.js';

function parseListQuery(raw: Record<string, unknown>): TransportListQuery {
  const page = parsePage(raw);
  const active = raw.active === undefined ? false : raw.active === 'true';
  if (raw.active !== undefined && raw.active !== 'true' && raw.active !== 'false') {
    throw new HttpError(400, 'INVALID_QUERY', 'active ต้องเป็น true หรือ false');
  }
  return {
    direction: oneOf<Direction>(raw.direction, ['all', 'in', 'out'], 'direction') ?? 'all',
    status: oneOf(raw.status, TRANSPORT_STATUSES, 'status'),
    active,
    ...page,
  };
}

export const transportController = {
  list: async (req: Request, res: Response): Promise<void> => {
    const data = await transportService.list(req.user!, parseListQuery(req.query));
    res.status(200).json({ ok: true, ...data });
  },
  status: async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await advanceStatus(req, req.params.id));
  },
  photos: async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await uploadPhoto(req, req.params.id));
  },
  sync: async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await syncEvents(req, req.params.id));
  },
  vehicles: async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ ok: true, items: await transportService.listVehicles(req.user!) });
  },
};
