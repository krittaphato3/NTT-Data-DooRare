/**
 * F3 emergency plan (API-F3-005 / API-F3-006): rule-based assessment, the one-pass inventory check, the priority plan of
 * BR-F3-011 (ready sets -> pack from loose stock -> borrow whole sets -> borrow items) and its approval. Quantities come only
 * from `core/formulas/emergency.ts`; no Agent is connected yet, so the kits and extra items are the rule baseline
 * (`kit_recipe` / `incident_extra_rule`) and the run is recorded as SKIPPED (decision source FALLBACK).
 *
 * Stored shape (table `emergency_plan`): `estimated_need` / `critical_min` / `buffer` = `{ kits: {KIT_CODE: n}, extras: {drugMasterId: n} }`,
 * `steps` = ordered list of `{ step, kind, action, ... }` (the same array shape as the seed plans, with a `kind` added),
 * `shortfall` = `{ items: [{ item, need, available, shortage }] }`.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import type pg from 'pg';
import { auditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { holdKits, releaseKits } from '../../core/kitStock.js';
import { kitClass, needs, planKits, spread } from '../../core/formulas/emergency.js';
import type { Counts, EmergencyClass, KitInput, NeedLine, PlanResult, Rule } from '../../core/formulas/emergency.js';
import { notifyRoles } from '../../core/notify.js';
import { bodyObject, isUuid, uuidParam } from '../../core/validate.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import { loadEmergencyConfig } from './incidents.config.js';
import type { EmergencyConfig } from './incidents.config.js';
import { assertOpen, assertVersion, etaView, hospitalOf, iso, ownIncident, readCounts, userName } from './incidents.shared.js';
import type { IncidentRow } from './incidents.shared.js';

// ───────────────────────────── edits ─────────────────────────────

export interface PlanEdits {
  /** kit code -> sets to pack (may only lower the computed count; the rest becomes borrow quantity). */
  packOverrides: Record<string, number>;
  removeKits: string[];
  removeExtras: string[];
  /** kit code -> estimated sets (adds the line or replaces the rule quantity). */
  setKits: Record<string, number>;
  /** drug master id -> estimated quantity of an extra item (adds the line or replaces the rule quantity). */
  setExtras: Record<string, number>;
}

export const noEdits = (): PlanEdits => ({ packOverrides: {}, removeKits: [], removeExtras: [], setKits: {}, setExtras: {} });

function intMap(raw: unknown, name: string, keyIsUuid: boolean): Record<string, number> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'VALIDATION', `${name} ต้องเป็น object`);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new HttpError(400, 'VALIDATION', `${name}.${key} ต้องเป็นจำนวนเต็มตั้งแต่ 0`);
    if (keyIsUuid && !isUuid(key)) throw new HttpError(400, 'VALIDATION', `${name} ต้องใช้ id ของยาเป็น key`);
    out[key] = n;
  }
  return out;
}

function stringList(raw: unknown, name: string, uuid: boolean): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 200 || raw.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 60 || (uuid && !isUuid(v)))) {
    throw new HttpError(400, 'VALIDATION', `${name} ต้องเป็นรายการ${uuid ? ' id' : 'รหัส'}`);
  }
  return [...new Set(raw as string[])];
}

export function parseEdits(raw: unknown): PlanEdits {
  const o = bodyObject(raw);
  return {
    packOverrides: intMap(o.packOverrides, 'packOverrides', false),
    removeKits: stringList(o.removeKits, 'removeKits', false),
    removeExtras: stringList(o.removeExtras, 'removeExtras', true),
    setKits: intMap(o.setKits, 'setKits', false),
    setExtras: intMap(o.setExtras, 'setExtras', true),
  };
}

// ───────────────────────────── catalog and stock ─────────────────────────────

interface DrugInfo {
  id: string;
  name: string;
  unit: string;
  cls: EmergencyClass;
  blood: boolean;
}

interface Catalog {
  kits: Map<string, { id: string; code: string; name: string }>;
  kitRules: Rule[];
  recipes: Map<string, { item: string; perKit: number }[]>;
  extraRules: Rule[];
  drugs: Map<string, DrugInfo>;
}

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;

