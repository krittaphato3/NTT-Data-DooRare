/**
 * Hospitals of the caller's region. Everyone signed in can read them (borrow screens need the list);
 * only SYSTEM_ADMIN creates / edits (admin console ADM-02). Hospitals are never deleted, only deactivated.
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

const TIERS = ['TERTIARY', 'SECONDARY', 'COMMUNITY', 'PRIMARY'] as const;

const SELECT = `
  SELECT h.id, h.code, h.name_th, h.name_en, h.region_id, r.code AS region_code, h.network_id, n.name AS network_name,
         h.province, h.tier, h.bed_count, h.address, h.phone, h.lat::float8 AS lat, h.lon::float8 AS lon, h.is_urban,
         h.has_cold_chain, h.has_blood_bank, h.agent_participation, h.active, h.version, h.updated_at
    FROM hospital h JOIN region r ON r.id = h.region_id LEFT JOIN network n ON n.id = h.network_id`;

const view = (h: Record<string, any>) => ({
  id: h.id,
  code: h.code,
  nameTh: h.name_th,
  nameEn: h.name_en,
  region: { id: h.region_id, code: h.region_code },
  network: h.network_id ? { id: h.network_id, name: h.network_name } : null,
  province: h.province,
  tier: h.tier,
  bedCount: h.bed_count,
  address: h.address,
  phone: h.phone,
  lat: h.lat,
  lon: h.lon,
  isUrban: h.is_urban,
  hasColdChain: h.has_cold_chain,
  hasBloodBank: h.has_blood_bank,
  agentParticipation: h.agent_participation,
  active: h.active,
  version: Number(h.version),
  updatedAt: new Date(h.updated_at).toISOString(),
});

/** Region filter: the caller's region, or the region of their hospital; a system admin with neither sees every region. */
const REGION_SQL = `(CASE WHEN $1::uuid IS NULL AND $2::uuid IS NULL THEN true
                            ELSE h.region_id = COALESCE($1::uuid, (SELECT region_id FROM hospital WHERE id = $2::uuid)) END)`;

function text(body: Record<string, unknown>, key: string, { required = false, max = 200 } = {}): string | null | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, 'VALIDATION', `ต้องระบุ ${key}`);
    return undefined;
  }
  if (value === null || value === '') {
    if (required) throw new HttpError(400, 'VALIDATION', `${key} ห้ามว่าง`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max) throw new HttpError(400, 'VALIDATION', `${key} ไม่ถูกต้อง`);
  return value.trim();
}

function bool(body: Record<string, unknown>, key: string): boolean | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== 'boolean') throw new HttpError(400, 'VALIDATION', `${key} ต้องเป็น true/false`);
  return body[key] as boolean;
}

function parseFields(body: Record<string, unknown>, creating: boolean) {
  const tier = text(body, 'tier', { max: 20 });
  if (tier && !(TIERS as readonly string[]).includes(tier)) throw new HttpError(400, 'VALIDATION', `tier ต้องเป็นหนึ่งใน ${TIERS.join(', ')}`);
  return {
    code: text(body, 'code', { required: creating, max: 12 }),
    name_th: text(body, 'nameTh', { required: creating }),
    name_en: text(body, 'nameEn'),
    province: text(body, 'province', { max: 80 }),
    tier,
    address: text(body, 'address', { max: 400 }),
    phone: text(body, 'phone', { max: 40 }),
    bed_count: optionalNumber(body.bedCount, 'bedCount', { min: 0, max: 100000 }),
    lat: optionalNumber(body.lat, 'lat', { min: -90, max: 90 }),
    lon: optionalNumber(body.lon, 'lon', { min: -180, max: 180 }),
    is_urban: bool(body, 'isUrban'),
    has_cold_chain: bool(body, 'hasColdChain'),
    has_blood_bank: bool(body, 'hasBloodBank'),
    agent_participation: bool(body, 'agentParticipation'),
    active: bool(body, 'active'),
  };
}

