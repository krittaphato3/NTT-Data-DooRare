import { query } from '../../db/client.js';
import { parsePgArray } from '../../db/helpers.js';
import type { AppUserEntity, LoginEventEntity, RoleAccountDemo } from './auth.types.js';
import type { ClientMeta } from '../../middleware/clientMeta.js';

export class AuthRepository {
  async findUserByEmail(email: string): Promise<AppUserEntity | null> {
    const text = `
      SELECT 
        u.*,
        h.code AS hospital_code,
        h.name_th AS hospital_name,
        r.code AS region_code,
        r.name_th AS region_name,
        coalesce(array_remove(array_agg(ur.role), NULL), '{}') AS additional_roles
      FROM app_user u
      LEFT JOIN hospital h ON h.id = u.hospital_id
      LEFT JOIN region r ON r.id = u.region_id
      LEFT JOIN app_user_role ur ON ur.user_id = u.id AND ur.role <> u.role
      WHERE lower(u.email) = lower($1)
      GROUP BY u.id, h.code, h.name_th, r.code, r.name_th
      LIMIT 1;
    `;
    const res = await query<AppUserEntity>(text, [email.trim()]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    row.additional_roles = parsePgArray(row.additional_roles);
    return row;
  }

  async findUserByIdPrefix(prefix: string): Promise<AppUserEntity | null> {
    const text = `
      SELECT 
        u.*,
        h.code AS hospital_code,
        h.name_th AS hospital_name,
        r.code AS region_code,
        r.name_th AS region_name,
        coalesce(array_remove(array_agg(ur.role), NULL), '{}') AS additional_roles
      FROM app_user u
      LEFT JOIN hospital h ON h.id = u.hospital_id
      LEFT JOIN region r ON r.id = u.region_id
      LEFT JOIN app_user_role ur ON ur.user_id = u.id AND ur.role <> u.role
      WHERE u.id::text LIKE $1 || '%' AND u.active = true
      GROUP BY u.id, h.code, h.name_th, r.code, r.name_th
      LIMIT 1;
    `;
    const res = await query<AppUserEntity>(text, [prefix.trim()]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    row.additional_roles = parsePgArray(row.additional_roles);
    return row;
  }

  async findUserById(id: string): Promise<AppUserEntity | null> {
    const text = `
      SELECT 
        u.*,
        h.code AS hospital_code,
        h.name_th AS hospital_name,
        r.code AS region_code,
        r.name_th AS region_name,
        coalesce(array_remove(array_agg(ur.role), NULL), '{}') AS additional_roles
      FROM app_user u
      LEFT JOIN hospital h ON h.id = u.hospital_id
      LEFT JOIN region r ON r.id = u.region_id
      LEFT JOIN app_user_role ur ON ur.user_id = u.id AND ur.role <> u.role
      WHERE u.id = $1
      GROUP BY u.id, h.code, h.name_th, r.code, r.name_th
      LIMIT 1;
    `;
    const res = await query<AppUserEntity>(text, [id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    row.additional_roles = parsePgArray(row.additional_roles);
    return row;
  }

  async recordLoginEvent(params: {
    userId: string | null;
    email: string;
    success: boolean;
    failureReason?: string | null;
    meta?: ClientMeta;
  }): Promise<number | null> {
    try {
      const text = `
        INSERT INTO login_event (
          user_id, email, occurred_at, success, failure_reason, ip, device, browser, user_agent
        )
        VALUES ($1, $2, now(), $3, $4, $5::inet, $6, $7, $8)
        RETURNING id;
      `;
      const safeIp =
        params.meta?.ip && params.meta.ip.match(/^[0-9.]+$/) ? params.meta.ip : '127.0.0.1';
      const res = await query(text, [
        params.userId || null,
        params.email,
        params.success,
        params.failureReason || null,
        safeIp,
        params.meta?.device || 'Desktop',
        params.meta?.browser || 'Web Browser',
        params.meta?.userAgent || 'Mozilla/5.0',
      ]);
      return res.rows[0]?.id || null;
    } catch (err: any) {
      console.warn('[recordLoginEvent warning]', err.message);
      return null;
    }
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    try {
      const text = `
        UPDATE app_user 
        SET last_login_at = now(), last_seen_at = now()
        WHERE id = $1;
      `;
      await query(text, [userId]);
    } catch (err: any) {
      console.warn('[updateUserLastLogin warning]', err.message);
    }
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    try {
      const text = `UPDATE app_user SET last_seen_at = now() WHERE id = $1;`;
      await query(text, [userId]);
    } catch (err: any) {
      console.warn('[updateUserLastSeen warning]', err.message);
    }
  }

  async getRoleDemoAccounts(): Promise<RoleAccountDemo[]> {
    const text = `
      SELECT DISTINCT ON (u.role)
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.mfa_enabled,
        h.code AS hospital_code,
        coalesce(h.name_th, 'เขตสุขภาพที่ 6') AS hospital_name,
        h.tier,
        coalesce(array_remove(array_agg(ur.role) OVER (PARTITION BY u.id), NULL), '{}') AS all_roles
      FROM app_user u
      LEFT JOIN hospital h ON h.id = u.hospital_id
      LEFT JOIN app_user_role ur ON ur.user_id = u.id
      WHERE u.active = true
      ORDER BY u.role, u.created_at ASC;
    `;
    const res = await query(text);
    return res.rows.map((row) => ({
      ...row,
      all_roles: parsePgArray(row.all_roles),
    }));
  }

  async getRecentLoginEvents(limit = 25, hospitalId?: string): Promise<LoginEventEntity[]> {
    try {
      let text = `
        SELECT 
          l.id,
          l.user_id,
          l.email,
          l.occurred_at,
          l.success,
          l.failure_reason,
          host(l.ip) as ip,
          l.device,
          l.browser,
          l.user_agent,
          u.display_name,
          u.role,
          coalesce(h.name_th, 'ส่วนกลาง เขต 6') as hospital_name
        FROM login_event l
        LEFT JOIN app_user u ON u.id = l.user_id
        LEFT JOIN hospital h ON h.id = u.hospital_id
      `;
      const params: any[] = [];
      if (hospitalId) {
        text += ` WHERE u.hospital_id = $1 `;
        params.push(hospitalId);
      }
      text += ` ORDER BY l.occurred_at DESC LIMIT $${params.length + 1}; `;
      params.push(limit);

      const res = await query<LoginEventEntity>(text, params);
      return res.rows;
    } catch (err: any) {
      console.warn('[getRecentLoginEvents warning]', err.message);
      return [];
    }
  }

  async getActiveOnlineUserCount(): Promise<number> {
    try {
      const text = `
        SELECT count(*) as count 
        FROM app_user 
        WHERE active = true AND last_seen_at >= now() - interval '15 minutes';
      `;
      const res = await query(text);
      return Number(res.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }
}

export const authRepository = new AuthRepository();
