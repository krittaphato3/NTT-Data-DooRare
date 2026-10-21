/** Value metrics (API-XC-006) and the three report definitions (API-AD-005), computed from `value_record` and the F1/F2 tables. */
import { hospitalForRead } from '../../core/scope.js';
import { oneOf } from '../../core/pagination.js';
import { optionalNumber } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

/** Hospital filter: own hospital for hospital-bound users; a system admin sees the whole region unless one is named. */
function scope(user: AuthSessionUser, raw: Record<string, unknown>): string | null {
  if (user.hospitalId) return user.hospitalId;
  return raw.hospitalId === undefined ? null : hospitalForRead(user, raw.hospitalId);
}

const monthStart = (months: number) => `(date_trunc('month', current_date) - make_interval(months => ${Math.max(0, months - 1)}))::date`;

export class ValueService {
  async value(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = scope(user, raw);
    const months = Math.round(optionalNumber(raw.months, 'months', { min: 1, max: 120 }) ?? 12);
    const rows = (
      await query(
        `SELECT metric, period::text AS period, COALESCE(sum(value_thb), 0)::float8 AS thb, COALESCE(sum(value_qty), 0)::float8 AS qty
           FROM value_record WHERE ($1::uuid IS NULL OR hospital_id = $1) AND period >= ${monthStart(months)} AND period <= current_date GROUP BY 1, 2 ORDER BY 2, 1`,
        [hospitalId],
      )
    ).rows;
    const total = (metric: string, field: 'thb' | 'qty') => rows.filter((r) => r.metric === metric).reduce((s, r) => s + r[field], 0);
    const transport = (
      await query(
        `SELECT COALESCE(sum(ap.total_transport_cost_thb), 0)::float8 AS cost, count(*)::int AS plans
           FROM allocation_plan ap JOIN pool_entry pe ON pe.id = ap.pool_entry_id JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
          WHERE ap.status = 'COMPLETED' AND ($1::uuid IS NULL OR ne.hospital_id = $1) AND ap.updated_at >= ${monthStart(months)}`,
        [hospitalId],
      )
    ).rows[0];
    const periods = [...new Set(rows.map((r) => r.period))];
    const transferred = total('F2_TRANSFER_THB', 'thb');
    return {
      ok: true,
      scope: hospitalId ? { hospitalId } : { region: true },
      months,
      totals: {
        transferredValueThb: transferred,
        transportCostThb: transport.cost,
        netSavedThb: Math.round((transferred - transport.cost) * 100) / 100,
        completedPlans: transport.plans,
        expiredWriteOffThb: total('EXPIRED_WRITEOFF_THB', 'thb'),
        stockoutItemDays: total('STOCKOUT_ITEM_DAYS', 'qty'),
      },
      byMonth: periods.map((p) => ({
        period: p,
        transferredValueThb: rows.find((r) => r.period === p && r.metric === 'F2_TRANSFER_THB')?.thb ?? 0,
        expiredWriteOffThb: rows.find((r) => r.period === p && r.metric === 'EXPIRED_WRITEOFF_THB')?.thb ?? 0,
        stockoutItemDays: rows.find((r) => r.period === p && r.metric === 'STOCKOUT_ITEM_DAYS')?.qty ?? 0,
      })),
    };
  }