export async function loadCatalog(db: Db): Promise<Catalog> {
  const [kitRows, ruleRows, compRows, extraRows] = await Promise.all([
    db.query(`SELECT id, code, name FROM kit_type WHERE active ORDER BY code`),
    db.query(`SELECT kt.code, r.triage::text AS triage, r.qty_per_patient::float8 AS qty, r.is_critical_min FROM kit_recipe r JOIN kit_type kt ON kt.id = r.kit_type_id WHERE kt.active`),
    db.query(`SELECT kt.code, kc.drug_master_id, kc.qty_per_kit::float8 AS qty FROM kit_component kc JOIN kit_type kt ON kt.id = kc.kit_type_id WHERE kt.active ORDER BY kt.code, kc.drug_master_id`),
    db.query(`SELECT e.drug_master_id, e.triage::text AS triage, e.qty_per_patient::float8 AS qty, e.is_critical_min FROM incident_extra_rule e`),
  ]);
  const kits = new Map<string, { id: string; code: string; name: string }>();
  for (const k of kitRows.rows) kits.set(k.code, { id: k.id, code: k.code, name: k.name });
  const recipes = new Map<string, { item: string; perKit: number }[]>();
  for (const c of compRows.rows) recipes.set(c.code, [...(recipes.get(c.code) ?? []), { item: c.drug_master_id, perKit: c.qty }]);
  const drugIds = new Set<string>([...compRows.rows.map((c) => c.drug_master_id as string), ...extraRows.rows.map((e) => e.drug_master_id as string)]);
  const drugs = new Map<string, DrugInfo>();
  if (drugIds.size > 0) {
    const d = await db.query(
      `SELECT dm.id, ${DRUG_NAME} AS name, dm.base_unit, dm.emergency_class, dm.is_blood_product FROM drug_master dm WHERE dm.id = ANY($1::uuid[])`,
      [[...drugIds]],
    );
    for (const row of d.rows) drugs.set(row.id, { id: row.id, name: row.name, unit: row.base_unit, cls: row.emergency_class, blood: row.is_blood_product });
  }
  return {
    kits,
    kitRules: ruleRows.rows.map((r) => ({ key: r.code, triage: r.triage, perPatient: r.qty, critical: r.is_critical_min })),
    recipes,
    extraRules: extraRows.rows.map((e) => ({ key: e.drug_master_id, triage: e.triage, perPatient: e.qty, critical: e.is_critical_min })),
    drugs,
  };
}

/** Sets the use-ready step of a plan written by this module reserves (seed plans have no `kind`, they hold nothing). */
export function heldByPlan(plan: { steps: unknown } | null): Record<string, number> {
  const steps = Array.isArray(plan?.steps) ? (plan!.steps as Record<string, any>[]) : [];
  if (!steps.some((s) => s?.kind === 'CHECK')) return {};
  return (steps.find((s) => s?.kind === 'USE_READY')?.kits ?? {}) as Record<string, number>;
}

async function approvedPlan(db: Db, incidentId: string) {
  const r = await db.query(`SELECT id, revision, steps FROM emergency_plan WHERE incident_id = $1 AND status = 'APPROVED' ORDER BY revision DESC LIMIT 1`, [incidentId]);
  return r.rows[0] ?? null;
}

/**
 * Ready sets the incident has reserved right now, by kit code: the use-ready step of its approved plan plus the sets packed for
 * that plan since (earlier plans' packed sets were folded into this plan's use-ready count when it was approved).
 */
export async function incidentHolds(db: Db, incidentId: string): Promise<Record<string, number>> {
  const plan = await approvedPlan(db, incidentId);
  const modern = Array.isArray(plan?.steps) && plan.steps.some((x: Record<string, any>) => x?.kind === 'CHECK');
  if (!plan || !modern) return {};
  const holds = { ...heldByPlan(plan) };
  const done = await db.query(`SELECT kt.code, sum(t.qty)::int AS qty FROM kit_pack_task t JOIN kit_type kt ON kt.id = t.kit_type_id WHERE t.plan_id = $1 AND t.status = 'DONE' GROUP BY kt.code`, [plan.id]);
  for (const row of done.rows) holds[row.code] = (holds[row.code] ?? 0) + Number(row.qty);
  return holds;
}

async function readyByKit(db: Db, hospitalId: string, own: Record<string, number>): Promise<Record<string, number>> {
  const r = await db.query(
    `SELECT kt.code, ks.qty_ready, ks.qty_held FROM kit_stock ks JOIN kit_type kt ON kt.id = ks.kit_type_id WHERE ks.hospital_id = $1`,
    [hospitalId],
  );
  const out: Record<string, number> = {};
  for (const row of r.rows) out[row.code] = Math.max(0, Number(row.qty_ready) - Number(row.qty_held) + (own[row.code] ?? 0));
  return out;
}

