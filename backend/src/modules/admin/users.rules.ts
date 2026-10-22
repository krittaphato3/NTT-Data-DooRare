/** Pure helpers for the user endpoints (API-AD-006 / -007 + PATCH /users/{id}). */
import { HttpError } from '../../middleware/httpError.js';
import type { UserStatus } from './admin.types.js';

export const ALL_ROLES = [
  'SYSTEM_ADMIN',
  'REGION_ADMIN',
  'HOSPITAL_ADMIN',
  'PHARMACIST',
  'PROCUREMENT_OFFICER',
  'WAREHOUSE_OFFICER',
  'ER_STAFF',
  'DRIVER',
  'DATA_ADMIN',
  'AUDITOR',
] as const;

/** Operational roles the separation-of-duties trigger refuses to combine with HOSPITAL_ADMIN. */
export const OPERATIONAL_ROLES = ['PHARMACIST', 'PROCUREMENT_OFFICER', 'WAREHOUSE_OFFICER', 'ER_STAFF', 'DRIVER'] as const;

/** Region-wide roles a HOSPITAL_ADMIN must never mint (mirrors ASSIGNABLE_ROLES in frontend/src/lib/rbac.ts). */
export const REGION_WIDE_ROLES = ['SYSTEM_ADMIN', 'REGION_ADMIN'] as const;

export const HOSPITAL_ASSIGNABLE_ROLES = [
  'HOSPITAL_ADMIN',
  ...OPERATIONAL_ROLES,
  'DATA_ADMIN',
  'AUDITOR',
] as const;

export const ONLINE_WINDOW_MINUTES = 15;

/** INVITED is derived: an active account that has never signed in (the schema has no status column). */
export function deriveStatus(active: boolean, lastLoginAt: Date | string | null): UserStatus {
  if (!active) return 'SUSPENDED';
  return lastLoginAt ? 'ACTIVE' : 'INVITED';
}

export function isOnline(lastSeenAt: Date | string | null, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MINUTES * 60_000;
}

export interface RoleSet {
  roles: string[];
  primaryRole: string;
}

/**
 * Validates a requested role set against the DB `role_code` enum, the caller's grant rights and the
 * separation-of-duties trigger (validated here so the trigger never surfaces as a 500).
 */
export function validateRoleSet(rawRoles: unknown, rawPrimary: unknown, assignable: readonly string[]): RoleSet {
  if (!Array.isArray(rawRoles) || rawRoles.length === 0) {
    throw new HttpError(400, 'VALIDATION', 'ต้องระบุบทบาทอย่างน้อย 1 บทบาท');
  }
  const requested = rawRoles.map((role) => {
    if (typeof role !== 'string') throw new HttpError(400, 'VALIDATION', 'บทบาทต้องเป็นข้อความ');
    return role.trim().toUpperCase();
  });
  const roles = Array.from(new Set(requested));
  for (const role of roles) {
    if (!(ALL_ROLES as readonly string[]).includes(role)) throw new HttpError(400, 'VALIDATION', `ไม่พบบทบาท ${role}`);
    if (!assignable.includes(role)) {
      throw new HttpError(403, 'FORBIDDEN', `ไม่มีสิทธิ์กำหนดบทบาท ${role} (ต้องเป็นผู้ดูแลระบบกลาง)`);
    }
  }

  const primaryCandidate = rawPrimary === undefined || rawPrimary === null ? roles[0] : String(rawPrimary).trim().toUpperCase();
  if (!roles.includes(primaryCandidate)) {
    throw new HttpError(400, 'VALIDATION', 'primaryRole ต้องอยู่ในรายการ roles');
  }

  if (roles.includes('SYSTEM_ADMIN') || roles.includes('AUDITOR')) {
    if (roles.length > 1) {
      throw new HttpError(422, 'ROLE_CONFLICT', 'บัญชี SYSTEM_ADMIN และ AUDITOR ต้องมีบทบาทเดียวเท่านั้น');
    }
  }
  if (roles.includes('HOSPITAL_ADMIN') && roles.some((role) => (OPERATIONAL_ROLES as readonly string[]).includes(role))) {
    throw new HttpError(422, 'ROLE_CONFLICT', 'บทบาท HOSPITAL_ADMIN รวมกับบทบาทปฏิบัติการไม่ได้ (separation of duties)');
  }

  return { roles, primaryRole: primaryCandidate };
}

export function diffRoles(current: string[], next: string[]): { added: string[]; removed: string[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  return {
    added: next.filter((role) => !currentSet.has(role)),
    removed: current.filter((role) => !nextSet.has(role)),
  };
}

/**
 * Would this change remove the last active holder of `adminRole` in the scope?
 * `otherActiveAdmins` must exclude the target account.
 */
export function wouldDropLastAdmin(input: {
  otherActiveAdmins: number;
  targetActive: boolean;
  targetIsAdmin: boolean;
  nextActive: boolean;
  nextRoles: string[];
  adminRole: string;
}): boolean {
  const keepsAdmin = input.nextActive && input.nextRoles.includes(input.adminRole);
  const isAdminNow = input.targetActive && input.targetIsAdmin;
  return isAdminNow && !keepsAdmin && input.otherActiveAdmins === 0;
}
