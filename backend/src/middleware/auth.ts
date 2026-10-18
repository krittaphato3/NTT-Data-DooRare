import type { NextFunction, Request, Response } from 'express';
import { authService } from '../modules/auth/auth.service.js';
import type { AuthSessionUser } from '../modules/auth/auth.types.js';
import { HttpError } from './httpError.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`: the signed-in user resolved from the Bearer token. */
      user?: AuthSessionUser;
    }
  }
}

const bearer = (req: Request): string => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

/**
 * 401 unless the request carries a valid session token. Attaches `req.user` (id, role, hospitalId…).
 * Demo auth: the token is looked up in `authService`'s in-memory sessions; swap the lookup inside the
 * service (e.g. for a JWT) and every route that uses this middleware keeps working unchanged.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearer(req);
    const user = token ? await authService.getSessionUser(token) : null;
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 403 unless the signed-in user holds at least one of `roles` (primary or additional role, spec: a user may
 * hold several roles in the same hospital). Use after `requireAuth`.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(new HttpError(401, 'UNAUTHORIZED', 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ'));
    if (!roles.some((r) => user.allRoles.includes(r))) {
      return next(new HttpError(403, 'FORBIDDEN', `ต้องเป็น ${roles.join(' หรือ ')}`));
    }
    next();
  };
}

/**
 * The hospital every query must be filtered by (SEC-002: users see only their own hospital).
 * Always take it from the session, never from the request body/query. `null` means the user has no
 * hospital (region-wide roles such as SYSTEM_ADMIN / AUDITOR), so the caller decides what they may see.
 */
export function scopeHospitalId(req: Request): string | null {
  return req.user?.hospitalId ?? null;
}
