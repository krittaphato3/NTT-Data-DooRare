import { HttpError } from '../middleware/httpError.js';
import type { AuthSessionUser } from '../modules/auth/auth.types.js';
import { isUuid } from './validate.js';

/**
 * The hospital a read is about. A hospital-bound user always gets their own (SEC-002; a `hospitalId` query is ignored);
 * region-wide users (system admin) must name one.
 */
export function hospitalForRead(user: AuthSessionUser, requested: unknown): string {
  if (user.hospitalId) return user.hospitalId;
  if (!isUuid(requested)) throw new HttpError(400, 'INVALID_QUERY', 'ผู้ใช้ระดับเขตต้องระบุ hospitalId');
  return requested;
}

/** Region of the caller: their own region, or their hospital's. */
export const regionOf = (user: AuthSessionUser): { regionId: string | null; hospitalId: string | null } => ({
  regionId: user.regionId,
  hospitalId: user.hospitalId,
});
