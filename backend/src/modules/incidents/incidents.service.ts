/**
 * F3 incidents (API-F3-001 .. -004, -011 .. -013): intake with the F-26 ETA, list / detail, count updates (which open a new
 * plan revision), usage records, close / cancel and the reconciliation summary. The plan itself is `plan.service.ts`, the
 * urgent borrowing `emergency.borrow.ts`, the packing `kits.service.ts`.
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { releaseKits, addKits, removeKits } from '../../core/kitStock.js';
import { resolveEta, TRIAGE_LEVELS } from '../../core/formulas/emergency.js';
import type { Counts, Triage } from '../../core/formulas/emergency.js';
import { notifyRoles } from '../../core/notify.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { CONFIRMED_STATUSES } from '../borrow/borrow.flow.js';
import { cancelOpenLegs, kitClassesOf } from './emergency.borrow.js';
import { loadEmergencyConfig } from './incidents.config.js';
import { assertOpen, assertVersion, etaView, hospitalOf, iso, loadIncident, nextIncidentNo, ownIncident, parseCounts, readCounts, RUNNING_STATUSES, statusGroup, totalPatients, writeCounts } from './incidents.shared.js';
import type { IncidentRow } from './incidents.shared.js';
import { buildPlanView, createRevision, incidentHolds, latestEdits, loadCatalog } from './plan.service.js';
import { kitsService } from './kits.service.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
const LABEL: Record<Triage, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLACK: 'ดำ', UNKNOWN: 'ไม่ทราบระดับ' };

const text = (value: unknown, name: string, max: number, required = false): string | null => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'VALIDATION', `ต้องระบุ ${name}`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw new HttpError(400, 'VALIDATION', `${name} ต้องเป็นข้อความไม่เกิน ${max} ตัวอักษร`);
  return value.trim();
};

const diffCounts = (before: Counts, after: Counts) => TRIAGE_LEVELS.filter((l) => before[l] !== after[l]).map((l) => ({ triage: l, label: LABEL[l], from: before[l], to: after[l] }));

/** Great-circle distance in metres. */
function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

interface Summary {
  id: string;
  incidentNo: string;
  status: string;
  group: 'active' | 'closed' | 'cancelled';
  type: string | null;
  description: string | null;
  location: { text: string | null; lat: number | null; lon: number | null };
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  closedAt: string | null;
  cancelReason: string | null;
  duplicateOf: string | null;
  version: number;
  eta: ReturnType<typeof etaView>;
  counts: Counts & { total: number };
  plan: { id: string; revision: number; status: string } | null;
  /** Emergency borrowing at a glance: live requests and their legs by state. */
  borrow: { requests: number; waiting: number; confirmed: number; received: number; escalated: number };
}

async function summaries(db: Db, rows: (IncidentRow & { creator_name?: string | null })[]): Promise<Summary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = (await db.query(`SELECT incident_id, triage::text AS triage, count FROM incident_patient_count WHERE incident_id = ANY($1::uuid[])`, [ids])).rows;
  const plans = (
    await db.query(
      `SELECT DISTINCT ON (incident_id) incident_id, id, revision, status::text AS status FROM emergency_plan WHERE incident_id = ANY($1::uuid[]) AND status <> 'CANCELLED' ORDER BY incident_id, revision DESC`,
      [ids],
    )
  ).rows;
  const borrow = (
    await db.query(
      `SELECT br.incident_id,
              count(DISTINCT br.id) FILTER (WHERE br.status::text <> 'CANCELLED')::int AS requests,
              count(DISTINCT br.id) FILTER (WHERE br.status = 'ESCALATED')::int AS escalated,
              count(bl.id) FILTER (WHERE bl.status = 'SENT')::int AS waiting,
              count(bl.id) FILTER (WHERE bl.status IN ('ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'))::int AS confirmed,
              count(bl.id) FILTER (WHERE bl.status = 'RECEIVED')::int AS received
         FROM borrow_request br LEFT JOIN borrow_leg bl ON bl.request_id = br.id
        WHERE br.incident_id = ANY($1::uuid[]) AND br.context = 'EMERGENCY' GROUP BY br.incident_id`,
      [ids],
    )
  ).rows;
  return rows.map((r) => {
    const c: Counts = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0, UNKNOWN: 0 };
    for (const x of counts.filter((x) => x.incident_id === r.id)) c[x.triage as Triage] = Number(x.count);
    const plan = plans.find((p) => p.incident_id === r.id);
    return {
      id: r.id,
      incidentNo: r.incident_no,
      status: r.status,
      group: statusGroup(r.status),
      type: r.incident_type,
      description: r.description,
      location: { text: r.location_text, lat: r.location_lat, lon: r.location_lon },
      createdAt: iso(r.created_at) as string,
      createdBy: r.created_by ? { id: r.created_by, name: r.creator_name ?? '' } : null,
      closedAt: iso(r.closed_at),
      cancelReason: r.cancel_reason,
      duplicateOf: r.duplicate_of,
      version: Number(r.version),
      eta: etaView(r),
      counts: { ...c, total: totalPatients(c) },
      plan: plan ? { id: plan.id, revision: Number(plan.revision), status: plan.status } : null,
      borrow: ((b) => ({ requests: Number(b?.requests ?? 0), waiting: Number(b?.waiting ?? 0), confirmed: Number(b?.confirmed ?? 0), received: Number(b?.received ?? 0), escalated: Number(b?.escalated ?? 0) }))(borrow.find((x) => x.incident_id === r.id)),
    };
  });
}