/** Free (not reserved) usable loose stock per drug at the hospital: unexpired lots, base units. */
export async function looseByDrug(db: Db, hospitalId: string, drugIds: string[]): Promise<Record<string, number>> {
  if (drugIds.length === 0) return {};
  const r = await db.query(
    `SELECT hd.drug_master_id, sum(sl.qty_on_hand - sl.qty_held)::float8 AS free
       FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE sl.hospital_id = $1 AND hd.drug_master_id = ANY($2::uuid[]) AND sl.expiry_date > current_date AND sl.qty_on_hand > sl.qty_held
      GROUP BY hd.drug_master_id`,
    [hospitalId, drugIds],
  );
  const out: Record<string, number> = {};
  for (const row of r.rows) out[row.drug_master_id] = Number(row.free);
  return out;
}

// ───────────────────────────── plan generation ─────────────────────────────

interface Generated {
  estimated: { kits: Record<string, number>; extras: Record<string, number> };
  critical: { kits: Record<string, number>; extras: Record<string, number> };
  buffer: { kits: Record<string, number>; extras: Record<string, number> };
  steps: Record<string, unknown>[];
  shortfall: { items: { item: string; need: number; available: number; shortage: number }[] };
}

const toMap = <T extends { key: string }>(lines: T[], pick: (l: T) => number): Record<string, number> => Object.fromEntries(lines.map((l) => [l.key, pick(l)]));

