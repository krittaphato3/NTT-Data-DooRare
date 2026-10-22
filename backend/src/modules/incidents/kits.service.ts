/**
 * F3 kit side: pack tasks of the warehouse (API-F3-009 / -010), the ready-set stock (API-F3-014 / -015) and the two rule tables
 * the plan is computed from (`GET/PUT /preset-kits`, `GET/PUT /incident-rules`; not in openapi, added for completeness).
 */
import type { Request } from 'express';
import type pg from 'pg';
import { auditContext, writeAudit } from '../../core/audit.js';
import { addKits, getKitStock, holdKits, setReadyKits } from '../../core/kitStock.js';
import { PLANNED_TRIAGE } from '../../core/formulas/emergency.js';
import type { Triage } from '../../core/formulas/emergency.js';
import { notifyRoles } from '../../core/notify.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { adjustStock, pickFefo } from '../../core/stock.js';
import { bodyObject, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { hospitalOf, iso, RUNNING_STATUSES } from './incidents.shared.js';
import { looseByDrug } from './plan.service.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

interface Component {
  kit_type_id: string;
  drug_master_id: string;
  per_kit: number;
  name: string;
  unit: string;
}

async function componentsOf(db: pg.Pool | pg.PoolClient, kitTypeIds: string[]): Promise<Component[]> {
  if (kitTypeIds.length === 0) return [];
  const r = await db.query(
    `SELECT kc.kit_type_id, kc.drug_master_id, kc.qty_per_kit::float8 AS per_kit, ${DRUG_NAME} AS name, dm.base_unit AS unit
       FROM kit_component kc JOIN drug_master dm ON dm.id = kc.drug_master_id WHERE kc.kit_type_id = ANY($1::uuid[]) ORDER BY dm.generic_name`,
    [kitTypeIds],
  );
  return r.rows as Component[];
}

/** Sets that could still be packed from the loose stock (floor of the scarcest component) and which item limits it. */
function packability(components: Component[], loose: Record<string, number>): { canPack: number; limitedBy: string | null } {
  if (components.length === 0) return { canPack: 0, limitedBy: null };
  let canPack = Infinity;
  let limitedBy: string | null = null;
  for (const c of components) {
    const n = Math.floor((loose[c.drug_master_id] ?? 0) / c.per_kit + 1e-9);
    if (n < canPack) {
      canPack = n;
      limitedBy = c.name;
    }
  }
  return { canPack: Math.max(0, canPack), limitedBy };
}

const TASK_SELECT = `
  SELECT t.id, t.qty, t.status, t.confirmed_at, t.confirmed_by, kt.id AS kit_type_id, kt.code, kt.name AS kit_name,
         p.id AS plan_id, p.revision, p.status::text AS plan_status, i.id AS incident_id, i.incident_no, i.status::text AS incident_status, i.incident_type, i.created_at AS incident_at,
         u.display_name AS confirmed_by_name
    FROM kit_pack_task t
    JOIN kit_type kt ON kt.id = t.kit_type_id
    JOIN emergency_plan p ON p.id = t.plan_id
    JOIN incident i ON i.id = p.incident_id
    LEFT JOIN app_user u ON u.id = t.confirmed_by`;

class KitsService {
  /** API-F3-009: pack tasks of the caller's hospital with the component check for the open ones. */
  async tasks(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = hospitalOf(user);
    const page = parsePage(raw);
    const status = oneOf(raw.status, ['TODO', 'DONE'] as const, 'status');
    const params: unknown[] = [hospitalId];
    const where = ['t.hospital_id = $1', `(t.status = 'DONE' OR i.status::text = ANY($2::text[]))`];
    params.push([...RUNNING_STATUSES]);
    if (status) where.push(`t.status = $${params.push(status)}`);
    if (raw.incidentId !== undefined) where.push(`i.id = $${params.push(uuidParam(raw.incidentId, 'incidentId'))}`);
    params.push(page.limit + 1, page.offset);
    const rows = (await query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY (t.status = 'TODO') DESC, i.created_at DESC, kt.code LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
    const slice = toPage(rows, page);
    const comps = await componentsOf(pool, [...new Set(slice.items.map((r) => r.kit_type_id as string))]);
    const loose = await looseByDrug(pool, hospitalId, [...new Set(comps.map((c) => c.drug_master_id))]);
    const items = slice.items.map((r) => {
      const components = comps
        .filter((c) => c.kit_type_id === r.kit_type_id)
        .map((c) => {
          const need = round3(Number(r.qty) * c.per_kit);
          const free = round3(loose[c.drug_master_id] ?? 0);
          return { drugMasterId: c.drug_master_id, name: c.name, unit: c.unit, perKit: c.per_kit, need, free, enough: free + 1e-9 >= need };
        });
      return {
        id: r.id,
        status: r.status as 'TODO' | 'DONE',
        qty: Number(r.qty),
        kit: { id: r.kit_type_id, code: r.code, name: r.kit_name },
        incident: { id: r.incident_id, incidentNo: r.incident_no, status: r.incident_status, type: r.incident_type, createdAt: iso(r.incident_at) },
        plan: { id: r.plan_id, revision: Number(r.revision), status: r.plan_status },
        confirmedAt: iso(r.confirmed_at),
        confirmedBy: r.confirmed_by ? { id: r.confirmed_by, name: r.confirmed_by_name } : null,
        components,
        canConfirm: r.status === 'TODO' && (RUNNING_STATUSES as readonly string[]).includes(r.incident_status) && components.length > 0 && components.every((c) => c.enough),
      };
    });
    return { ok: true, items, nextCursor: slice.nextCursor };
  }

  /** API-F3-010: packing is finished -> loose components out (by recipe, FEFO), ready sets in, the sets reserved for the incident. */
  async confirmTask(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = hospitalOf(user);
    const id = uuidParam(rawId, 'id');
    return withTransaction(async (client) => {
      const task = (await client.query(`${TASK_SELECT} WHERE t.id = $1 AND t.hospital_id = $2 FOR UPDATE OF t`, [id, hospitalId])).rows[0];
      if (!task) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบงานแพ็กชุดยา');
      if (task.status === 'DONE') throw new HttpError(409, 'ALREADY_DONE', 'งานแพ็กนี้ยืนยันแล้ว');
      if (!(RUNNING_STATUSES as readonly string[]).includes(task.incident_status)) throw new HttpError(409, 'INVALID_STATE', 'เหตุการณ์นี้ปิดหรือยกเลิกแล้ว');
      if (task.plan_status !== 'APPROVED') throw new HttpError(409, 'STALE_PLAN', 'แผนถูกแก้ไขแล้ว กรุณารีเฟรช');
      const comps = (await componentsOf(client, [task.kit_type_id])).filter((c) => c.kit_type_id === task.kit_type_id);
      if (comps.length === 0) throw new HttpError(422, 'NO_RECIPE', 'ชุดนี้ยังไม่มีสูตรส่วนประกอบ แพ็กในระบบไม่ได้');
      const qty = Number(task.qty);
      const loose = await looseByDrug(client, hospitalId, comps.map((c) => c.drug_master_id));
      const short = comps
        .map((c) => ({ name: c.name, need: round3(qty * c.per_kit), free: round3(loose[c.drug_master_id] ?? 0) }))
        .filter((c) => c.free + 1e-9 < c.need);
      if (short.length > 0) throw new HttpError(409, 'INSUFFICIENT_COMPONENTS', 'ส่วนประกอบในคลังไม่พอสำหรับแพ็กชุดนี้', { short });

      const used: { drugMasterId: string; qty: number }[] = [];
      for (const c of comps) {
        const need = round3(qty * c.per_kit);
        const picks = await pickFefo(client, hospitalId, c.drug_master_id, need, 0);
        for (const p of picks) {
          await adjustStock(client, hospitalId, { lotId: p.lotId, delta: -round3(p.qty), reason: 'KIT_PACK', refType: 'kit_pack_task', refId: id, actorId: user.id });
        }
        used.push({ drugMasterId: c.drug_master_id, qty: need });
      }
      await addKits(client, hospitalId, task.kit_type_id, qty);
      await holdKits(client, hospitalId, task.kit_type_id, qty); // packed for this incident, not for lending
      await client.query(`UPDATE kit_pack_task SET status = 'DONE', confirmed_by = $2, confirmed_at = now() WHERE id = $1`, [id, user.id]);
      await writeAudit(client, auditContext(req), {
        action: 'KIT_PACKED', entityType: 'kit_pack_task', entityId: id, before: { status: 'TODO' },
        after: { incidentNo: task.incident_no, kit: task.code, qty, componentsUsed: used },
      });
      await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST'], { kind: 'KIT_PACKED', title: `แพ็ก ${task.kit_name} ${qty} ชุด เสร็จแล้ว (${task.incident_no})`, refType: 'incident', refId: task.incident_id });
      const state = await getKitStock(client, hospitalId, task.kit_type_id);
      return { ok: true, id, data: { id, status: 'DONE', qty, kitStock: state, componentsUsed: used } };
    });
  }

  /** API-F3-014: ready sets of the caller's hospital for every active kit type. */
  async stock(user: AuthSessionUser) {
    const hospitalId = hospitalOf(user);
    const kits = (await query(`SELECT id, code, name, needs_cold_chain FROM kit_type WHERE active ORDER BY code`)).rows;
    const stock = new Map((await query(`SELECT kit_type_id, qty_ready, qty_held, updated_at FROM kit_stock WHERE hospital_id = $1`, [hospitalId])).rows.map((r) => [r.kit_type_id, r]));
    const comps = await componentsOf(pool, kits.map((k) => k.id));
    const loose = await looseByDrug(pool, hospitalId, [...new Set(comps.map((c) => c.drug_master_id))]);
    const items = kits.map((k) => {
      const s = stock.get(k.id);
      const ready = Number(s?.qty_ready ?? 0);
      const held = Number(s?.qty_held ?? 0);
      const pack = packability(comps.filter((c) => c.kit_type_id === k.id), loose);
      return {
        kitTypeId: k.id, code: k.code, name: k.name, needsColdChain: k.needs_cold_chain,
        ready, held, free: ready - held, canPackMore: pack.canPack, limitedBy: pack.limitedBy, noRecipe: !comps.some((c) => c.kit_type_id === k.id),
        updatedAt: iso(s?.updated_at),
      };
    });
    return { ok: true, items };
  }

  /** API-F3-015: warehouse sets the ready count after a physical count. */
  async putStock(req: Request, rawKitTypeId: string) {
    const user = req.user!;
    const hospitalId = hospitalOf(user);
    const kitTypeId = uuidParam(rawKitTypeId, 'kitTypeId');
    const body = bodyObject(req.body);
    const qtyReady = Number(body.qtyReady);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    return withTransaction(async (client) => {
      const kit = (await client.query(`SELECT id, code, name FROM kit_type WHERE id = $1 AND active`, [kitTypeId])).rows[0];
      if (!kit) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบชนิดชุดยา');
      const { before, after } = await setReadyKits(client, hospitalId, kitTypeId, qtyReady);
      await writeAudit(client, auditContext(req), { action: 'KIT_STOCK_SET', entityType: 'kit_stock', entityId: kitTypeId, before, after: { kit: kit.code, ...after }, reason: reason || null });
      return { ok: true, id: kitTypeId, data: { kitTypeId, code: kit.code, name: kit.name, ...after } };
    });
  }

  // ───────────── rule tables ─────────────

  /** `GET /preset-kits`: kits per patient by triage level (the baseline the plan is computed from). */
  async presetKits(db: Db = pool) {
    const kits = (await db.query(`SELECT id, code, name FROM kit_type WHERE active ORDER BY code`)).rows;
    const rules = (await db.query(`SELECT kit_type_id, triage::text AS triage, qty_per_patient::float8 AS qty, is_critical_min FROM kit_recipe ORDER BY triage`)).rows;
    return {
      ok: true,
      items: kits.map((k) => ({
        kitTypeId: k.id, code: k.code, name: k.name,
        rules: rules.filter((r) => r.kit_type_id === k.id).map((r) => ({ triage: r.triage as Triage, qtyPerPatient: r.qty, criticalMin: r.is_critical_min })),
      })),
    };
  }

  /** `GET /incident-rules`: extra items outside the kits per patient by triage level. */
  async incidentRules(db: Db = pool) {
    const rules = (
      await db.query(
        `SELECT e.drug_master_id, ${DRUG_NAME} AS name, dm.base_unit, dm.emergency_class, dm.is_blood_product, e.triage::text AS triage, e.qty_per_patient::float8 AS qty, e.is_critical_min
           FROM incident_extra_rule e JOIN drug_master dm ON dm.id = e.drug_master_id ORDER BY dm.generic_name, e.triage`,
      )
    ).rows;
    const byDrug = new Map<string, any>();
    for (const r of rules) {
      const entry = byDrug.get(r.drug_master_id) ?? { drug: { id: r.drug_master_id, name: r.name, unit: r.base_unit, class: r.emergency_class, blood: r.is_blood_product }, rules: [] };
      entry.rules.push({ triage: r.triage as Triage, qtyPerPatient: r.qty, criticalMin: r.is_critical_min });
      byDrug.set(r.drug_master_id, entry);
    }
    return { ok: true, items: [...byDrug.values()] };
  }

  private parseRules(raw: unknown): { triage: Triage; qty: number; critical: boolean }[] {
    const body = bodyObject(raw);
    if (!Array.isArray(body.rules) || body.rules.length > 3) throw new HttpError(400, 'VALIDATION', 'rules ต้องเป็นรายการไม่เกิน 3 ระดับ (RED, YELLOW, GREEN)');
    const seen = new Set<string>();
    return body.rules.map((r: unknown) => {
      const o = bodyObject(r);
      const triage = oneOf(o.triage, PLANNED_TRIAGE as readonly Triage[], 'triage');
      const qty = Number(o.qtyPerPatient);
      if (!triage || seen.has(triage)) throw new HttpError(400, 'VALIDATION', 'triage ต้องเป็น RED | YELLOW | GREEN และห้ามซ้ำ');
      if (!Number.isFinite(qty) || qty < 0 || qty > 1000) throw new HttpError(400, 'VALIDATION', 'qtyPerPatient ต้องเป็นตัวเลข 0-1000');
      seen.add(triage);
      return { triage, qty: Math.round(qty * 1000) / 1000, critical: Boolean(o.criticalMin) };
    });
  }

  /** `PUT /preset-kits/{kitTypeId}`: replaces the per-patient rows of a kit (system admin; applies to every hospital). */
  async putPresetKit(req: Request, rawId: string) {
    const kitTypeId = uuidParam(rawId, 'kitTypeId');
    const rules = this.parseRules(req.body);
    if (rules.some((r) => r.qty > 9999.99)) throw new HttpError(400, 'VALIDATION', 'qtyPerPatient สูงเกินไป');
    return withTransaction(async (client) => {
      const kit = (await client.query(`SELECT id, code FROM kit_type WHERE id = $1 AND active`, [kitTypeId])).rows[0];
      if (!kit) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบชนิดชุดยา');
      const before = (await client.query(`SELECT triage::text AS triage, qty_per_patient::float8 AS qty, is_critical_min FROM kit_recipe WHERE kit_type_id = $1 ORDER BY triage`, [kitTypeId])).rows;
      await client.query(`DELETE FROM kit_recipe WHERE kit_type_id = $1`, [kitTypeId]);
      for (const r of rules) {
        await client.query(`INSERT INTO kit_recipe (triage, kit_type_id, qty_per_patient, is_critical_min) VALUES ($1::triage_level, $2, $3, $4)`, [r.triage, kitTypeId, r.qty, r.critical]);
      }
      await writeAudit(client, auditContext(req), { action: 'PRESET_KIT_RULES_UPDATED', entityType: 'kit_recipe', entityId: kitTypeId, before, after: { kit: kit.code, rules } });
      return { ok: true, id: kitTypeId, data: (await this.presetKits(client)).items.find((i) => i.kitTypeId === kitTypeId) };
    });
  }

  /** `PUT /incident-rules/{drugMasterId}`: replaces the per-patient rows of an extra item. */
  async putIncidentRule(req: Request, rawId: string) {
    const drugId = uuidParam(rawId, 'drugMasterId');
    const rules = this.parseRules(req.body);
    return withTransaction(async (client) => {
      const drug = (await client.query(`SELECT id, generic_name, is_blood_product FROM drug_master WHERE id = $1`, [drugId])).rows[0];
      if (!drug) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการยา');
      const before = (await client.query(`SELECT triage::text AS triage, qty_per_patient::float8 AS qty, is_critical_min FROM incident_extra_rule WHERE drug_master_id = $1 ORDER BY triage`, [drugId])).rows;
      await client.query(`DELETE FROM incident_extra_rule WHERE drug_master_id = $1`, [drugId]);
      for (const r of rules) {
        await client.query(`INSERT INTO incident_extra_rule (triage, drug_master_id, qty_per_patient, is_critical_min) VALUES ($1::triage_level, $2, $3, $4)`, [r.triage, drugId, r.qty, r.critical]);
      }
      await writeAudit(client, auditContext(req), { action: 'INCIDENT_RULES_UPDATED', entityType: 'incident_extra_rule', entityId: drugId, before, after: { drug: drug.generic_name, rules } });
      return { ok: true, id: drugId, data: (await this.incidentRules(client)).items.find((i) => i.drug.id === drugId) ?? { drug: { id: drugId }, rules: [] } };
    });
  }
}

export const kitsService = new KitsService();
