/**
 * Audit trail (SEC audit, spec §13): every state change writes one `audit_log` row in the SAME transaction
 * as the change. The hash chain (`prev_hash` / `row_hash`) is maintained by the DB trigger `audit_log_chain`,
 * so callers never compute hashes. Personal data (ip, user agent) goes to `audit_log_context`, outside the chain.
 */
import net from 'node:net';
import type { Request } from 'express';
import type { Db } from '../db/tx.js';

export interface AuditActor {
  id: string | null;
  role: string | null;
  hospitalId: string | null;
}

export interface AuditContext {
  actor: AuditActor;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditEntry {
  /** Verb, e.g. `TRANSPORT_LOADED`, `CONFIG_UPDATED`. */
  action: string;
  /** Table / aggregate name, e.g. `transport_task`. */
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Why (waive, config change…). Part of the hash. */
  reason?: string | null;
  agentRunId?: string | null;
}

/** Builds the audit context of the signed-in caller (call after `requireAuth`). */
export function auditContext(req: Request): AuditContext {
  const ip = req.clientMeta?.ip ?? null;
  return {
    actor: {
      id: req.user?.id ?? null,
      role: req.user?.role ?? null,
      hospitalId: req.user?.hospitalId ?? null,
    },
    requestId: req.header('x-request-id') ?? null,
    ip: ip && net.isIP(ip) ? ip : null,
    userAgent: req.clientMeta?.userAgent || null,
  };
}

/** Context for jobs / system actions that have no HTTP request. */
export function systemAuditContext(actor: Partial<AuditActor> = {}): AuditContext {
  return {
    actor: { id: actor.id ?? null, role: actor.role ?? 'SYSTEM', hospitalId: actor.hospitalId ?? null },
    requestId: null,
    ip: null,
    userAgent: null,
  };
}

/** Appends one audit row; returns its id. Pass the transaction client so it commits with the change. */
export async function writeAudit(db: Db, ctx: AuditContext, entry: AuditEntry): Promise<number> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO audit_log
       (actor_id, actor_role, hospital_id, action, entity_type, entity_id, before, after, request_id, reason, agent_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
     RETURNING id`,
    [
      ctx.actor.id,
      ctx.actor.role,
      ctx.actor.hospitalId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      ctx.requestId,
      entry.reason ?? null,
      entry.agentRunId ?? null,
    ],
  );
  const id = Number(inserted.rows[0].id);
  if (ctx.ip || ctx.userAgent) {
    await db.query(`INSERT INTO audit_log_context (audit_id, ip, user_agent) VALUES ($1, $2, $3)`, [
      id,
      ctx.ip,
      ctx.userAgent,
    ]);
  }
  return id;
}
