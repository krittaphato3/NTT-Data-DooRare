/**
 * API-AD-006 `GET /users`, API-AD-007 `POST /users` and `PATCH /users/{id}` (§4.1 — edit / deactivate).
 *
 * Scope: HOSPITAL_ADMIN only ever sees and edits its own hospital and can never mint SYSTEM_ADMIN /
 * REGION_ADMIN; SYSTEM_ADMIN sees every account. Accounts are never deleted (DB trigger), only
 * deactivated. INVITED is derived (active + never signed in) because `app_user` has no status column.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, isUuid, uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import type { UserView } from './admin.types.js';
import {
  ALL_ROLES,
  HOSPITAL_ASSIGNABLE_ROLES,
  REGION_WIDE_ROLES,
  deriveStatus,
  diffRoles,
  isOnline,
  validateRoleSet,
  wouldDropLastAdmin,
} from './users.rules.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SELECT = `
  SELECT u.id, u.email, u.display_name, u.phone, u.active, u.mfa_enabled, u.last_login_at, u.last_seen_at, u.created_at,
         u.role::text AS primary_role, u.hospital_id, u.region_id,
         COALESCE((SELECT array_agg(ur.role::text ORDER BY ur.role::text) FROM app_user_role ur WHERE ur.user_id = u.id), '{}') AS roles,
         (SELECT count(*) FROM login_event le WHERE le.user_id = u.id)::int AS login_count,
         h.code AS hospital_code, h.name_th AS hospital_name,
         r.code AS region_code, r.name_th AS region_name
    FROM app_user u
    LEFT JOIN hospital h ON h.id = u.hospital_id
    LEFT JOIN region r ON r.id = u.region_id`;

function view(row: Record<string, any>): UserView {
  const roles: string[] = (Array.isArray(row.roles) ? row.roles : []).map(String);
  const primary = String(row.primary_role);
  const ordered = [primary, ...roles.filter((role) => role !== primary)];
  return {
    id: row.id,
    name: row.display_name,
    email: row.email,
    phone: row.phone,
    roles: ordered.map((code) => ({ code, isPrimary: code === primary })),
    primaryRole: primary,
    status: deriveStatus(row.active, row.last_login_at),
    active: row.active,
    mfaEnabled: row.mfa_enabled,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    isOnline: isOnline(row.last_seen_at),
    createdAt: new Date(row.created_at).toISOString(),
    loginCount: Number(row.login_count ?? 0),
    hospital: row.hospital_id ? { id: row.hospital_id, code: row.hospital_code, name: row.hospital_name } : null,
    region: row.region_id ? { id: row.region_id, code: row.region_code, name: row.region_name } : null,
  };
}

function textField(body: Record<string, unknown>, key: string, max: number, required = false): string | null | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, 'VALIDATION', `ต้องระบุ ${key}`);
    return undefined;
  }
  if (value === null || value === '') {
    if (required) throw new HttpError(400, 'VALIDATION', `${key} ห้ามว่าง`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, 'VALIDATION', `${key} ต้องเป็นข้อความ`);
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (required) throw new HttpError(400, 'VALIDATION', `${key} ห้ามว่าง`);
    return null;
  }
  if (trimmed.length > max) throw new HttpError(400, 'VALIDATION', `${key} ยาวเกิน ${max} ตัวอักษร`);
  return trimmed;
}

function boolField(body: Record<string, unknown>, key: string): boolean | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== 'boolean') throw new HttpError(400, 'VALIDATION', `${key} ต้องเป็น true/false`);
  return body[key] as boolean;
}

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

async function hospitalRegion(db: import('pg').PoolClient, hospitalId: string) {
  const row = (await db.query(`SELECT id, region_id FROM hospital WHERE id = $1`, [hospitalId])).rows[0];
  if (!row) throw new HttpError(400, 'VALIDATION', 'ไม่พบโรงพยาบาลที่ระบุ');
  return { hospitalId: row.id as string, regionId: row.region_id as string };
}

async function assertRegionExists(db: import('pg').PoolClient, regionId: string) {
  const row = (await db.query(`SELECT 1 FROM region WHERE id = $1`, [regionId])).rows[0];
  if (!row) throw new HttpError(400, 'VALIDATION', 'ไม่พบเขตสุขภาพที่ระบุ');
}

export class UsersService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const params: unknown[] = [];
    const where: string[] = [];

    if (user.hospitalId) {
      // SEC-002: hospital-bound admins never see another hospital nor region-wide accounts.
      where.push(`u.hospital_id = $${params.push(user.hospitalId)}`);
      where.push(
        `NOT EXISTS (SELECT 1 FROM app_user_role x WHERE x.user_id = u.id AND x.role IN ('SYSTEM_ADMIN','REGION_ADMIN'))`,
      );
    } else {
      if (raw.hospitalId !== undefined) {
        if (!isUuid(raw.hospitalId)) throw new HttpError(400, 'INVALID_QUERY', 'hospitalId ต้องเป็น UUID');
        where.push(`u.hospital_id = $${params.push(raw.hospitalId)}`);
      }
      if (raw.regionId !== undefined) {
        if (!isUuid(raw.regionId)) throw new HttpError(400, 'INVALID_QUERY', 'regionId ต้องเป็น UUID');
        where.push(`u.region_id = $${params.push(raw.regionId)}`);
      }
    }

    if (raw.role !== undefined) {
      const role = oneOf(raw.role, ALL_ROLES, 'role');
      where.push(
        `EXISTS (SELECT 1 FROM app_user_role r WHERE r.user_id = u.id AND r.role = $${params.push(role)}::role_code)`,
      );
    }

    const status = oneOf(raw.status, ['ACTIVE', 'INVITED', 'SUSPENDED'] as const, 'status');
    if (status === 'SUSPENDED') where.push(`NOT u.active`);
    else if (status === 'INVITED') where.push(`u.active AND u.last_login_at IS NULL`);
    else if (status === 'ACTIVE') where.push(`u.active AND u.last_login_at IS NOT NULL`);

    if (raw.active !== undefined) {
      if (raw.active !== 'true' && raw.active !== 'false') throw new HttpError(400, 'INVALID_QUERY', 'active ต้องเป็น true/false');
      where.push(`u.active = $${params.push(raw.active === 'true')}`);
    }

    if (typeof raw.q === 'string' && raw.q.trim()) {
      const like = `%${raw.q.trim()}%`;
      const n = params.push(like);
      where.push(`(u.display_name ILIKE $${n} OR u.email ILIKE $${n} OR COALESCE(u.phone, '') ILIKE $${n})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `${SELECT} ${whereSql} ORDER BY u.created_at DESC, u.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, page.limit + 1, page.offset],
    );
    const slice = toPage(rows.rows, page);
    return { ok: true, items: slice.items.map(view), nextCursor: slice.nextCursor };
  }

  /** Invite a user: no password and no e-mail is sent; the account stays INVITED until its first login. */
  async create(req: Request) {
    const user = req.user!;
    const body = bodyObject(req.body ?? {});
    const reason = textField(body, 'reason', 500, true) as string;
    const name = textField(body, 'name', 200, true) as string;
    const rawEmail = textField(body, 'email', 200, true) as string;
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'VALIDATION', 'รูปแบบอีเมลไม่ถูกต้อง');
    const phone = textField(body, 'phone', 40);
    const mfaEnabled = boolField(body, 'mfaEnabled') ?? false;
    const active = boolField(body, 'active') ?? true;

    const isSystemAdmin = user.allRoles.includes('SYSTEM_ADMIN');
    const assignable = isSystemAdmin ? ALL_ROLES : HOSPITAL_ASSIGNABLE_ROLES;
    const requestedRoles = body.roles !== undefined ? body.roles : body.role !== undefined ? [body.role] : undefined;
    const { roles, primaryRole } = validateRoleSet(requestedRoles, body.primaryRole, assignable);

    if (!isSystemAdmin) {
      if (!user.hospitalId) throw new HttpError(400, 'VALIDATION', 'ผู้ดูแลโรงพยาบาลต้องผูกกับโรงพยาบาล');
      if (body.hospitalId !== undefined && body.hospitalId !== user.hospitalId) {
        throw new HttpError(403, 'FORBIDDEN', 'สร้างบัญชีได้เฉพาะในโรงพยาบาลของตนเอง');
      }
    }

    let hospitalId = isSystemAdmin ? ((body.hospitalId as string | undefined) ?? user.hospitalId) : user.hospitalId;
    let regionId = isSystemAdmin ? ((body.regionId as string | undefined) ?? user.regionId) : user.regionId;
    if (hospitalId !== null && hospitalId !== undefined && !isUuid(hospitalId)) throw new HttpError(400, 'VALIDATION', 'hospitalId ต้องเป็น UUID');
    if (regionId !== null && regionId !== undefined && !isUuid(regionId)) throw new HttpError(400, 'VALIDATION', 'regionId ต้องเป็น UUID');

    const cognitoSub = `local:${crypto.randomUUID()}`;

    return withTransaction(async (client) => {
      if (hospitalId) {
        const target = await hospitalRegion(client, hospitalId);
        if (!regionId) regionId = target.regionId;
      } else if (regionId) {
        await assertRegionExists(client, regionId);
      }
      if (!hospitalId && !regionId && !['SYSTEM_ADMIN', 'AUDITOR'].includes(primaryRole)) {
        throw new HttpError(400, 'VALIDATION', 'บัญชีนี้ต้องผูกกับโรงพยาบาลหรือเขตสุขภาพ');
      }

      let id: string;
      try {
        id = (
          await client.query<{ id: string }>(
            `INSERT INTO app_user (cognito_sub, email, display_name, role, hospital_id, region_id, phone, mfa_enabled, active)
             VALUES ($1, $2, $3, $4::role_code, $5, $6, $7, $8, $9)
             RETURNING id`,
            [cognitoSub, email, name, primaryRole, hospitalId ?? null, regionId ?? null, phone ?? null, mfaEnabled, active],
          )
        ).rows[0].id;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'CONFLICT', 'อีเมลนี้ถูกใช้งานแล้ว');
        throw error;
      }

      await client.query(
        `INSERT INTO app_user_role (user_id, role, granted_by)
         SELECT $1, r::role_code, $2 FROM unnest($3::text[]) AS r
         ON CONFLICT DO NOTHING`,
        [id, user.id, roles],
      );

      const row = (await client.query(`${SELECT} WHERE u.id = $1`, [id])).rows[0];
      await writeAudit(client, auditContext(req), {
        action: 'USER_CREATED',
        entityType: 'app_user',
        entityId: id,
        after: { name, email, roles, primaryRole, hospitalId: hospitalId ?? null, regionId: regionId ?? null, active, mfaEnabled },
        reason,
      });
      return { ok: true, id, data: view(row) };
    });
  }

  /** Partial update: profile, roles/primaryRole, hospital/region (SA only), active (deactivate / reactivate). */
  async update(req: Request, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const user = req.user!;
    const body = bodyObject(req.body ?? {});
    const isSystemAdmin = user.allRoles.includes('SYSTEM_ADMIN');

    return withTransaction(async (client) => {
      const target = (await client.query(`${SELECT} WHERE u.id = $1 FOR UPDATE OF u`, [id])).rows[0];
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');

      const targetRoles: string[] = (Array.isArray(target.roles) ? target.roles : []).map(String);
      if (!isSystemAdmin) {
        const outOfScope = !user.hospitalId || target.hospital_id !== user.hospitalId;
        const regionWide = targetRoles.some((role) => (REGION_WIDE_ROLES as readonly string[]).includes(role));
        if (outOfScope || regionWide) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
      }

      const name = textField(body, 'name', 200);
      if (name === null) throw new HttpError(400, 'VALIDATION', 'name ห้ามว่าง');
      const rawEmail = textField(body, 'email', 200);
      let email: string | null | undefined;
      if (rawEmail !== undefined) {
        if (rawEmail === null) throw new HttpError(400, 'VALIDATION', 'email ห้ามว่าง');
        email = normalizeEmail(rawEmail);
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'VALIDATION', 'รูปแบบอีเมลไม่ถูกต้อง');
      }
      const phone = textField(body, 'phone', 40);
      const mfaEnabled = boolField(body, 'mfaEnabled');
      const active = boolField(body, 'active');

      const assignable = isSystemAdmin ? ALL_ROLES : HOSPITAL_ASSIGNABLE_ROLES;
      const hasRoleChange = body.roles !== undefined || body.primaryRole !== undefined;
      let nextRoles = targetRoles;
      let nextPrimary = String(target.primary_role);
      if (hasRoleChange) {
        const candidateRoles = body.roles !== undefined ? body.roles : targetRoles;
        const candidatePrimary =
          body.primaryRole !== undefined
            ? body.primaryRole
            : targetRoles.includes(nextPrimary)
              ? nextPrimary
              : undefined;
        const validated = validateRoleSet(candidateRoles, candidatePrimary, assignable);
        nextRoles = validated.roles;
        nextPrimary = validated.primaryRole;
      }

      let nextHospital = target.hospital_id as string | null;
      let nextRegion = target.region_id as string | null;
      let scopeChanged = false;
      if (body.hospitalId !== undefined) {
        if (body.hospitalId !== null && !isUuid(body.hospitalId)) throw new HttpError(400, 'VALIDATION', 'hospitalId ต้องเป็น UUID');
        if (!isSystemAdmin && body.hospitalId !== target.hospital_id) {
          throw new HttpError(403, 'FORBIDDEN', 'ย้ายบัญชีออกจากโรงพยาบาลของตนเองไม่ได้');
        }
        nextHospital = (body.hospitalId as string | null) ?? null;
        scopeChanged = scopeChanged || nextHospital !== target.hospital_id;
      }
      if (body.regionId !== undefined) {
        if (body.regionId !== null && !isUuid(body.regionId)) throw new HttpError(400, 'VALIDATION', 'regionId ต้องเป็น UUID');
        if (!isSystemAdmin) throw new HttpError(403, 'FORBIDDEN', 'แก้ไขเขตสุขภาพของบัญชีไม่ได้');
        nextRegion = (body.regionId as string | null) ?? null;
        scopeChanged = scopeChanged || nextRegion !== target.region_id;
      }
      if (scopeChanged && nextHospital) {
        const hospital = await hospitalRegion(client, nextHospital);
        if (body.regionId === undefined) nextRegion = hospital.regionId;
      }
      if (scopeChanged && nextRegion) await assertRegionExists(client, nextRegion);
      if (!nextHospital && !nextRegion && !['SYSTEM_ADMIN', 'AUDITOR'].includes(nextPrimary)) {
        throw new HttpError(400, 'VALIDATION', 'บัญชีนี้ต้องผูกกับโรงพยาบาลหรือเขตสุขภาพ');
      }

      const nextActive = active ?? target.active;
      const statusChanged = nextActive !== target.active;
      const rolesChanged =
        hasRoleChange &&
        (nextPrimary !== target.primary_role ||
          diffRoles(targetRoles, nextRoles).added.length > 0 ||
          diffRoles(targetRoles, nextRoles).removed.length > 0);

      const reason = textField(body, 'reason', 500);
      if ((rolesChanged || statusChanged || scopeChanged) && !reason) {
        throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลในการเปลี่ยนบทบาท สถานะ หรือขอบเขตบัญชี (reason)');
      }

      // Self-lockout: never let an admin deactivate or demote their own account out of its admin role.
      if (target.id === user.id) {
        if (!nextActive) throw new HttpError(409, 'SELF_LOCKOUT', 'ปิดบัญชีของตนเองไม่ได้');
        if (targetRoles.includes('SYSTEM_ADMIN') && !nextRoles.includes('SYSTEM_ADMIN')) {
          throw new HttpError(409, 'SELF_LOCKOUT', 'ถอดบทบาท SYSTEM_ADMIN ของตนเองไม่ได้');
        }
      }

      // Last-admin safeguard (rbac §5.5, kept because it does not conflict with the spec).
      if (targetRoles.includes('HOSPITAL_ADMIN') && target.hospital_id) {
        const others = await client.query<{ n: number }>(
          `SELECT count(DISTINCT u.id)::int AS n
             FROM app_user u JOIN app_user_role r ON r.user_id = u.id
            WHERE u.id <> $1 AND u.active AND u.hospital_id = $2 AND r.role = 'HOSPITAL_ADMIN'`,
          [id, target.hospital_id],
        );
        if (
          wouldDropLastAdmin({
            otherActiveAdmins: Number(others.rows[0]?.n ?? 0),
            targetActive: target.active,
            targetIsAdmin: true,
            nextActive,
            nextRoles,
            adminRole: 'HOSPITAL_ADMIN',
          })
        ) {
          throw new HttpError(409, 'LAST_ADMIN', 'ต้องมีผู้ดูแลโรงพยาบาลที่ใช้งานอยู่อย่างน้อย 1 บัญชี');
        }
      }
      if (targetRoles.includes('SYSTEM_ADMIN')) {
        const others = await client.query<{ n: number }>(
          `SELECT count(DISTINCT u.id)::int AS n
             FROM app_user u JOIN app_user_role r ON r.user_id = u.id
            WHERE u.id <> $1 AND u.active AND r.role = 'SYSTEM_ADMIN'`,
          [id],
        );
        if (
          wouldDropLastAdmin({
            otherActiveAdmins: Number(others.rows[0]?.n ?? 0),
            targetActive: target.active,
            targetIsAdmin: true,
            nextActive,
            nextRoles,
            adminRole: 'SYSTEM_ADMIN',
          })
        ) {
          throw new HttpError(409, 'LAST_ADMIN', 'ต้องมีผู้ดูแลระบบกลางที่ใช้งานอยู่อย่างน้อย 1 บัญชี');
        }
      }

      const profileChanged =
        (name !== undefined && name !== target.display_name) ||
        (email !== undefined && email !== target.email) ||
        (phone !== undefined && phone !== target.phone) ||
        (mfaEnabled !== undefined && mfaEnabled !== target.mfa_enabled);

      try {
        await client.query(
          `UPDATE app_user
              SET display_name = $2, email = $3, phone = $4, mfa_enabled = $5, active = $6,
                  role = $7::role_code, hospital_id = $8, region_id = $9
            WHERE id = $1`,
          [
            id,
            name ?? target.display_name,
            email ?? target.email,
            phone === undefined ? target.phone : phone,
            mfaEnabled ?? target.mfa_enabled,
            nextActive,
            nextPrimary,
            nextHospital,
            nextRegion,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'CONFLICT', 'อีเมลนี้ถูกใช้งานแล้ว');
        throw error;
      }

      // Role membership diff. When the primary role changes the DB trigger already removed the old primary row.
      const afterTrigger = new Set(targetRoles);
      if (nextPrimary !== target.primary_role) {
        afterTrigger.delete(String(target.primary_role));
        afterTrigger.add(nextPrimary);
      }
      const removed = [...afterTrigger].filter((role) => !nextRoles.includes(role));
      const added = nextRoles.filter((role) => !afterTrigger.has(role));
      if (removed.length) {
        await client.query(`DELETE FROM app_user_role WHERE user_id = $1 AND role = ANY($2::role_code[])`, [id, removed]);
      }
      if (added.length) {
        await client.query(
          `INSERT INTO app_user_role (user_id, role, granted_by)
           SELECT $1, r::role_code, $2 FROM unnest($3::text[]) AS r
           ON CONFLICT DO NOTHING`,
          [id, user.id, added],
        );
      }

      const ctx = auditContext(req);
      if (rolesChanged) {
        await writeAudit(client, ctx, {
          action: 'USER_ROLES_CHANGED',
          entityType: 'app_user',
          entityId: id,
          before: { roles: targetRoles, primaryRole: target.primary_role },
          after: { roles: nextRoles, primaryRole: nextPrimary },
          reason,
        });
      }
      if (statusChanged) {
        await writeAudit(client, ctx, {
          action: nextActive ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
          entityType: 'app_user',
          entityId: id,
          before: { active: target.active },
          after: { active: nextActive },
          reason,
        });
      }
      if (profileChanged || scopeChanged) {
        await writeAudit(client, ctx, {
          action: 'USER_UPDATED',
          entityType: 'app_user',
          entityId: id,
          before: {
            name: target.display_name,
            email: target.email,
            phone: target.phone,
            mfaEnabled: target.mfa_enabled,
            hospitalId: target.hospital_id,
            regionId: target.region_id,
          },
          after: {
            name: name ?? target.display_name,
            email: email ?? target.email,
            phone: phone === undefined ? target.phone : phone,
            mfaEnabled: mfaEnabled ?? target.mfa_enabled,
            hospitalId: nextHospital,
            regionId: nextRegion,
          },
          reason,
        });
      }

      const row = (await client.query(`${SELECT} WHERE u.id = $1`, [id])).rows[0];
      return { ok: true, id, data: view(row) };
    });
  }
}

export const usersService = new UsersService();
