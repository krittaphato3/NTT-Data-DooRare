/** Stock alert queue (API-F1a-005), acknowledge (-006) and snooze (-007). Alerts are produced by `alerts.evaluate.ts`. */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { hospitalForRead } from '../../core/scope.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'LINKED_TO_REQUEST', 'SNOOZED', 'RESOLVED', 'AUTO_CLOSED'] as const;
const ACTIVE = ['OPEN', 'ACKNOWLEDGED', 'LINKED_TO_REQUEST', 'SNOOZED'];
const TYPES = ['LOW_STOCK', 'OVERSTOCK', 'DATA_STALE', 'LOW_CONFIDENCE', 'ORDER_AHEAD', 'ORDER_EARLIER', 'MIN_MAX'] as const;
const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
const SNOOZE_MAX_HOURS = 24 * 7;

const SELECT = `
  SELECT a.id, a.type::text AS type, a.granularity::text AS granularity, a.severity::text AS severity, a.status::text AS status,
         a.stock_qty::float8 AS stock_qty, a.incoming_qty::float8 AS incoming_qty, a.days_cover::float8 AS days_cover,
         a.suggested_borrow_qty::float8 AS suggested_borrow_qty, a.snoozed_until, a.created_at, a.updated_at, a.version, a.hospital_id,
         hd.id AS hd_id, hd.local_code, hd.local_name, hd.local_unit, hd.ved::text AS ved, hd.abc::text AS abc,
         ${DRUG_NAME} AS drug_name, dm.base_unit, COALESCE(dm.is_cold_chain, false) AS cold_chain,
         f.p50::float8 AS p50, f.p90::float8 AS p90, f.p95::float8 AS p95, f.total_target::float8 AS total_target, f.rop::float8 AS rop,
         f.u_per_day::float8 AS u_per_day, f.method::text AS method, f.confidence_flag, f.lead_time_days::float8 AS lead_time_days,
         br.id AS request_id, br.request_no, br.status::text AS request_status
    FROM stock_alert a
    JOIN hospital_drug hd ON hd.id = a.hospital_drug_id
    LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
    LEFT JOIN forecast_result f ON f.id = a.forecast_result_id
    LEFT JOIN LATERAL (SELECT id, request_no, status FROM borrow_request WHERE stock_alert_id = a.id ORDER BY created_at DESC LIMIT 1) br ON true`;