  /** API-AD-005: the report definitions of `report_definition`; each id has a fixed query (the stored query_spec is only a pointer). */
  async report(user: AuthSessionUser, reportId: string, raw: Record<string, unknown>) {
    const def = (await query(`SELECT id, name, description, roles::text[] AS roles FROM report_definition WHERE id = $1`, [reportId])).rows[0];
    if (!def) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายงาน');
    if (!def.roles.includes(user.role) && user.role !== 'SYSTEM_ADMIN') throw new HttpError(403, 'FORBIDDEN', 'บทบาทนี้ดูรายงานนี้ไม่ได้');
    const hospitalId = scope(user, raw);
    const months = Math.round(optionalNumber(raw.months, 'months', { min: 1, max: 120 }) ?? 12);
    let columns: { key: string; label: string }[] = [];
    let rows: Record<string, unknown>[] = [];
    if (reportId === 'expiry_waste') {
      columns = [{ key: 'period', label: 'เดือน' }, { key: 'expiredWriteOffThb', label: 'มูลค่ายาหมดอายุ (บาท)' }, { key: 'transferredValueThb', label: 'มูลค่าที่โอนก่อนหมดอายุ (บาท)' }];
      rows = (
        await query(
          `SELECT period::text AS period, COALESCE(sum(value_thb) FILTER (WHERE metric = 'EXPIRED_WRITEOFF_THB'), 0)::float8 AS "expiredWriteOffThb",
                  COALESCE(sum(value_thb) FILTER (WHERE metric = 'F2_TRANSFER_THB'), 0)::float8 AS "transferredValueThb"
             FROM value_record WHERE ($1::uuid IS NULL OR hospital_id = $1) AND period >= ${monthStart(months)} AND metric IN ('EXPIRED_WRITEOFF_THB', 'F2_TRANSFER_THB') GROUP BY 1 ORDER BY 1`,
          [hospitalId],
        )
      ).rows;
    } else if (reportId === 'borrow_activity') {
      columns = [{ key: 'period', label: 'เดือน' }, { key: 'requests', label: 'คำขอยืม' }, { key: 'accepted', label: 'ผู้ให้ยืมตอบรับ' }, { key: 'rejected', label: 'ปฏิเสธ' }, { key: 'timedOut', label: 'หมดเวลา' }, { key: 'returnsOpen', label: 'ภาระคืนที่ค้าง' }];
      rows = (
        await query(
          `WITH m AS (SELECT date_trunc('month', d)::date AS period FROM generate_series(${monthStart(months)}, date_trunc('month', current_date), interval '1 month') d)
           SELECT m.period::text AS period,
                  (SELECT count(*) FROM borrow_request br WHERE ($1::uuid IS NULL OR br.borrower_hospital_id = $1) AND date_trunc('month', br.created_at)::date = m.period)::int AS requests,
                  (SELECT count(*) FROM borrow_leg bl WHERE ($1::uuid IS NULL OR bl.lender_hospital_id = $1) AND bl.status IN ('ACCEPTED','PARTIAL','LOADED','IN_TRANSIT','RECEIVED') AND date_trunc('month', bl.sent_at)::date = m.period)::int AS accepted,
                  (SELECT count(*) FROM borrow_leg bl WHERE ($1::uuid IS NULL OR bl.lender_hospital_id = $1) AND bl.status = 'REJECTED' AND date_trunc('month', bl.sent_at)::date = m.period)::int AS rejected,
                  (SELECT count(*) FROM borrow_leg bl WHERE ($1::uuid IS NULL OR bl.lender_hospital_id = $1) AND bl.status = 'TIMED_OUT' AND date_trunc('month', bl.sent_at)::date = m.period)::int AS "timedOut",
                  (SELECT count(*) FROM return_obligation ro WHERE ($1::uuid IS NULL OR ro.debtor_hospital_id = $1) AND ro.status IN ('OPEN','REMINDED','OVERDUE') AND date_trunc('month', ro.due_date)::date = m.period)::int AS "returnsOpen"
             FROM m ORDER BY m.period`,
          [hospitalId],
        )
      ).rows;
    } else if (reportId === 'stock_overview') {
      columns = [{ key: 'code', label: 'รหัส' }, { key: 'name', label: 'ยา' }, { key: 'ved', label: 'VED' }, { key: 'usable', label: 'คงเหลือใช้ได้' }, { key: 'usePerDay', label: 'ใช้/วัน' }, { key: 'daysCover', label: 'ครอบคลุม (วัน)' }, { key: 'nearExpiryLots', label: 'ล็อตใกล้หมดอายุ' }];
      rows = (
        await query(
          `SELECT hd.local_code AS code, hd.local_name AS name, hd.ved::text AS ved,
                  COALESCE(sum(sl.qty_on_hand - sl.qty_held) FILTER (WHERE sl.expiry_date > current_date), 0)::float8 AS usable,
                  COALESCE(f.u, 0)::float8 AS "usePerDay",
                  CASE WHEN COALESCE(f.u, 0) > 0 THEN round((COALESCE(sum(sl.qty_on_hand - sl.qty_held) FILTER (WHERE sl.expiry_date > current_date), 0) / f.u)::numeric, 1)::float8 END AS "daysCover",
                  count(*) FILTER (WHERE sl.expiry_date > current_date AND sl.expiry_date <= current_date + COALESCE(hd.expiry_threshold_days, 180) AND sl.qty_on_hand > 0)::int AS "nearExpiryLots"
             FROM hospital_drug hd
             LEFT JOIN stock_lot sl ON sl.hospital_drug_id = hd.id
             LEFT JOIN LATERAL (SELECT u_per_day AS u FROM v_latest_forecast v WHERE v.hospital_drug_id = hd.id AND v.granularity = 'WEEK' ORDER BY period_start DESC NULLS LAST LIMIT 1) f ON true
            WHERE hd.active AND ($1::uuid IS NULL OR hd.hospital_id = $1) GROUP BY hd.id, hd.local_code, hd.local_name, hd.ved, hd.expiry_threshold_days, f.u ORDER BY hd.ved, hd.local_name LIMIT 500`,
          [hospitalId],
        )
      ).rows;
    } else {
      throw new HttpError(404, 'NOT_FOUND', 'รายงานนี้ยังไม่มีชุดคำสั่ง');
    }
    return { ok: true, id: def.id, name: def.name, generatedAt: new Date().toISOString(), months, scope: hospitalId ? { hospitalId } : { region: true }, columns, rows };
  }
}

export const valueService = new ValueService();
export { pool, oneOf };