async function generate(db: Db, incident: IncidentRow, counts: Counts, edits: PlanEdits, cfg: EmergencyConfig): Promise<Generated> {
  const catalog = await loadCatalog(db);
  const hospital = (await db.query(`SELECT has_blood_bank FROM hospital WHERE id = $1`, [incident.hospital_id])).rows[0];
  const notes: { kind: string; text: string }[] = [];

  let kitNeeds: NeedLine[] = needs(counts, catalog.kitRules).filter((l) => catalog.kits.has(l.key));
  let extraNeeds: NeedLine[] = needs(counts, catalog.extraRules);

  // BR-F3-031/032: only PRC group O, only between blood-bank hospitals, capped; anything else is a reminder.
  const bloodAllowed = cfg.blood.enabled && Boolean(hospital?.has_blood_bank);
  const cappedBlood: string[] = [];
  extraNeeds = extraNeeds.flatMap((line) => {
    if (!catalog.drugs.get(line.key)?.blood) return [line];
    if (!bloodAllowed) {
      notes.push({ kind: 'BLOOD_NOT_ALLOWED', text: 'PRC กรุ๊ป O: โรงพยาบาลนี้ไม่มีธนาคารเลือดหรือปิดการยืมเลือดฉุกเฉิน ขอผ่านธนาคารเลือด ไม่สร้างรายการ' });
      return [];
    }
    if (line.est > cfg.blood.prcOMaxUnits) cappedBlood.push(line.key);
    return [{ key: line.key, est: Math.min(line.est, cfg.blood.prcOMaxUnits), crit: Math.min(line.crit, cfg.blood.prcOMaxUnits) }];
  });

  // staff edits: remove, then add / replace
  const knownKits = new Set(catalog.kits.keys());
  for (const code of [...edits.removeKits, ...Object.keys(edits.setKits), ...Object.keys(edits.packOverrides)]) {
    if (!knownKits.has(code)) throw new HttpError(422, 'VALIDATION', `ไม่พบชุดยา ${code}`);
  }
  kitNeeds = kitNeeds.filter((l) => !edits.removeKits.includes(l.key));
  for (const [code, est] of Object.entries(edits.setKits)) {
    const existing = kitNeeds.find((l) => l.key === code);
    kitNeeds = [...kitNeeds.filter((l) => l.key !== code), { key: code, est, crit: Math.min(existing?.crit ?? 0, est) }];
  }
  const drugInfo = async (id: string): Promise<DrugInfo> => {
    const known = catalog.drugs.get(id);
    if (known) return known;
    const r = (await db.query(`SELECT dm.id, ${DRUG_NAME} AS name, dm.base_unit, dm.emergency_class, dm.is_blood_product, dm.item_type::text AS item_type FROM drug_master dm WHERE dm.id = $1`, [id])).rows[0];
    if (!r) throw new HttpError(422, 'VALIDATION', 'ไม่พบรายการยาที่เพิ่มในแผน');
    const info: DrugInfo = { id: r.id, name: r.name, unit: r.base_unit, cls: r.emergency_class, blood: r.is_blood_product };
    catalog.drugs.set(id, info);
    return info;
  };
  extraNeeds = extraNeeds.filter((l) => !edits.removeExtras.includes(l.key));
  for (const [id, est] of Object.entries(edits.setExtras)) {
    const info = await drugInfo(id);
    if (info.blood) {
      if (!bloodAllowed) throw new HttpError(422, 'BLOOD_NOT_ALLOWED', 'เพิ่มเลือดไม่ได้: ต้องเป็นโรงพยาบาลที่มีธนาคารเลือดและเปิดการยืมเลือดฉุกเฉิน (BR-F3-031)');
      if (est > cfg.blood.prcOMaxUnits) throw new HttpError(422, 'BLOOD_LIMIT', `PRC กรุ๊ป O ขอได้ไม่เกิน ${cfg.blood.prcOMaxUnits} ยูนิต (BR-F3-031)`);
      if (info.name.toLowerCase().indexOf('prc group o') !== 0) throw new HttpError(422, 'OUT_OF_SCOPE', 'ผลิตภัณฑ์เลือดอื่นขอผ่านธนาคารเลือด ไม่สร้างรายการในแผน (BR-F3-032)');
    }
    const existing = extraNeeds.find((l) => l.key === id);
    extraNeeds = [...extraNeeds.filter((l) => l.key !== id), { key: id, est, crit: Math.min(existing?.crit ?? 0, est) }];
  }
  kitNeeds = kitNeeds.filter((l) => l.est > 0);
  extraNeeds = extraNeeds.filter((l) => l.est > 0);

  // stock now: ready sets (plus the ones this incident already holds) and free loose stock of every item involved
  const own = await incidentHolds(db, incident.id);
  const ready = await readyByKit(db, incident.hospital_id, own);
  const itemIds = new Set<string>(extraNeeds.map((l) => l.key));
  for (const l of kitNeeds) for (const c of catalog.recipes.get(l.key) ?? []) itemIds.add(c.item);
  const loose = await looseByDrug(db, incident.hospital_id, [...itemIds]);

  const kitInputs: KitInput[] = kitNeeds.map((l) => ({ key: l.key, est: l.est, crit: l.crit, ready: ready[l.key] ?? 0, components: catalog.recipes.get(l.key) ?? [] }));
  const est: PlanResult = planKits(kitInputs, extraNeeds, loose, 'est', edits.packOverrides);
  if (est.rejectedOverrides.length > 0) {
    throw new HttpError(422, 'INVALID_PACK_OVERRIDE', 'จำนวนที่จะแพ็กเองเกินกว่าที่ของในคลังจัดได้ (ลดได้อย่างเดียว)', { rejected: est.rejectedOverrides });
  }
  const crit: PlanResult = planKits(kitInputs, extraNeeds, loose, 'crit');

  const kitMap = (r: PlanResult, f: (k: PlanResult['kits'][number]) => number) => Object.fromEntries(r.kits.map((k) => [k.key, f(k)]));
  const extraMap = (r: PlanResult, f: (k: PlanResult['extras'][number]) => number) => Object.fromEntries(r.extras.map((k) => [k.key, f(k)]));
  const classes = {
    kits: Object.fromEntries(kitNeeds.map((l) => [l.key, kitClass(l.crit)])),
    extras: Object.fromEntries(extraNeeds.map((l) => [l.key, catalog.drugs.get(l.key)?.cls ?? 'SUPPORTIVE'])),
  };
  const shortfall = spread(kitInputs.map((k) => ({ key: k.key, est: k.est, ready: k.ready, components: k.components })), extraNeeds, loose).filter((l) => l.shortage > 0);

  if (counts.BLACK > 0 || counts.UNKNOWN > 0) notes.push({ kind: 'BLACK_UNKNOWN', text: 'แจ้งเตือน: ผู้เสียชีวิต/ดำ และไม่ทราบระดับ ไม่สร้างรายการเวชภัณฑ์' });
  notes.push({ kind: 'BLOOD_OTHER', text: 'เตือน: ผลิตภัณฑ์เลือดอื่น (PRC กรุ๊ปอื่น, FFP, เกล็ดเลือด, cryo) ขอผ่านธนาคารเลือด ไม่มีรายการในแผน' });
  notes.push({ kind: 'EQUIPMENT', text: 'เตือน: อุปกรณ์ที่ใช้ซ้ำ (เครื่องช่วยหายใจ, AED, เครื่องให้สารน้ำ) และการเลือกโรงพยาบาลปลายทางอยู่นอกขอบเขตระบบ' });
  const eta = etaView(incident);

  const steps: Record<string, unknown>[] = [
    {
      step: 1, kind: 'CHECK', action: 'ตรวจสอบจำนวนผู้ป่วยตามระดับคัดแยก', source: 'RULE_FALLBACK', counts, edits,
      eta: { minutes: eta.minutes, source: eta.source, flags: eta.flags },
      ready: Object.fromEntries(kitInputs.map((k) => [k.key, k.ready])), loose,
      classes, noRecipe: est.kits.filter((k) => k.noRecipe).map((k) => k.key), cappedBlood,
    },
    { step: 2, kind: 'USE_READY', action: 'ใช้ชุดพร้อมใช้ที่มี', kits: kitMap(est, (k) => k.useReady), kitsCrit: kitMap(crit, (k) => k.useReady) },
    {
      step: 3, kind: 'PACK', action: 'แพ็กชุดเพิ่มจากส่วนประกอบในคลัง', kits: kitMap(est, (k) => k.pack), kitsCrit: kitMap(crit, (k) => k.pack),
      packMax: kitMap(est, (k) => k.packMax), overridden: est.kits.filter((k) => k.overridden).map((k) => k.key),
    },
    { step: 4, kind: 'BORROW_SET', action: 'ยืมชุดทั้งเซ็ตจาก รพ.ใกล้เคียง', kits: kitMap(est, (k) => k.borrowSet), kitsCrit: kitMap(crit, (k) => k.borrowSet) },
    {
      step: 5, kind: 'BORROW_ITEM', action: 'ยืมรายการนอกชุดรายชิ้น', extras: extraMap(est, (e) => e.borrow), extrasCrit: extraMap(crit, (e) => e.borrow),
      useLoose: extraMap(est, (e) => e.useLoose),
    },
    ...notes.map((n, i) => ({ step: 6 + i, kind: 'NOTE', code: n.kind, action: n.text })),
  ];

  return {
    estimated: { kits: toMap(kitNeeds, (l) => l.est), extras: toMap(extraNeeds, (l) => l.est) },
    critical: { kits: toMap(kitNeeds, (l) => l.crit), extras: toMap(extraNeeds, (l) => l.crit) },
    buffer: { kits: toMap(kitNeeds, (l) => l.est - l.crit), extras: toMap(extraNeeds, (l) => l.est - l.crit) },
    steps,
    shortfall: { items: shortfall.map((s) => ({ item: s.item, need: s.need, available: s.available, shortage: s.shortage })) },
  };
}

