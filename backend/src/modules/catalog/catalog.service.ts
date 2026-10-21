/**
 * Read-only catalogues: the central drug master, the central list of non-drug items (supplies / blood), a hospital's own
 * drug list with its code mapping, and the F3 kit types with their recipes.
 */
import { hospitalForRead } from '../../core/scope.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

const ITEM_TYPES = ['DRUG', 'SUPPLY', 'BLOOD'] as const;

const masterView = (d: Record<string, any>) => ({
  id: d.id,
  type: d.item_type,
  gpId: d.gp_id,
  internalCode: d.internal_code,
  genericName: d.generic_name,
  strength: d.strength,
  dosageForm: d.dosage_form,
  baseUnit: d.base_unit,
  coldChain: d.is_cold_chain,
  blood: d.is_blood_product,
  highAlert: d.is_high_alert,
  controlled: d.is_controlled,
  emergencyClass: d.emergency_class,
});

const MASTER_COLS_NO_ID = `dm.item_type::text AS item_type, dm.gp_id, dm.internal_code, dm.generic_name, dm.strength, dm.dosage_form,
  dm.base_unit, dm.is_cold_chain, dm.is_blood_product, dm.is_high_alert, dm.is_controlled, dm.emergency_class`;
const MASTER_COLS = `dm.id, ${MASTER_COLS_NO_ID}`;

function like(raw: Record<string, unknown>): string | null {
  return typeof raw.q === 'string' && raw.q.trim() ? `%${raw.q.trim()}%` : null;
}