const view = (r: Record<string, any>) => ({
  id: r.id,
  type: r.type,
  granularity: r.granularity,
  severity: r.severity,
  status: r.status,
  version: Number(r.version),
  hospitalDrug: { id: r.hd_id, localCode: r.local_code, localName: r.local_name, localUnit: r.local_unit, ved: r.ved, abc: r.abc },
  drugName: r.drug_name,
  baseUnit: r.base_unit,
  coldChain: r.cold_chain,
  stockQty: r.stock_qty,
  incomingQty: r.incoming_qty,
  daysCover: r.days_cover,
  suggestedBorrowQty: r.suggested_borrow_qty,
  forecast: r.method
    ? { method: r.method, p50: r.p50, p90: r.p90, p95: r.p95, totalTarget: r.total_target, rop: r.rop, uPerDay: r.u_per_day, leadTimeDays: r.lead_time_days, confidenceFlag: r.confidence_flag }
    : null,
  request: r.request_id ? { id: r.request_id, requestNo: r.request_no, status: r.request_status } : null,
  snoozedUntil: r.snoozed_until ? new Date(r.snoozed_until).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export class AlertsService {
  /** Queue order (BR-F1a-011 / FR-F1a-009): V -> E -> D, then ABC value (A first), then fewest days of cover. */
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const params: unknown[] = [hospitalId];
    const where = ['a.hospital_id = $1'];
    const statusParam = typeof raw.status === 'string' ? raw.status : 'active';
    const statuses = statusParam === 'active' ? ACTIVE : statusParam === 'all' ? null : statusParam.split(',');
    if (statuses) {
      for (const s of statuses) if (!(STATUSES as readonly string[]).includes(s)) throw new HttpError(400, 'INVALID_QUERY', `status ไม่ถูกต้อง: ${s}`);
      where.push(`a.status::text = ANY($${params.push(statuses)}::text[])`);
    }
    const type = oneOf(raw.type, TYPES, 'type');
    if (type) where.push(`a.type = $${params.push(type)}::alert_type`);
    const granularity = oneOf(raw.granularity, ['WEEK', 'MONTH'] as const, 'granularity');
    if (granularity) where.push(`a.granularity = $${params.push(granularity)}::forecast_granularity`);
    const ved = oneOf(raw.ved, ['V', 'E', 'D'] as const, 'ved');
    if (ved) where.push(`hd.ved = $${params.push(ved)}::ved_class`);
    if (typeof raw.q === 'string' && raw.q.trim()) {
      params.push(`%${raw.q.trim()}%`);
      where.push(`(hd.local_code ILIKE $${params.length} OR hd.local_name ILIKE $${params.length})`);
    }
    const whereSql = where.join(' AND ');
    const listParams = [...params, page.limit + 1, page.offset];
    const [rows, counts] = await Promise.all([
      query(
        `${SELECT} WHERE ${whereSql}
          ORDER BY CASE hd.ved WHEN 'V' THEN 0 WHEN 'E' THEN 1 ELSE 2 END, CASE hd.abc WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END,
                   a.days_cover NULLS LAST, a.created_at DESC, a.id
          LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams,
      ),
      query(
        `SELECT a.status::text AS status, a.severity::text AS severity, count(*)::int AS n FROM stock_alert a
          WHERE a.hospital_id = $1 AND a.status::text = ANY($2::text[]) GROUP BY 1, 2`,
        [hospitalId, ACTIVE],
      ),
    ]);
    const slice = toPage(rows.rows, page);
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const c of counts.rows) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + c.n;
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + c.n;
    }
    return {
      ok: true,
      items: slice.items.map(view),
      nextCursor: slice.nextCursor,
      meta: { active: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, bySeverity },
    };
  }

  private async loadForUpdate(client: import('pg').PoolClient, user: AuthSessionUser, rawId: string, version: number | undefined) {
    const id = uuidParam(rawId, 'id');
    const alert = (await client.query(`SELECT id, hospital_id, status::text AS status, version FROM stock_alert WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!alert || !user.hospitalId || alert.hospital_id !== user.hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบการแจ้งเตือน');
    if (version !== undefined && version !== Number(alert.version)) {
      throw new HttpError(409, 'VERSION_CONFLICT', 'การแจ้งเตือนถูกเปลี่ยนโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(alert.version) });
    }
    return { id, alert };
  }

  private async respond(client: import('pg').PoolClient, id: string) {
    const row = (await client.query(`${SELECT} WHERE a.id = $1`, [id])).rows[0];
    const data = view(row);
    return { ok: true, id, version: data.version, data };
  }

  /** OPEN -> ACKNOWLEDGED (SM-8). */
  async acknowledge(req: Request, rawId: string) {
    const body = bodyObject(req.body ?? {});
    const version = optionalNumber(body.version, 'version', { min: 1 });
    return withTransaction(async (client) => {
      const { id, alert } = await this.loadForUpdate(client, req.user!, rawId, version);
      if (alert.status !== 'OPEN') throw new HttpError(409, 'ALREADY_DECIDED', `รับทราบได้เฉพาะแจ้งเตือนที่เปิดอยู่ (สถานะ ${alert.status})`);
      await client.query(`UPDATE stock_alert SET status = 'ACKNOWLEDGED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
      await writeAudit(client, auditContext(req), { action: 'ALERT_ACKNOWLEDGED', entityType: 'stock_alert', entityId: id, before: { status: 'OPEN' }, after: { status: 'ACKNOWLEDGED' } });
      return this.respond(client, id);
    });
  }

  /** OPEN | ACKNOWLEDGED -> SNOOZED for `hours` (default 24, max 168) with a reason. Evaluation re-opens it when the time is over. */
  async snooze(req: Request, rawId: string) {
    const body = bodyObject(req.body ?? {});
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const hours = optionalNumber(body.hours, 'hours', { min: 1, max: SNOOZE_MAX_HOURS }) ?? 24;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลในการเลื่อนเตือน (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const { id, alert } = await this.loadForUpdate(client, req.user!, rawId, version);
      if (!['OPEN', 'ACKNOWLEDGED'].includes(alert.status)) throw new HttpError(409, 'ALREADY_DECIDED', `เลื่อนเตือนไม่ได้ในสถานะ ${alert.status}`);
      await client.query(
        `UPDATE stock_alert SET status = 'SNOOZED', snoozed_until = now() + make_interval(hours => $2::int), updated_at = now(), version = version + 1 WHERE id = $1`,
        [id, hours],
      );
      await writeAudit(client, auditContext(req), {
        action: 'ALERT_SNOOZED',
        entityType: 'stock_alert',
        entityId: id,
        before: { status: alert.status },
        after: { status: 'SNOOZED', hours },
        reason,
      });
      return this.respond(client, id);
    });
  }
}

export const alertsService = new AlertsService();