/** Edits of the latest live revision (kept when staff recalculate without sending new edits). */
export async function latestEdits(db: Db, incidentId: string): Promise<PlanEdits> {
  const r = await db.query(`SELECT steps FROM emergency_plan WHERE incident_id = $1 AND status <> 'CANCELLED' ORDER BY revision DESC LIMIT 1`, [incidentId]);
  const steps = r.rows[0]?.steps;
  const check = Array.isArray(steps) ? steps.find((s: Record<string, any>) => s?.kind === 'CHECK') : null;
  return { ...noEdits(), ...(check?.edits ?? {}) };
}

/** Writes a new revision (superseding unapproved ones). The caller holds the incident lock. */
export async function createRevision(client: pg.PoolClient, ctx: AuditContext, incident: IncidentRow, counts: Counts, edits: PlanEdits, reason: string): Promise<{ id: string; revision: number }> {
  const cfg = await loadEmergencyConfig(client, incident.hospital_id);
  const doc = await generate(client, incident, counts, edits, cfg);
  const input = { incidentId: incident.id, counts, edits };
  const run = (
    await client.query(
      `INSERT INTO agent_run (agent, task, ref_type, ref_id, hospital_id, model_id, input_hash, input, output, status)
       VALUES ('RULES', 'ASSESS', 'incident', $1, $2, NULL, $3, $4::jsonb, $5::jsonb, 'SKIPPED') RETURNING id`,
      [incident.id, incident.hospital_id, crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'), JSON.stringify(input), JSON.stringify({ mode: 'RULES_ONLY_NO_AGENT_CONNECTED', source: 'FALLBACK', estimated: doc.estimated })],
    )
  ).rows[0];
  await client.query(`UPDATE emergency_plan SET status = 'CANCELLED' WHERE incident_id = $1 AND status IN ('DRAFT', 'READY_FOR_APPROVAL')`, [incident.id]);
  const revision = Number((await client.query(`SELECT COALESCE(max(revision), 0) + 1 AS n FROM emergency_plan WHERE incident_id = $1`, [incident.id])).rows[0].n);
  const plan = (
    await client.query(
      `INSERT INTO emergency_plan (incident_id, revision, status, estimated_need, critical_min, buffer, steps, shortfall, agent_run_id)
       VALUES ($1, $2, 'READY_FOR_APPROVAL', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8) RETURNING id`,
      [incident.id, revision, JSON.stringify(doc.estimated), JSON.stringify(doc.critical), JSON.stringify(doc.buffer), JSON.stringify(doc.steps), JSON.stringify(doc.shortfall), run.id],
    )
  ).rows[0];
  await writeAudit(client, ctx, { action: 'INCIDENT_PLAN_CALCULATED', entityType: 'emergency_plan', entityId: plan.id, after: { incidentNo: incident.incident_no, revision, estimated: doc.estimated }, reason, agentRunId: run.id });
  return { id: plan.id, revision };
}

// ───────────────────────────── view ─────────────────────────────

const ALIASES: Record<string, string> = {
  ORS: 'Oral rehydration', ATROPINE_06: 'Atropine', FENTANYL_100: 'Fentanyl', ADRENALINE_1MG: 'Epinephrine', CEFTRIAXONE_1G: 'Ceftriaxone', PRC_O: 'PRC group O', TRANEXAMIC: 'Tranexamic',
};

const step = (steps: Record<string, any>[], kind: string, legacyStep: number) => steps.find((s) => s?.kind === kind) ?? steps.find((s) => !s?.kind && s?.step === legacyStep && (s.kits || s.extras)) ?? null;

export async function buildPlanView(db: Db, plan: Record<string, any>, incident: IncidentRow) {
  const catalog = await loadCatalog(db);
  const steps: Record<string, any>[] = Array.isArray(plan.steps) ? plan.steps : [];
  const est = plan.estimated_need ?? {};
  const crit = plan.critical_min ?? {};
  const check = steps.find((s) => s?.kind === 'CHECK') ?? null;
  const useReady = step(steps, 'USE_READY', 2);
  const pack = step(steps, 'PACK', 3);
  const borrowSet = step(steps, 'BORROW_SET', 4);
  const borrowItem = step(steps, 'BORROW_ITEM', 5);
  const legacy = !check;

  const kitCodes = Object.keys(est.kits ?? {}).sort();
  const kits = kitCodes.map((code) => {
    const kit = catalog.kits.get(code);
    const estimated = Number(est.kits[code] ?? 0);
    const critical = Number(crit.kits?.[code] ?? 0);
    return {
      code,
      kitTypeId: kit?.id ?? null,
      name: kit?.name ?? code,
      class: (check?.classes?.kits?.[code] as EmergencyClass | undefined) ?? kitClass(critical),
      estimated,
      critical,
      buffer: estimated - critical,
      ready: check?.ready?.[code] ?? null,
      useReady: Number(useReady?.kits?.[code] ?? 0),
      pack: Number(pack?.kits?.[code] ?? 0),
      packMax: pack?.packMax?.[code] ?? null,
      borrowSet: Number(borrowSet?.kits?.[code] ?? 0),
      critUseReady: useReady?.kitsCrit?.[code] ?? null,
      critPack: pack?.kitsCrit?.[code] ?? null,
      critBorrowSet: borrowSet?.kitsCrit?.[code] ?? null,
      noRecipe: Boolean(check?.noRecipe?.includes(code)),
      edited: Boolean(check?.edits && (code in (check.edits.setKits ?? {}) || code in (check.edits.packOverrides ?? {}))),
      rule: catalog.kitRules.filter((r) => r.key === code).map((r) => ({ triage: r.triage, perPatient: r.perPatient, critical: r.critical })),
    };
  });

  const extraKeys = Object.keys(est.extras ?? {}).sort();
  const extras = extraKeys.map((key) => {
    const drug = catalog.drugs.get(key);
    const alias = ALIASES[key];
    const estimated = Number(est.extras[key] ?? 0);
    const critical = Number(crit.extras?.[key] ?? 0);
    return {
      key,
      drugMasterId: drug ? drug.id : null,
      name: drug?.name ?? alias ?? key,
      unit: drug?.unit ?? null,
      class: (check?.classes?.extras?.[key] as EmergencyClass | undefined) ?? drug?.cls ?? 'SUPPORTIVE',
      blood: Boolean(drug?.blood),
      estimated,
      critical,
      buffer: estimated - critical,
      loose: check?.loose?.[key] ?? null,
      useLoose: borrowItem?.useLoose?.[key] ?? null,
      borrow: Number(borrowItem?.extras?.[key] ?? 0),
      critBorrow: borrowItem?.extrasCrit?.[key] ?? null,
      capped: Boolean(check?.cappedBlood?.includes(key)),
      edited: Boolean(check?.edits && key in (check.edits.setExtras ?? {})),
      rule: catalog.extraRules.filter((r) => r.key === key).map((r) => ({ triage: r.triage, perPatient: r.perPatient, critical: r.critical })),
    };
  });

  const itemIds = (plan.shortfall?.items ?? []).map((s: Record<string, any>) => s.item as string).filter(isUuid);
  const shortNames = new Map<string, string>();
  if (itemIds.length > 0) {
    for (const row of (await db.query(`SELECT dm.id, ${DRUG_NAME} AS name FROM drug_master dm WHERE dm.id = ANY($1::uuid[])`, [itemIds])).rows) shortNames.set(row.id, row.name);
  }
  const shortfall = Array.isArray(plan.shortfall?.items)
    ? plan.shortfall.items.map((s: Record<string, any>) => ({ item: s.item, name: shortNames.get(s.item) ?? s.item, need: s.need, available: s.available, shortage: s.shortage }))
    : [];

  const approver = await userName(db, plan.approved_by);
  return {
    id: (plan.id ?? null) as string | null,
    revision: Number(plan.revision),
    status: plan.status as string,
    source: (check?.source as string | undefined) ?? 'SEED',
    legacy,
    createdAt: iso(plan.created_at),
    approvedAt: iso(plan.approved_at),
    approvedBy: approver,
    agentRunId: plan.agent_run_id ?? null,
    counts: check?.counts ?? null,
    edits: check?.edits ?? null,
    kits,
    extras,
    shortfall,
    notes: steps.filter((s) => s?.kind === 'NOTE' || (!s?.kind && !s?.kits && !s?.extras && Number(s?.step) > 1)).map((s) => ({ kind: s.code ?? 'NOTE', text: String(s.action) })),
    steps: steps.map((s) => ({ step: s.step, kind: s.kind ?? null, action: s.action })),
  };
}

// ───────────────────────────── service ─────────────────────────────

class PlanService {
  /** API-F3-005: calculate / recalculate. `edits` omitted keeps the staff edits of the last revision; `edits: {}` resets them. */
  async calculate(req: Request, rawId: string) {
    const user = req.user!;
    const body = req.body === undefined || req.body === null ? {} : bodyObject(req.body);
    const edits = body.edits === undefined ? undefined : parseEdits(body.edits);
    const version = body.version === undefined ? undefined : Number(body.version);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) throw new HttpError(400, 'VALIDATION', 'version ไม่ถูกต้อง');
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertOpen(incident);
      assertVersion(incident, version);
      const counts = await readCounts(client, incident.id);
      const carried = edits ?? (await latestEdits(client, incident.id));
      if (body.preview === true) {
        // what the plan would be with these edits: nothing is stored, nothing is reserved (the screen uses it while staff adjust lines)
        const doc = await generate(client, incident, counts, carried, await loadEmergencyConfig(client, incident.hospital_id));
        const next = Number((await client.query(`SELECT COALESCE(max(revision), 0) + 1 AS n FROM emergency_plan WHERE incident_id = $1`, [incident.id])).rows[0].n);
        const row = { id: null, revision: next, status: 'DRAFT', estimated_need: doc.estimated, critical_min: doc.critical, buffer: doc.buffer, steps: doc.steps, shortfall: doc.shortfall, approved_by: null, approved_at: null, agent_run_id: null, created_at: new Date() };
        return { ok: true, id: incident.id, data: { preview: true, incident: { id: incident.id, status: incident.status, version: Number(incident.version) }, plan: await buildPlanView(client, row, incident) } };
      }
      const created = await createRevision(client, auditContext(req), incident, counts, carried, 'calculate');
      if (incident.status === 'OPEN') {
        await client.query(`UPDATE incident SET status = 'PLAN_REVIEW', updated_at = now(), version = version + 1 WHERE id = $1`, [incident.id]);
      }
      const plan = (await client.query(`SELECT * FROM emergency_plan WHERE id = $1`, [created.id])).rows[0];
      const fresh = (await client.query(`SELECT version, status::text AS status FROM incident WHERE id = $1`, [incident.id])).rows[0];
      return { ok: true, id: created.id, data: { incident: { id: incident.id, status: fresh.status, version: Number(fresh.version) }, plan: await buildPlanView(client, plan, incident) } };
    });
  }

  /** API-F3-006: HITL approval of the latest revision. Holds the ready sets it will use and creates the pack tasks. */
  async approve(req: Request, rawId: string) {
    const user = req.user!;
    const body = bodyObject(req.body);
    const planId = uuidParam(body.planId, 'planId');
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertOpen(incident);
      const plan = (await client.query(`SELECT * FROM emergency_plan WHERE id = $1 AND incident_id = $2 FOR UPDATE`, [planId, incident.id])).rows[0];
      if (!plan) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบแผนของเหตุการณ์นี้');
      const latest = Number((await client.query(`SELECT max(revision) AS r FROM emergency_plan WHERE incident_id = $1 AND status <> 'CANCELLED'`, [incident.id])).rows[0].r ?? 0);
      if (plan.status === 'APPROVED' && Number(plan.revision) === latest) throw new HttpError(409, 'ALREADY_APPROVED', 'แผนนี้อนุมัติแล้ว');
      if (plan.status !== 'READY_FOR_APPROVAL' || Number(plan.revision) !== latest) {
        throw new HttpError(409, 'STALE_PLAN', 'แผนนี้ไม่ใช่ฉบับล่าสุดที่รออนุมัติ กรุณารีเฟรช', { latestRevision: latest, status: plan.status });
      }
      const ctx = auditContext(req);
      const catalog = await loadCatalog(client);
      const prev = await approvedPlan(client, incident.id);
      const hospitalId = hospitalOf(user);

      // the superseded approved revision gives its reserved sets back before the new ones are reserved
      if (prev) {
        for (const [code, qty] of Object.entries(await incidentHolds(client, incident.id))) {
          const kit = catalog.kits.get(code);
          if (kit && qty > 0) await releaseKits(client, hospitalId, kit.id, qty);
        }
        await client.query(`UPDATE emergency_plan SET status = 'CANCELLED' WHERE id = $1`, [prev.id]);
      }
      await client.query(`DELETE FROM kit_pack_task WHERE status = 'TODO' AND plan_id IN (SELECT id FROM emergency_plan WHERE incident_id = $1)`, [incident.id]);

      const steps: Record<string, any>[] = plan.steps;
      const use = (steps.find((s) => s.kind === 'USE_READY')?.kits ?? {}) as Record<string, number>;
      const pack = (steps.find((s) => s.kind === 'PACK')?.kits ?? {}) as Record<string, number>;
      try {
        for (const [code, qty] of Object.entries(use)) {
          const kit = catalog.kits.get(code);
          if (kit && qty > 0) await holdKits(client, hospitalId, kit.id, qty);
        }
      } catch (error) {
        if (error instanceof HttpError && error.code === 'INSUFFICIENT_KITS') {
          throw new HttpError(409, 'STOCK_CHANGED', 'ชุดพร้อมใช้เปลี่ยนไปตั้งแต่คำนวณแผน กรุณาคำนวณแผนใหม่', error.details);
        }
        throw error;
      }
      let tasks = 0;
      for (const [code, qty] of Object.entries(pack)) {
        const kit = catalog.kits.get(code);
        if (kit && qty > 0) {
          await client.query(`INSERT INTO kit_pack_task (plan_id, hospital_id, kit_type_id, qty) VALUES ($1, $2, $3, $4)`, [plan.id, hospitalId, kit.id, qty]);
          tasks += 1;
        }
      }
      await client.query(`UPDATE emergency_plan SET status = 'APPROVED', approved_by = $2, approved_at = now() WHERE id = $1`, [plan.id, user.id]);
      await client.query(`UPDATE incident SET status = 'ACTIVE', updated_at = now(), version = version + 1 WHERE id = $1`, [incident.id]);
      await writeAudit(client, ctx, {
        action: 'INCIDENT_PLAN_APPROVED', entityType: 'emergency_plan', entityId: plan.id,
        before: { status: plan.status, supersedes: prev?.revision ?? null }, after: { incidentNo: incident.incident_no, revision: Number(plan.revision), packTasks: tasks, reservedKits: use },
      });
      if (tasks > 0) {
        await notifyRoles(client, hospitalId, ['WAREHOUSE_OFFICER'], {
          kind: 'KIT_PACK_REQUESTED', title: `เหตุ ${incident.incident_no}: ให้แพ็กชุดยา ${tasks} รายการ`, body: 'เปิดหน้าเตรียมชุดยาเพื่อยืนยันเมื่อแพ็กเสร็จ', refType: 'incident', refId: incident.id,
        });
      }
      await notifyRoles(client, hospitalId, ['ER_STAFF', 'PHARMACIST'], {
        kind: 'INCIDENT_PLAN_APPROVED', title: `อนุมัติแผน v${plan.revision} ของเหตุ ${incident.incident_no}`, refType: 'incident', refId: incident.id,
      });
      const fresh = (await client.query(`SELECT * FROM emergency_plan WHERE id = $1`, [plan.id])).rows[0];
      return { ok: true, id: plan.id, data: { incident: { id: incident.id, status: 'ACTIVE', version: Number(incident.version) + 1 }, plan: await buildPlanView(client, fresh, incident), packTasks: tasks } };
    });
  }
}

export const planService = new PlanService();