export class CatalogService {
  /** API-F2b-006 (and API-F2b-007 with `types` restricted to the central list). */
  async drugMaster(raw: Record<string, unknown>, only?: readonly string[]) {
    const page = parsePage(raw);
    const type = oneOf(raw.type, ITEM_TYPES, 'type');
    const params: unknown[] = [];
    const where: string[] = [];
    if (only) where.push(`dm.item_type::text = ANY($${params.push([...only])}::text[])`);
    if (type) where.push(`dm.item_type = $${params.push(type)}::catalog_item_type`);
    const q = like(raw);
    if (q) {
      params.push(q);
      where.push(`(dm.generic_name ILIKE $${params.length} OR dm.internal_code ILIKE $${params.length} OR dm.gp_id ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const result = await query(
      `SELECT ${MASTER_COLS} FROM drug_master dm ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY dm.item_type, dm.generic_name, dm.strength NULLS FIRST, dm.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const slice = toPage(result.rows, page);
    return { ok: true, items: slice.items.map(masterView), nextCursor: slice.nextCursor };
  }

  /** The signed-in hospital's drug list (HIS import) joined to the central master and its mapping status. */
  async hospitalDrugs(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const params: unknown[] = [hospitalId];
    const where = ['hd.hospital_id = $1'];
    const ved = oneOf(raw.ved, ['V', 'E', 'D'] as const, 'ved');
    if (ved) where.push(`hd.ved = $${params.push(ved)}::ved_class`);
    const status = oneOf(raw.mapping, ['UNMATCHED', 'SUGGESTED', 'VERIFIED', 'REJECTED', 'DEPRECATED'] as const, 'mapping');
    if (status) where.push(`m.status = $${params.push(status)}::mapping_status`);
    if (raw.active !== undefined) where.push(`hd.active = $${params.push(raw.active === 'true')}`);
    const q = like(raw);
    if (q) {
      params.push(q);
      where.push(`(hd.local_code ILIKE $${params.length} OR hd.local_name ILIKE $${params.length} OR dm.generic_name ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const result = await query(`${HOSPITAL_DRUG_SELECT} WHERE ${where.join(' AND ')} ORDER BY hd.local_code LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const slice = toPage(result.rows, page);
    return { ok: true, items: slice.items.map(hospitalDrugView), nextCursor: slice.nextCursor };
  }

  /** One listing with the mapping candidates the matcher proposed. */
  async hospitalDrug(user: AuthSessionUser, rawId: string, raw: Record<string, unknown>) {
    const id = uuidParam(rawId, 'id');
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const result = await query(`${HOSPITAL_DRUG_SELECT} WHERE hd.id = $1 AND hd.hospital_id = $2`, [id, hospitalId]);
    if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการยา');
    const candidates = await query(
      `SELECT mc.tmt_id, tr.name AS name, mc.score::float8 AS score, mc.score_parts
         FROM mapping_candidate mc LEFT JOIN tmt_reference tr ON tr.tmt_id = mc.tmt_id
        WHERE mc.drug_mapping_id = (SELECT id FROM drug_mapping WHERE hospital_drug_id = $1) ORDER BY mc.rank LIMIT 10`,
      [id],
    );
    const data = {
      ...hospitalDrugView(result.rows[0]),
      candidates: candidates.rows.map((c) => ({ tmtId: c.tmt_id, name: c.name, score: c.score, parts: c.score_parts ?? {} })),
    };
    return { ok: true, id, data };
  }

  /** API-F3-016: kit types with components and the per-patient recipe by triage level. */
  async kitTypes() {
    const [types, components, recipes] = await Promise.all([
      query(`SELECT id, code, name, description, needs_cold_chain, active FROM kit_type ORDER BY code`),
      query(
        `SELECT kc.kit_type_id, kc.qty_per_kit::float8 AS qty, ${MASTER_COLS}
           FROM kit_component kc JOIN drug_master dm ON dm.id = kc.drug_master_id ORDER BY dm.generic_name`,
      ),
      query(`SELECT triage::text AS triage, kit_type_id, qty_per_patient::float8 AS qty, is_critical_min FROM kit_recipe ORDER BY triage`),
    ]);
    return {
      ok: true,
      items: types.rows.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        coldChain: t.needs_cold_chain,
        active: t.active,
        components: components.rows.filter((c) => c.kit_type_id === t.id).map((c) => ({ qtyPerKit: c.qty, drug: masterView(c) })),
        recipes: recipes.rows.filter((r) => r.kit_type_id === t.id).map((r) => ({ triage: r.triage, qtyPerPatient: r.qty, criticalMin: r.is_critical_min })),
      })),
    };
  }
}

const HOSPITAL_DRUG_SELECT = `
  SELECT hd.id, hd.hospital_id, hd.local_code, hd.local_name, hd.local_unit, hd.unit_price_thb::float8 AS price, hd.ved::text AS ved,
         hd.abc::text AS abc, hd.tmt_id, hd.gp_id, hd.active, hd.expiry_threshold_days, hd.min_level::float8 AS min_level,
         hd.max_level::float8 AS max_level, hd.standard_lead_time_days, hd.drug_master_id,
         ${MASTER_COLS_NO_ID},
         m.status::text AS m_status, m.method AS m_method, m.confidence::float8 AS m_confidence, m.unit_conversion_factor::float8 AS m_factor,
         m.local_pack_unit AS m_pack_unit, m.base_units_per_pack::float8 AS m_base_per_pack, m.manufacturer AS m_manufacturer,
         m.suggested_by AS m_suggested_by, m.verified_at AS m_verified_at
    FROM hospital_drug hd
    LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
    LEFT JOIN drug_mapping m ON m.hospital_drug_id = hd.id`;

function hospitalDrugView(r: Record<string, any>) {
  return {
    id: r.id,
    localCode: r.local_code,
    localName: r.local_name,
    localUnit: r.local_unit,
    price: r.price,
    ved: r.ved,
    abc: r.abc,
    tmtId: r.tmt_id,
    gpId: r.gp_id,
    active: r.active,
    expiryThresholdDays: r.expiry_threshold_days,
    minLevel: r.min_level,
    maxLevel: r.max_level,
    leadTimeDays: r.standard_lead_time_days,
    master: r.drug_master_id ? masterView({ ...r, id: r.drug_master_id }) : null,
    mapping: r.m_status
      ? {
          status: r.m_status,
          method: r.m_method,
          confidence: r.m_confidence,
          factor: r.m_factor,
          packUnit: r.m_pack_unit,
          basePerPack: r.m_base_per_pack,
          manufacturer: r.m_manufacturer,
          suggestedBy: r.m_suggested_by,
          verifiedAt: r.m_verified_at ? new Date(r.m_verified_at).toISOString() : null,
        }
      : null,
  };
}

export const catalogService = new CatalogService();