const INCIDENT_SELECT = `
  SELECT i.id, i.incident_no, i.hospital_id, i.status::text AS status, i.location_lat::float8 AS location_lat, i.location_lon::float8 AS location_lon, i.location_text, i.incident_type, i.description,
         i.eta_unsure, i.eta_minutes, i.eta_source::text AS eta_source, i.reported_eta_min, i.created_by, i.duplicate_of, i.cancel_reason, i.closed_at, i.created_at, i.updated_at, i.version,
         u.display_name AS creator_name
    FROM incident i LEFT JOIN app_user u ON u.id = i.created_by`;

class IncidentsService {
  // ───────────── create / list / detail ─────────────

  /** API-F3-001: record an incident (type, counts per triage level, ETA); the duplicate check is a warning staff may acknowledge. */
  async create(req: Request) {
    const user = req.user!;
    const hospitalId = hospitalOf(user);
    const body = bodyObject(req.body);
    const incidentType = text(body.incidentType, 'incidentType', 120, true) as string;
    const description = text(body.description, 'description', 2000);
    const locationText = text(body.locationText, 'locationText', 300);
    const lat = optionalNumber(body.locationLat, 'locationLat', { min: -90, max: 90 });
    const lon = optionalNumber(body.locationLon, 'locationLon', { min: -180, max: 180 });
    if ((lat === undefined) !== (lon === undefined)) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ locationLat และ locationLon คู่กัน');
    const counts = parseCounts(body.counts);
    const reported = optionalNumber(body.reportedEtaMin, 'reportedEtaMin', { min: 1, max: 1440 });
    const unsure = body.etaUnsure === true;
    if (unsure && reported === undefined) throw new HttpError(400, 'VALIDATION', 'etaUnsure ใช้ได้เมื่อระบุ reportedEtaMin');
    const acknowledge = body.acknowledgeDuplicate === true;
    const duplicateOf = body.duplicateOf === undefined || body.duplicateOf === null ? null : uuidParam(body.duplicateOf, 'duplicateOf');

    return withTransaction(async (client) => {
      const cfg = await loadEmergencyConfig(client, hospitalId);
      // BR edge case 12: another running incident of this hospital reported close in time and place
      const recent = (
        await client.query(
          `SELECT id, incident_no, incident_type, location_text, location_lat::float8 AS lat, location_lon::float8 AS lon, created_at FROM incident
            WHERE hospital_id = $1 AND status::text = ANY($2::text[]) AND created_at >= now() - make_interval(mins => $3::int)`,
          [hospitalId, [...RUNNING_STATUSES], cfg.duplicateWindowMin],
        )
      ).rows;
      const candidates = recent.filter((r) =>
        lat !== undefined && lon !== undefined && r.lat !== null
          ? haversineM({ lat, lon: lon as number }, { lat: r.lat, lon: r.lon }) <= cfg.duplicateRadiusM
          : lat === undefined && r.lat === null && Boolean(locationText) && r.location_text?.trim().toLowerCase() === locationText!.toLowerCase(),
      );
      if (candidates.length > 0 && !acknowledge) {
        throw new HttpError(409, 'DUPLICATE_SUSPECTED', `มีเหตุการณ์ที่แจ้งไว้ใกล้เคียงภายใน ${cfg.duplicateWindowMin} นาที / ${cfg.duplicateRadiusM} เมตร`, {
          candidates: candidates.map((c) => ({ id: c.id, incidentNo: c.incident_no, type: c.incident_type, location: c.location_text, createdAt: iso(c.created_at) })),
        });
      }
      if (duplicateOf && !candidates.some((c) => c.id === duplicateOf)) throw new HttpError(422, 'VALIDATION', 'duplicateOf ต้องเป็นเหตุการณ์ที่ตรวจพบว่าซ้ำ');

      const eta = resolveEta({ reported, unsure });
      const incidentNo = await nextIncidentNo(client);
      const row = (
        await client.query(
          `INSERT INTO incident (incident_no, hospital_id, status, location_lat, location_lon, location_text, incident_type, description, eta_unsure, eta_minutes, eta_source, reported_eta_min, created_by, duplicate_of)
           VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8, $9, $10::eta_source, $11, $12, $13) RETURNING id`,
          [incidentNo, hospitalId, lat ?? null, lon ?? null, locationText, incidentType, description, unsure, eta.minutes, eta.source, reported ?? null, user.id, duplicateOf],
        )
      ).rows[0];
      await writeCounts(client, row.id, counts);
      await writeAudit(client, auditContext(req), {
        action: 'INCIDENT_CREATED', entityType: 'incident', entityId: row.id,
        after: { incidentNo, type: incidentType, counts, eta: { minutes: eta.minutes, source: eta.source, flags: eta.flags }, duplicateOf },
      });
      await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN'], {
        kind: 'INCIDENT_CREATED', title: `เหตุฉุกเฉินใหม่ ${incidentNo}: ${incidentType}`, body: `แดง ${counts.RED} · เหลือง ${counts.YELLOW} · เขียว ${counts.GREEN}`, refType: 'incident', refId: row.id,
      });
      if (eta.flags.includes('ETA_UNAVAILABLE')) {
        await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST'], {
          kind: 'ETA_UNAVAILABLE', title: `ไม่สามารถการันตี ETA ของ ${incidentNo} — ใช้วิทยุสื่อสาร`, body: 'ใส่ ETA เองได้ที่หน้าแก้ไขเหตุการณ์', refType: 'incident', refId: row.id,
        });
        await writeAudit(client, auditContext(req), { action: 'ETA_UNAVAILABLE', entityType: 'incident', entityId: row.id, after: { incidentNo, reason: 'no reported ETA and no route service' } });
      }
      return { ok: true, id: row.id, data: await this.detailOf(client, user, row.id), warnings: candidates.length > 0 ? [{ code: 'DUPLICATE_ACKNOWLEDGED', count: candidates.length }] : [] };
    });
  }

  /** API-F3-002. */
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = hospitalOf(user);
    const page = parsePage(raw);
    const group = oneOf(raw.status, ['active', 'closed', 'cancelled', 'all'] as const, 'status') ?? 'all';
    const params: unknown[] = [hospitalId];
    const where = ['i.hospital_id = $1'];
    if (group === 'active') where.push(`i.status::text = ANY(${`$${params.push([...RUNNING_STATUSES])}`}::text[])`);
    if (group === 'closed') where.push(`i.status = 'RECONCILED'`);
    if (group === 'cancelled') where.push(`i.status = 'CANCELLED'`);
    if (typeof raw.q === 'string' && raw.q.trim()) {
      const q = `%${raw.q.trim()}%`;
      where.push(`(i.incident_no ILIKE $${params.push(q)} OR i.incident_type ILIKE $${params.length} OR i.location_text ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const rows = (await query(`${INCIDENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows as IncidentRow[];
    const slice = toPage(rows, page);
    return { ok: true, items: await summaries(pool, slice.items), nextCursor: slice.nextCursor };
  }

  /** API-F3-003: the incident with its plan, borrowing lines, pack tasks, usage and the change history. */
  async detail(user: AuthSessionUser, rawId: string) {
    const incident = await ownIncident(pool, user, rawId);
    return { ok: true, data: await this.detailOf(pool, user, incident.id) };
  }

  async detailOf(db: Db, user: AuthSessionUser, id: string) {
    const row = (await db.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id])).rows[0] as IncidentRow & { creator_name: string | null };
    const [summary] = await summaries(db, [row]);
    const planRows = (await db.query(`SELECT * FROM emergency_plan WHERE incident_id = $1 ORDER BY revision DESC`, [id])).rows;
    const live = planRows.find((p) => p.status !== 'CANCELLED') ?? null;
    const approved = planRows.find((p) => p.status === 'APPROVED') ?? null;
    const [approvers, lines, tasks, usage, updates] = await Promise.all([
      db.query(`SELECT id, display_name FROM app_user WHERE id = ANY($1::uuid[])`, [planRows.map((p) => p.approved_by).filter(Boolean)]),
      this.borrowLines(db, id),
      kitsService.tasks(user, { incidentId: id, limit: 200 }),
      this.usageOf(db, id),
      this.history(db, id),
    ]);
    const nameOf = new Map(approvers.rows.map((a) => [a.id, a.display_name]));
    const warnings: { code: string; message: string }[] = [];
    for (const f of summary.eta.flags) {
      warnings.push({ code: f, message: f === 'ETA_UNAVAILABLE' ? 'ไม่สามารถการันตี ETA — ใช้วิทยุสื่อสาร' : f === 'ROUTE_UNAVAILABLE' ? 'ไม่มีข้อมูลเส้นทางจริง ใช้ ETA ที่รายงานมา' : 'ถึงเวลา ETA แล้ว ผู้ป่วยอาจมาถึง' });
    }
    if (lines.some((l) => l.legs.some((g) => g.lateForEta))) warnings.push({ code: 'LATE_FOR_ETA', message: 'มีรายการที่ของจะถึงหลัง ETA' });
    if (lines.some((l) => l.status === 'ESCALATED')) warnings.push({ code: 'REQUEST_ESCALATED', message: 'มีรายการที่ไม่มีโรงพยาบาลให้ยืม ต้องติดต่อด้วยวิทยุ/โทรศัพท์' });
    if (live && live.status === 'READY_FOR_APPROVAL' && summary.status === 'ACTIVE') warnings.push({ code: 'PLAN_PENDING', message: `แผนฉบับที่ ${live.revision} รออนุมัติ` });
    return {
      ...summary,
      plan: live ? await buildPlanView(db, live, row) : null,
      approvedPlanId: approved?.id ?? null,
      plans: planRows.map((p) => ({ id: p.id, revision: Number(p.revision), status: p.status as string, createdAt: iso(p.created_at), approvedAt: iso(p.approved_at), approvedBy: p.approved_by ? { id: p.approved_by, name: nameOf.get(p.approved_by) ?? '' } : null })),
      borrowLines: lines,
      kitTasks: tasks.items,
      usage,
      updates,
      warnings,
    };
  }

  /** One entry per planned borrow request with its legs (waiting, confirmed, rejected, timed out…). */
  async borrowLines(db: Db, incidentId: string) {
    const reqs = (
      await db.query(
        `SELECT br.id, br.request_no, br.status::text AS status, br.created_at, i.id AS item_id, i.kind::text AS kind, i.kit_type_id, i.drug_master_id, i.qty_requested::float8 AS qty_requested, i.qty_fulfilled::float8 AS qty_fulfilled,
                COALESCE(NULLIF(${DRUG_NAME}, ''), kt.name) AS name, kt.code AS kit_code, COALESCE(dm.base_unit, 'ชุด') AS unit, COALESCE(dm.emergency_class, 'SUPPORTIVE') AS cls, COALESCE(dm.is_blood_product, false) AS blood
           FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
           LEFT JOIN drug_master dm ON dm.id = i.drug_master_id LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
          WHERE br.incident_id = $1 ORDER BY br.created_at, i.id`,
        [incidentId],
      )
    ).rows;
    if (reqs.length === 0) return [];
    const kitClasses = (await kitClassesOf(db, [incidentId])).get(incidentId) ?? {};
    const legs = (
      await db.query(
        `SELECT bl.id, bl.request_id, bl.lender_hospital_id, COALESCE(h.name_th, h.name_en) AS lender_name, h.code AS lender_code, bl.round_no, bl.rank_in_ladder, bl.status::text AS status,
                bl.qty_asked::float8 AS qty_asked, bl.qty_accepted::float8 AS qty_accepted, bl.qty_received::float8 AS qty_received, bl.sent_at, bl.deadline_at, bl.responded_at, bl.reject_reason,
                bl.t_transit_min::float8 AS transit, bl.score_parts, tt.id AS task_id, tt.task_no, tt.status::text AS task_status
           FROM borrow_leg bl JOIN hospital h ON h.id = bl.lender_hospital_id
           LEFT JOIN transport_task tt ON tt.ref_type = 'BORROW_LEG' AND tt.ref_id = bl.id AND tt.status <> 'CANCELLED'
          WHERE bl.request_id = ANY($1::uuid[]) ORDER BY bl.round_no, bl.rank_in_ladder`,
        [reqs.map((r) => r.id)],
      )
    ).rows;
    const now = Date.now();
    return reqs.map((r) => {
      const mine = legs.filter((l) => l.request_id === r.id);
      const confirmed = mine.reduce((s, l) => s + (l.status === 'RECEIVED' ? (l.qty_received ?? 0) : (CONFIRMED_STATUSES as readonly string[]).includes(l.status) ? (l.qty_accepted ?? 0) : 0), 0);
      return {
        requestId: r.id,
        requestNo: r.request_no,
        status: r.status as string,
        createdAt: iso(r.created_at),
        item: { id: r.item_id, kind: r.kind as 'KIT' | 'DRUG', kitTypeId: r.kit_type_id, kitCode: r.kit_code, drugMasterId: r.drug_master_id, name: r.name as string, unit: r.unit as string, class: (r.kind === 'KIT' ? (kitClasses[r.kit_code] ?? 'SUPPORTIVE') : r.cls) as string, blood: r.blood as boolean },
        qtyRequested: r.qty_requested as number,
        qtyConfirmed: confirmed,
        qtyReceived: mine.reduce((s, l) => s + (l.status === 'RECEIVED' ? (l.qty_received ?? 0) : 0), 0),
        qtyMissing: Math.max(0, r.qty_requested - confirmed),
        legs: mine.map((l) => ({
          id: l.id,
          lender: { id: l.lender_hospital_id, code: l.lender_code, name: l.lender_name },
          round: Number(l.round_no),
          status: l.status as string,
          qtyAsked: l.qty_asked as number,
          qtyAccepted: l.qty_accepted as number | null,
          qtyReceived: l.qty_received as number | null,
          transitMin: l.transit as number | null,
          sentAt: iso(l.sent_at),
          deadlineAt: iso(l.deadline_at),
          remainingSec: l.status === 'SENT' && l.deadline_at ? Math.max(0, Math.round((new Date(l.deadline_at).getTime() - now) / 1000)) : null,
          respondedAt: iso(l.responded_at),
          rejectReason: l.reject_reason as string | null,
          lateForEta: Boolean(l.score_parts?.lateForEta),
          mode: (l.score_parts?.mode as string | undefined) ?? null,
          task: l.task_id ? { id: l.task_id, taskNo: l.task_no, status: l.task_status } : null,
        })),
      };
    });
  }

  async usageOf(db: Db, incidentId: string) {
    const rows = (
      await db.query(
        `SELECT u.id, u.drug_master_id, u.kit_type_id, u.qty_used::float8 AS qty, COALESCE(NULLIF(${DRUG_NAME}, ''), kt.name) AS name, COALESCE(dm.base_unit, 'ชุด') AS unit, kt.code AS kit_code
           FROM incident_usage u LEFT JOIN drug_master dm ON dm.id = u.drug_master_id LEFT JOIN kit_type kt ON kt.id = u.kit_type_id
          WHERE u.incident_id = $1 ORDER BY kt.code NULLS LAST, dm.generic_name`,
        [incidentId],
      )
    ).rows;
    return rows.map((r) => ({ id: r.id as string, kind: (r.kit_type_id ? 'KIT' : 'DRUG') as 'KIT' | 'DRUG', drugMasterId: r.drug_master_id as string | null, kitTypeId: r.kit_type_id as string | null, kitCode: r.kit_code as string | null, name: r.name as string, unit: r.unit as string, qtyUsed: r.qty as number }));
  }

  /** Who changed what and when (counts, ETA, plan approvals, close). Read from the audit trail. */
  async history(db: Db, incidentId: string) {
    const rows = (
      await db.query(
        `SELECT a.occurred_at, a.action, a.actor_role, a.before, a.after, a.reason, u.display_name
           FROM audit_log a LEFT JOIN app_user u ON u.id = a.actor_id
          WHERE (a.entity_type = 'incident' AND a.entity_id = $1) ORDER BY a.occurred_at, a.id`,
        [incidentId],
      )
    ).rows;
    return rows.map((a) => ({
      at: iso(a.occurred_at) as string,
      action: a.action as string,
      by: a.display_name as string | null,
      role: a.actor_role as string | null,
      changes: a.action === 'INCIDENT_COUNTS_UPDATED' ? (a.after?.changes ?? []) : [],
      note: (a.reason as string | null) ?? null,
    }));
  }

  // ───────────── updates ─────────────

  /** API-F3-004: new counts and / or ETA. A live plan is recalculated into a new revision that needs approval again (BR-F3-026). */
  async updateCounts(req: Request, rawId: string) {
    const user = req.user!;
    const body = bodyObject(req.body);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const note = text(body.note, 'note', 500);
    const reported = body.reportedEtaMin === null ? null : optionalNumber(body.reportedEtaMin, 'reportedEtaMin', { min: 1, max: 1440 });
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertOpen(incident);
      assertVersion(incident, version);
      const before = await readCounts(client, incident.id);
      const after = parseCounts(body.counts, before);
      const changes = diffCounts(before, after);
      const etaChanged = body.reportedEtaMin !== undefined || body.etaUnsure !== undefined;
      // the description fields of the report may be corrected too (no plan impact)
      const typeNew = body.incidentType === undefined ? undefined : (text(body.incidentType, 'incidentType', 120, true) as string);
      const descNew = body.description === undefined ? undefined : text(body.description, 'description', 2000);
      const locNew = body.locationText === undefined ? undefined : text(body.locationText, 'locationText', 300);
      const infoChanged = (typeNew !== undefined && typeNew !== incident.incident_type) || (descNew !== undefined && descNew !== incident.description) || (locNew !== undefined && locNew !== incident.location_text);
      if (changes.length === 0 && !etaChanged && !note && !infoChanged) throw new HttpError(422, 'NO_CHANGE', 'ไม่มีอะไรเปลี่ยนแปลง');
      if (changes.length > 0) await writeCounts(client, incident.id, after);
      let eta = null as null | ReturnType<typeof resolveEta>;
      const sets: string[] = [];
      const values: unknown[] = [incident.id];
      if (etaChanged) {
        // `reportedEtaMin` is minutes from now; it is stored as minutes after the report (created_at) so the arrival time stays fixed
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(incident.created_at).getTime()) / 60_000));
        const nextReported = body.reportedEtaMin === undefined ? incident.reported_eta_min : reported === null ? null : (reported as number) + elapsed;
        const nextUnsure = body.etaUnsure === undefined ? incident.eta_unsure : body.etaUnsure === true;
        eta = resolveEta({ reported: nextReported ?? undefined, unsure: nextUnsure });
        sets.push(`reported_eta_min = $${values.push(nextReported ?? null)}`, `eta_unsure = $${values.push(nextUnsure)}`, `eta_minutes = $${values.push(eta.minutes)}`, `eta_source = $${values.push(eta.source)}::eta_source`);
      }
      if (typeNew !== undefined) sets.push(`incident_type = $${values.push(typeNew)}`);
      if (descNew !== undefined) sets.push(`description = $${values.push(descNew)}`);
      if (locNew !== undefined) sets.push(`location_text = $${values.push(locNew)}`);
      await client.query(`UPDATE incident SET ${[...sets, 'updated_at = now()', 'version = version + 1'].join(', ')} WHERE id = $1`, values);
      await writeAudit(client, auditContext(req), {
        action: 'INCIDENT_COUNTS_UPDATED', entityType: 'incident', entityId: incident.id, before: { counts: before, ...(infoChanged ? { info: { type: incident.incident_type, description: incident.description, location: incident.location_text } } : {}) }, after: { counts: after, changes, eta: eta ? { minutes: eta.minutes, source: eta.source } : undefined, ...(infoChanged ? { info: { type: typeNew ?? incident.incident_type, description: descNew ?? incident.description, location: locNew ?? incident.location_text } } : {}) }, reason: note,
      });
      let plan = null as null | { id: string; revision: number };
      const hasPlan = (await client.query(`SELECT 1 FROM emergency_plan WHERE incident_id = $1 AND status <> 'CANCELLED' LIMIT 1`, [incident.id])).rowCount;
      if (hasPlan && (changes.length > 0 || etaChanged)) {
        const fresh = (await loadIncident(client, incident.id)) as IncidentRow;
        plan = await createRevision(client, auditContext(req), fresh, after, await latestEdits(client, incident.id), 'counts or ETA changed');
        await notifyRoles(client, incident.hospital_id, ['PHARMACIST', 'HOSPITAL_ADMIN'], {
          kind: 'INCIDENT_PLAN_CHANGED', title: `ผู้ป่วยเปลี่ยน ${incident.incident_no}: แผนฉบับที่ ${plan.revision} รออนุมัติ`, body: changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join(' · ') || undefined, refType: 'incident', refId: incident.id,
        });
      }
      return { ok: true, id: incident.id, data: { changes, newPlanRevision: plan?.revision ?? null, detail: await this.detailOf(client, user, incident.id) } };
    });
  }

  // ───────────── usage ─────────────

  /** API-F3-011: records what was used (set semantics per item; 0 removes). Sets used from the ready stock leave kit stock. */
  async recordUsage(req: Request, rawId: string) {
    const user = req.user!;
    const body = bodyObject(req.body);
    if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 200) throw new HttpError(400, 'VALIDATION', 'lines ต้องเป็นรายการ 1-200 รายการ');
    const lines = body.lines.map((raw: unknown) => {
      const o = bodyObject(raw);
      const drugId = o.drugMasterId === undefined || o.drugMasterId === null ? null : uuidParam(o.drugMasterId, 'drugMasterId');
      const kitId = o.kitTypeId === undefined || o.kitTypeId === null ? null : uuidParam(o.kitTypeId, 'kitTypeId');
      if ((drugId === null) === (kitId === null)) throw new HttpError(400, 'VALIDATION', 'แต่ละรายการต้องระบุ drugMasterId หรือ kitTypeId อย่างใดอย่างหนึ่ง');
      const qty = Number(o.qtyUsed);
      if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000 || Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-6) throw new HttpError(400, 'VALIDATION', 'qtyUsed ต้องเป็นตัวเลข ≥ 0 ทศนิยมไม่เกิน 3 ตำแหน่ง');
      if (kitId && !Number.isInteger(qty)) throw new HttpError(400, 'VALIDATION', 'จำนวนชุดที่ใช้ต้องเป็นจำนวนเต็ม');
      return { drugId, kitId, qty };
    });
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertOpen(incident, ['ACTIVE', 'CLOSE_REQUESTED']);
      const hospitalId = incident.hospital_id;
      const changed: { name: string; from: number; to: number }[] = [];
      for (const line of lines) {
        const existing = (await client.query(`SELECT id, qty_used::float8 AS qty FROM incident_usage WHERE incident_id = $1 AND drug_master_id IS NOT DISTINCT FROM $2 AND kit_type_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [incident.id, line.drugId, line.kitId])).rows[0];
        const previous = existing?.qty ?? 0;
        if (line.drugId) {
          const ok = (await client.query(`SELECT 1 FROM drug_master WHERE id = $1`, [line.drugId])).rowCount;
          if (!ok) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการยา');
        } else {
          const ok = (await client.query(`SELECT 1 FROM kit_type WHERE id = $1`, [line.kitId])).rowCount;
          if (!ok) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบชนิดชุดยา');
          const delta = line.qty - previous;
          if (delta > 0) await removeKits(client, hospitalId, line.kitId as string, delta);
          if (delta < 0) await addKits(client, hospitalId, line.kitId as string, -delta);
        }
        if (line.qty === 0) {
          if (existing) await client.query(`DELETE FROM incident_usage WHERE id = $1`, [existing.id]);
        } else if (existing) {
          await client.query(`UPDATE incident_usage SET qty_used = $2, recorded_by = $3 WHERE id = $1`, [existing.id, line.qty, user.id]);
        } else {
          await client.query(`INSERT INTO incident_usage (incident_id, drug_master_id, kit_type_id, qty_used, recorded_by) VALUES ($1, $2, $3, $4, $5)`, [incident.id, line.drugId, line.kitId, line.qty, user.id]);
        }
        if (previous !== line.qty) changed.push({ name: (line.drugId ?? line.kitId) as string, from: previous, to: line.qty });
      }
      await writeAudit(client, auditContext(req), { action: 'INCIDENT_USAGE_RECORDED', entityType: 'incident', entityId: incident.id, after: { incidentNo: incident.incident_no, changed } });
      return { ok: true, id: incident.id, data: { usage: await this.usageOf(client, incident.id), changed: changed.length } };
    });
  }

  // ───────────── close / cancel ─────────────

  /**
   * API-F3-012. ACTIVE -> CLOSE_REQUESTED by one of ER staff / pharmacist; CLOSE_REQUESTED -> RECONCILED by the other (A12: both
   * sign the reconciliation). `mode: 'CANCEL'` (with a reason) withdraws an incident that never needed supplies (false alarm).
   */
  async close(req: Request, rawId: string) {
    const user = req.user!;
    const body = bodyObject(req.body ?? {});
    const mode = oneOf(body.mode, ['REQUEST', 'APPROVE', 'CANCEL'] as const, 'mode');
    const reason = text(body.reason, 'reason', 500);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertVersion(incident, version);
      const ctx = auditContext(req);
      const hospitalId = incident.hospital_id;

      const releaseEverything = async () => {
        for (const [code, qty] of Object.entries(await incidentHolds(client, incident.id))) {
          const kit = (await loadCatalog(client)).kits.get(code);
          if (kit && qty > 0) await releaseKits(client, hospitalId, kit.id, qty);
        }
        await client.query(`DELETE FROM kit_pack_task WHERE status = 'TODO' AND plan_id IN (SELECT id FROM emergency_plan WHERE incident_id = $1)`, [incident.id]);
      };

      if (mode === 'CANCEL') {
        assertOpen(incident);
        if (!reason || reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลที่ยกเลิก');
        await releaseEverything();
        const cancelled = await cancelOpenLegs(client, incident.id, 'INCIDENT_CANCELLED');
        await client.query(`UPDATE emergency_plan SET status = 'CANCELLED' WHERE incident_id = $1 AND status IN ('DRAFT', 'READY_FOR_APPROVAL')`, [incident.id]);
        await client.query(`UPDATE incident SET status = 'CANCELLED', cancel_reason = $2, closed_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [incident.id, reason]);
        await writeAudit(client, ctx, { action: 'INCIDENT_CANCELLED', entityType: 'incident', entityId: incident.id, before: { status: incident.status }, after: { incidentNo: incident.incident_no, ...cancelled }, reason });
        await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN'], { kind: 'INCIDENT_CANCELLED', title: `ยกเลิกเหตุ ${incident.incident_no}`, body: reason, refType: 'incident', refId: incident.id });
        return { ok: true, id: incident.id, data: { status: 'CANCELLED', ...cancelled, detail: await this.detailOf(client, user, incident.id) } };
      }

      if (incident.status === 'ACTIVE') {
        if (mode === 'APPROVE') throw new HttpError(409, 'INVALID_STATE', 'ยังไม่มีคำขอปิดเหตุการณ์ให้ยืนยัน');
        const cancelled = await cancelOpenLegs(client, incident.id, 'INCIDENT_CLOSING');
        await client.query(`UPDATE incident SET status = 'CLOSE_REQUESTED', updated_at = now(), version = version + 1 WHERE id = $1`, [incident.id]);
        await writeAudit(client, ctx, { action: 'INCIDENT_CLOSE_REQUESTED', entityType: 'incident', entityId: incident.id, before: { status: 'ACTIVE' }, after: { incidentNo: incident.incident_no, role: user.role, ...cancelled }, reason });
        const other = user.role === 'ER_STAFF' ? ['PHARMACIST'] : ['ER_STAFF'];
        await notifyRoles(client, hospitalId, other, { kind: 'INCIDENT_CLOSE_REQUESTED', title: `ขอปิดเหตุ ${incident.incident_no} รอการยืนยันสรุป`, body: reason ?? undefined, refType: 'incident', refId: incident.id });
        return { ok: true, id: incident.id, data: { status: 'CLOSE_REQUESTED', ...cancelled, detail: await this.detailOf(client, user, incident.id) } };
      }
      if (incident.status === 'CLOSE_REQUESTED') {
        if (mode === 'REQUEST') throw new HttpError(409, 'INVALID_STATE', 'ขอปิดเหตุการณ์แล้ว รออีกฝ่ายยืนยัน');
        const requestedBy = (await client.query(`SELECT actor_id, actor_role FROM audit_log WHERE entity_type = 'incident' AND entity_id = $1 AND action = 'INCIDENT_CLOSE_REQUESTED' ORDER BY id DESC LIMIT 1`, [incident.id])).rows[0];
        if (requestedBy && (requestedBy.actor_role === user.role || requestedBy.actor_id === user.id)) {
          throw new HttpError(409, 'NEEDS_OTHER_ROLE', `ต้องให้${requestedBy.actor_role === 'ER_STAFF' ? 'เภสัชกร' : 'เจ้าหน้าที่ห้องฉุกเฉิน'}เป็นผู้ยืนยันการสรุป (ลงนามร่วม ER + เภสัชกร)`, { requestedByRole: requestedBy.actor_role });
        }
        await releaseEverything();
        await client.query(`UPDATE incident SET status = 'RECONCILED', closed_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [incident.id]);
        await writeAudit(client, ctx, { action: 'INCIDENT_RECONCILED', entityType: 'incident', entityId: incident.id, before: { status: 'CLOSE_REQUESTED' }, after: { incidentNo: incident.incident_no, requestedByRole: requestedBy?.actor_role ?? null, approvedByRole: user.role }, reason });
        await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN'], { kind: 'INCIDENT_RECONCILED', title: `สรุปเหตุ ${incident.incident_no} เรียบร้อย`, refType: 'incident', refId: incident.id });
        return { ok: true, id: incident.id, data: { status: 'RECONCILED', detail: await this.detailOf(client, user, incident.id) } };
      }
      throw new HttpError(409, 'INVALID_STATE', `เหตุการณ์อยู่ในสถานะ ${incident.status} ปิดไม่ได้`, { status: incident.status });
    });
  }

  // ───────────── reconciliation ─────────────

  /** API-F3-013: what was borrowed from whom, what is still owed back, and what was used (for the claim). */
  async reconciliation(user: AuthSessionUser, rawId: string) {
    const incident = await ownIncident(pool, user, rawId);
    const legs = (
      await query(
        `SELECT bl.id AS leg_id, bl.status::text AS status, bl.qty_accepted::float8 AS accepted, bl.qty_received::float8 AS received, bl.lender_hospital_id, COALESCE(h.name_th, h.name_en) AS lender_name, h.code AS lender_code,
                i.kind::text AS kind, i.kit_type_id, i.drug_master_id, COALESCE(NULLIF(${DRUG_NAME}, ''), kt.name) AS name, COALESCE(dm.base_unit, 'ชุด') AS unit,
                ro.id AS ro_id, ro.qty::float8 AS ro_qty, ro.qty_returned::float8 AS ro_returned, ro.status::text AS ro_status, ro.due_date::text AS due_date, ro.return_mode
           FROM borrow_leg bl
           JOIN borrow_request br ON br.id = bl.request_id AND br.incident_id = $1 AND br.context = 'EMERGENCY'
           JOIN borrow_request_item i ON i.id = COALESCE(bl.request_item_id, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = bl.request_id))
           JOIN hospital h ON h.id = bl.lender_hospital_id
           LEFT JOIN drug_master dm ON dm.id = i.drug_master_id LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
           LEFT JOIN return_obligation ro ON ro.leg_id = bl.id
          WHERE bl.status IN ('ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT', 'RECEIVED')
          ORDER BY h.code, name`,
        [incident.id],
      )
    ).rows;
    const usage = await this.usageOf(pool, incident.id);
    const priced = usage.filter((u) => u.drugMasterId);
    const prices = priced.length
      ? (await query(`SELECT drug_master_id, max(unit_price_thb)::float8 AS price FROM hospital_drug WHERE hospital_id = $1 AND drug_master_id = ANY($2::uuid[]) GROUP BY drug_master_id`, [incident.hospital_id, priced.map((u) => u.drugMasterId)])).rows
      : [];
    const priceOf = new Map(prices.map((p) => [p.drug_master_id as string, p.price as number | null]));

    const byLender = new Map<string, { lender: { id: string; code: string; name: string }; items: Record<string, unknown>[] }>();
    for (const l of legs) {
      const entry = byLender.get(l.lender_hospital_id) ?? { lender: { id: l.lender_hospital_id, code: l.lender_code, name: l.lender_name }, items: [] as Record<string, unknown>[] };
      const qty = l.status === 'RECEIVED' ? (l.received ?? 0) : (l.accepted ?? 0);
      entry.items.push({
        legId: l.leg_id, legStatus: l.status, kind: l.kind, kitTypeId: l.kit_type_id, drugMasterId: l.drug_master_id, name: l.name, unit: l.unit, qtyBorrowed: qty,
        obligation: l.ro_id ? { id: l.ro_id, qty: l.ro_qty, returned: l.ro_returned, outstanding: Math.max(0, l.ro_qty - l.ro_returned), status: l.ro_status, dueDate: l.due_date, mode: l.return_mode } : null,
      });
      byLender.set(l.lender_hospital_id, entry);
    }
    const borrowedTotals = new Map<string, { name: string; unit: string; borrowed: number }>();
    for (const l of legs) {
      const key = l.kit_type_id ?? l.drug_master_id;
      const cur = borrowedTotals.get(key) ?? { name: l.name, unit: l.unit, borrowed: 0 };
      cur.borrowed += l.status === 'RECEIVED' ? (l.received ?? 0) : (l.accepted ?? 0);
      borrowedTotals.set(key, cur);
    }
    const usedOf = new Map(usage.map((u) => [(u.kitTypeId ?? u.drugMasterId) as string, u.qtyUsed]));
    const unusedBorrowed = [...borrowedTotals.entries()]
      .map(([key, b]) => ({ key, name: b.name, unit: b.unit, borrowed: b.borrowed, used: usedOf.get(key) ?? 0, unused: Math.max(0, b.borrowed - (usedOf.get(key) ?? 0)) }))
      .filter((r) => r.unused > 0);
    const usageLines = usage.map((u) => ({ ...u, valueThb: u.drugMasterId && priceOf.get(u.drugMasterId) != null ? Math.round(u.qtyUsed * (priceOf.get(u.drugMasterId) as number) * 100) / 100 : null }));
    const outstanding = legs.filter((l) => l.ro_id && l.ro_status !== 'RETURNED' && l.ro_status !== 'WAIVED');
    return {
      ok: true,
      data: {
        incident: { id: incident.id, incidentNo: incident.incident_no, status: incident.status, type: incident.incident_type },
        borrowed: [...byLender.values()],
        unusedBorrowed,
        usage: usageLines,
        totals: {
          lenders: byLender.size,
          borrowedLines: legs.length,
          outstandingReturns: outstanding.length,
          usageValueThb: Math.round(usageLines.reduce((s, u) => s + (u.valueThb ?? 0), 0) * 100) / 100,
          unpricedUsageLines: usageLines.filter((u) => u.valueThb === null).length,
        },
        notes: ['ระบบสรุปรายการใช้เพื่อประกอบการเบิกจ่าย (พ.ร.บ./UCEP) ผู้ใช้ยื่นเบิกผ่านช่องทางปกติของโรงพยาบาล ระบบไม่ยื่นเบิกให้ (BR-F3-029)'],
      },
    };
  }
}

export const incidentsService = new IncidentsService();
