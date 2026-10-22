/**
 * API-AD-003 `GET /audit-log` (+ `GET /audit-log/verify`, SYSTEM_ADMIN — not in openapi).
 *
 * `audit_log` is append-only and hash-chained by a DB trigger; this module only reads. Personal data
 * (ip / user agent) lives in `audit_log_context` and is joined for display. A HOSPITAL_ADMIN sees its own
 * hospital's rows plus changes made to that hospital by region-wide actors (e.g. SYSTEM_ADMIN edits).
 */
import type { Request } from 'express';
import { parsePage, toPage } from '../../core/pagination.js';
import { isUuid } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import type { AuditLogItemView } from './admin.types.js';

const SELECT = `
  SELECT a.id, a.occurred_at, a.actor_id, a.actor_role, a.hospital_id, a.action, a.entity_type, a.entity_id,
         a.before, a.after, a.reason, a.agent_run_id, a.request_id, a.prev_hash, a.row_hash,
         u.display_name AS actor_name, u.email AS actor_email,
         h.code AS hospital_code, h.name_th AS hospital_name,
         c.ip::text AS ip, c.user_agent
    FROM audit_log a
    LEFT JOIN app_user u ON u.id = a.actor_id
    LEFT JOIN hospital h ON h.id = a.hospital_id
    LEFT JOIN audit_log_context c ON c.audit_id = a.id`;

function view(row: Record<string, any>, includeContext: boolean): AuditLogItemView {
  return {
    id: String(row.id),
    occurredAt: new Date(row.occurred_at).toISOString(),
    actor: row.actor_id
      ? { id: row.actor_id, name: row.actor_name ?? row.actor_id, email: row.actor_email ?? '', role: row.actor_role ?? null }
      : null,
    hospital: row.hospital_id ? { id: row.hospital_id, code: row.hospital_code ?? null, name: row.hospital_name ?? null } : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    before: row.before,
    after: row.after,
    reason: row.reason,
    agentRunId: row.agent_run_id ?? null,
    requestId: row.request_id ?? null,
    prevHash: row.prev_hash ?? null,
    rowHash: row.row_hash,
    ...(includeContext ? { ip: row.ip ?? null, userAgent: row.user_agent ?? null } : {}),
  };
}

function dateBound(raw: unknown, name: string, endOfDay: boolean): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'INVALID_QUERY', `${name} ต้องเป็นวันที่ ISO`);
  const value = raw.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'INVALID_QUERY', `${name} ต้องเป็นวันที่ ISO`);
  if (dateOnly && endOfDay) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

function shortText(raw: unknown, name: string, max = 80): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > max) {
    throw new HttpError(400, 'INVALID_QUERY', `${name} ไม่ถูกต้อง`);
  }
  return raw.trim();
}

export class AuditService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const params: unknown[] = [];
    const where: string[] = [];

    if (user.hospitalId) {
      const n = params.push(user.hospitalId);
      where.push(`(a.hospital_id = $${n} OR (a.entity_type = 'hospital' AND a.entity_id = $${n}))`);
    } else if (raw.hospitalId !== undefined) {
      if (!isUuid(raw.hospitalId)) throw new HttpError(400, 'INVALID_QUERY', 'hospitalId ต้องเป็น UUID');
      where.push(`a.hospital_id = $${params.push(raw.hospitalId)}`);
    }

    const from = dateBound(raw.from, 'from', false);
    if (from) where.push(`a.occurred_at >= $${params.push(from)}`);
    const to = dateBound(raw.to, 'to', true);
    if (to) where.push(`a.occurred_at < $${params.push(to)}`);

    if (raw.actorId !== undefined) {
      if (!isUuid(raw.actorId)) throw new HttpError(400, 'INVALID_QUERY', 'actorId ต้องเป็น UUID');
      where.push(`a.actor_id = $${params.push(raw.actorId)}`);
    }
    const role = shortText(raw.role, 'role');
    if (role) where.push(`a.actor_role = $${params.push(role)}`);
    const action = shortText(raw.action, 'action');
    if (action) where.push(`a.action = $${params.push(action)}`);
    const entityType = shortText(raw.entityType, 'entityType');
    if (entityType) where.push(`a.entity_type = $${params.push(entityType)}`);
    if (raw.entityId !== undefined) {
      if (!isUuid(raw.entityId)) throw new HttpError(400, 'INVALID_QUERY', 'entityId ต้องเป็น UUID');
      where.push(`a.entity_id = $${params.push(raw.entityId)}`);
    }
    if (typeof raw.q === 'string' && raw.q.trim()) {
      const like = `%${raw.q.trim()}%`;
      const n = params.push(like);
      where.push(`(a.action ILIKE $${n} OR a.entity_type ILIKE $${n} OR COALESCE(a.reason, '') ILIKE $${n})`);
    }

    const includeContext = raw.includeContext !== 'false';
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `${SELECT} ${whereSql} ORDER BY a.occurred_at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, page.limit + 1, page.offset],
    );
    const slice = toPage(rows.rows, page);
    return { ok: true, items: slice.items.map((row) => view(row, includeContext)), nextCursor: slice.nextCursor };
  }

  /** JOB-15 on demand: 0 problems means the chain is intact (see `audit_chain_verify()` in db/schema.sql). */
  async verify(_req: Request) {
    const problems = await query<{ problems: string }>(`SELECT audit_chain_verify() AS problems`);
    const count = Number(problems.rows[0]?.problems ?? 0);
    return { ok: true, data: { problems: count, intact: count === 0, checkedAt: new Date().toISOString() } };
  }
}

export const auditService = new AuditService();