export class HospitalsService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const params: unknown[] = [user.regionId, user.hospitalId];
    const where = [REGION_SQL];
    if (raw.active !== undefined) where.push(`h.active = $${params.push(raw.active === 'true')}`);
    if (typeof raw.q === 'string' && raw.q.trim()) {
      params.push(`%${raw.q.trim()}%`);
      where.push(`(h.code ILIKE $${params.length} OR h.name_th ILIKE $${params.length} OR h.name_en ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const result = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY h.code LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const slice = toPage(result.rows, page);
    return { ok: true, items: slice.items.map(view), nextCursor: slice.nextCursor };
  }

  async get(user: AuthSessionUser, rawId: string) {
    const id = uuidParam(rawId, 'hospitalId');
    const result = await query(`${SELECT} WHERE h.id = $3 AND ${REGION_SQL}`, [user.regionId, user.hospitalId, id]);
    if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโรงพยาบาล');
    const data = view(result.rows[0]);
    return { ok: true, id: data.id, version: data.version, data };
  }

  async create(req: Request) {
    const user = req.user!;
    const fields = parseFields(bodyObject(req.body), true);
    return withTransaction(async (client) => {
      const region = user.regionId
        ? { id: user.regionId }
        : (await client.query(`SELECT id FROM region ORDER BY code LIMIT 1`)).rows[0];
      if (!region) throw new HttpError(409, 'CONFLICT', 'ไม่มีเขตสุขภาพสำหรับสร้างโรงพยาบาล');
      const inserted = await client.query(
        `INSERT INTO hospital (region_id, code, name_th, name_en, province, tier, address, phone, bed_count, lat, lon, is_urban, has_cold_chain, has_blood_bank, agent_participation, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, true), COALESCE($13, false), COALESCE($14, false), COALESCE($15, true), COALESCE($16, true))
         RETURNING id`,
        [region.id, fields.code, fields.name_th, fields.name_en ?? null, fields.province ?? null, fields.tier ?? null, fields.address ?? null, fields.phone ?? null, fields.bed_count ?? null, fields.lat ?? null, fields.lon ?? null, fields.is_urban, fields.has_cold_chain, fields.has_blood_bank, fields.agent_participation, fields.active],
      );
      const row = (await client.query(`${SELECT} WHERE h.id = $1`, [inserted.rows[0].id])).rows[0];
      await writeAudit(client, auditContext(req), { action: 'HOSPITAL_CREATED', entityType: 'hospital', entityId: row.id, after: view(row) });
      const data = view(row);
      return { ok: true, id: data.id, version: data.version, data };
    });
  }

  /** Partial update with an optimistic lock (`version` in the body). */
  async update(req: Request, rawId: string) {
    const id = uuidParam(rawId, 'hospitalId');
    const body = bodyObject(req.body);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    if (version === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องส่ง version');
    const fields = parseFields(body, false);
    const sets: string[] = [];
    const values: unknown[] = [id];
    for (const [column, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, 'VALIDATION', 'ไม่มีฟิลด์ที่จะแก้ไข');
    return withTransaction(async (client) => {
      const before = (await client.query(`${SELECT} WHERE h.id = $1 FOR UPDATE OF h`, [id])).rows[0];
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโรงพยาบาล');
      if (Number(before.version) !== version) {
        throw new HttpError(409, 'VERSION_CONFLICT', 'ข้อมูลโรงพยาบาลถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(before.version) });
      }
      await client.query(`UPDATE hospital SET ${sets.join(', ')}, updated_at = now(), version = version + 1 WHERE id = $1`, values);
      const row = (await client.query(`${SELECT} WHERE h.id = $1`, [id])).rows[0];
      await writeAudit(client, auditContext(req), {
        action: before.active && !row.active ? 'HOSPITAL_DEACTIVATED' : 'HOSPITAL_UPDATED',
        entityType: 'hospital',
        entityId: id,
        before: view(before),
        after: view(row),
      });
      const data = view(row);
      return { ok: true, id: data.id, version: data.version, data };
    });
  }
}

export const hospitalsService = new HospitalsService();
