/**
 * API-AD-001 `GET /config`, API-AD-002 `PUT /config/{key}` and API-AD-004 `POST /agent/kill-switch`.
 *
 * Values live in `config_setting`; the catalogue in `config.catalogue.ts` supplies type/default/bounds and
 * decides which keys are writable. Effective value order: HOSPITAL → REGION → GLOBAL → file default
 * (display only — `core/settings.ts` is unchanged in this step, see the session note).
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, isUuid } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import type { ConfigItemView } from './admin.types.js';
import {
  CONFIG_CATALOGUE,
  CONFIG_GROUP_ORDER,
  READ_ONLY_REASON,
  isRestrictedConfigKey,
  requireConfigKey,
  validateConfigValue,
  type ConfigKeySpec,
} from './config.catalogue.js';
import { isEditableForRole, parseConfigScope, resolveEffective, type ConfigRow, type ScopeContext } from './config.rules.js';

const ROWS_SQL = `
  SELECT cs.key, cs.scope, cs.value, cs.updated_at, cs.updated_by, u.display_name AS updated_by_name
    FROM config_setting cs
    LEFT JOIN app_user u ON u.id = cs.updated_by
   WHERE cs.key = ANY($1::text[])`;

const GROUP_ORDER = new Map(CONFIG_GROUP_ORDER.map((group, index) => [group, index]));

const groupOrder = (group: string): number => GROUP_ORDER.get(group) ?? CONFIG_GROUP_ORDER.length;

/** Rejects a scope that names a hospital/region that does not exist (config_setting.scope is free text). */
async function assertScopeTargetExists(scope: string): Promise<void> {
  const [kind, id] = scope.split(':');
  if (kind === 'HOSPITAL') {
    const found = await query(`SELECT 1 FROM hospital WHERE id = $1`, [id]);
    if (!found.rows[0]) throw new HttpError(400, 'VALIDATION', 'ไม่พบโรงพยาบาลตาม scope ที่ระบุ');
  } else if (kind === 'REGION') {
    const found = await query(`SELECT 1 FROM region WHERE id = $1`, [id]);
    if (!found.rows[0]) throw new HttpError(400, 'VALIDATION', 'ไม่พบเขตสุขภาพตาม scope ที่ระบุ');
  }
}

/** The hospital/region an effective value is computed for (SA may name one for reads). */
async function scopeContextFor(user: AuthSessionUser, raw: Record<string, unknown>): Promise<ScopeContext> {
  let hospitalId = user.hospitalId;
  let regionId = user.regionId;

  const requestedHospital = raw.hospitalId;
  if (!user.hospitalId && requestedHospital !== undefined) {
    if (!isUuid(requestedHospital)) throw new HttpError(400, 'INVALID_QUERY', 'hospitalId ต้องเป็น UUID');
    const hospital = (await query<{ region_id: string }>(`SELECT region_id FROM hospital WHERE id = $1`, [requestedHospital])).rows[0];
    if (!hospital) throw new HttpError(400, 'INVALID_QUERY', 'ไม่พบโรงพยาบาล');
    hospitalId = requestedHospital;
    regionId = hospital.region_id;
  }
  const requestedRegion = raw.regionId;
  if (!regionId && requestedRegion !== undefined) {
    if (!isUuid(requestedRegion)) throw new HttpError(400, 'INVALID_QUERY', 'regionId ต้องเป็น UUID');
    const region = (await query(`SELECT 1 FROM region WHERE id = $1`, [requestedRegion])).rows[0];
    if (!region) throw new HttpError(400, 'INVALID_QUERY', 'ไม่พบเขตสุขภาพ');
    regionId = requestedRegion;
  }
  return { hospitalId, regionId };
}

function itemView(user: AuthSessionUser, spec: ConfigKeySpec, rows: ConfigRow[], ctx: ScopeContext): ConfigItemView {
  const effective = resolveEffective(spec, rows, ctx);
  return {
    key: spec.key,
    group: spec.group,
    type: spec.type,
    ...(spec.unit ? { unit: spec.unit } : {}),
    scope: effective.scope,
    value: effective.value,
    fileDefault: spec.fileDefault,
    description: spec.description,
    defaultSource: spec.defaultSource,
    ...(spec.min !== undefined ? { min: spec.min } : {}),
    ...(spec.max !== undefined ? { max: spec.max } : {}),
    readOnly: spec.readOnly === true,
    ...(spec.readOnly ? { readOnlyReason: READ_ONLY_REASON } : {}),
    editable: isEditableForRole(user.allRoles, spec),
    updatedAt: effective.updatedAt,
    updatedBy: effective.updatedBy,
    overrides: effective.overrides,
  };
}

export class ConfigService {
  /** List the catalogue with the effective value for the caller (SA: for `?hospitalId=` when given). */
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage({ ...raw, limit: raw.limit ?? 200 });
    const scopeFilter = oneOf(raw.scope, ['GLOBAL', 'REGION', 'HOSPITAL', 'DEFAULT'] as const, 'scope');
    const groupFilter = typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim() : undefined;
    const keyFilter = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : undefined;
    const search = typeof raw.q === 'string' && raw.q.trim() ? raw.q.trim().toLowerCase() : undefined;

    const ctx = await scopeContextFor(user, raw);
    const rows = await query<ConfigRow>(ROWS_SQL, [CONFIG_CATALOGUE.map((spec) => spec.key)]);
    const byKey = new Map<string, ConfigRow[]>();
    for (const row of rows.rows) {
      const list = byKey.get(row.key) ?? [];
      list.push(row);
      byKey.set(row.key, list);
    }

    let items = CONFIG_CATALOGUE.map((spec) => itemView(user, spec, byKey.get(spec.key) ?? [], ctx));

    if (scopeFilter) items = items.filter((item) => item.scope === scopeFilter);
    if (groupFilter) items = items.filter((item) => item.group === groupFilter);
    if (keyFilter) items = items.filter((item) => item.key === keyFilter);
    if (search) {
      items = items.filter(
        (item) => item.key.toLowerCase().includes(search) || item.description.toLowerCase().includes(search),
      );
    }

    items.sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.key.localeCompare(b.key));
    const slice = toPage(items, page);
    return { ok: true, items: slice.items, nextCursor: slice.nextCursor };
  }

  /** Upsert one key at one scope, audited with a reason (SEC-003, §23). */
  async update(req: Request, rawKey: string) {
    const user = req.user!;
    const spec = requireConfigKey(rawKey);
    const body = bodyObject(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลในการแก้ไขค่า (reason)');

    const isSystemAdmin = user.allRoles.includes('SYSTEM_ADMIN');
    if (!isSystemAdmin && !user.allRoles.includes('HOSPITAL_ADMIN')) {
      throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็น HOSPITAL_ADMIN หรือ SYSTEM_ADMIN');
    }
    if (spec.readOnly) {
      throw new HttpError(422, 'CONFIG_READ_ONLY', `${spec.key}: ${READ_ONLY_REASON}`);
    }
    if (!isEditableForRole(user.allRoles, spec)) {
      throw new HttpError(403, 'FORBIDDEN', `คีย์ ${spec.key} อยู่ในกลุ่มที่ต้องเป็น SYSTEM_ADMIN (§23: ${isRestrictedConfigKey(spec.key) ? 'borrow.score.* / ved.z.* / agent.*' : 'read-only'})`);
    }
    const value = validateConfigValue(spec, body.value);

    const requestedHospital = body.hospitalId;
    const requestedRegion = body.regionId;
    if (requestedHospital !== undefined && !isUuid(requestedHospital)) throw new HttpError(400, 'VALIDATION', 'hospitalId ต้องเป็น UUID');
    if (requestedRegion !== undefined && !isUuid(requestedRegion)) throw new HttpError(400, 'VALIDATION', 'regionId ต้องเป็น UUID');
    const scopeCtx: ScopeContext = {
      hospitalId: (isSystemAdmin ? (requestedHospital as string | undefined) : undefined) ?? user.hospitalId,
      regionId: (isSystemAdmin ? (requestedRegion as string | undefined) : undefined) ?? user.regionId,
    };

    return withTransaction(async (client) => {
      const rows = (
        await client.query<ConfigRow>(
          `SELECT key, scope, value, updated_at, updated_by FROM config_setting WHERE key = $1 FOR UPDATE`,
          [spec.key],
        )
      ).rows;
      const rowsWithNames = (
        await client.query<ConfigRow>(ROWS_SQL, [[spec.key]])
      ).rows;

      const scope = parseConfigScope(body.scope, scopeCtx, isSystemAdmin);
      if (!isSystemAdmin && scope !== `HOSPITAL:${user.hospitalId}`) {
        throw new HttpError(403, 'FORBIDDEN', 'ผู้ดูแลโรงพยาบาลแก้ไขได้เฉพาะค่าในขอบเขตโรงพยาบาลของตนเอง');
      }
      await assertScopeTargetExists(scope);

      const existing = rows.find((row) => row.scope === scope);
      const ifMatch = req.header('if-match')?.trim();
      if (existing && ifMatch) {
        const current = new Date(existing.updated_at).toISOString();
        if (current !== ifMatch) {
          throw new HttpError(409, 'VERSION_CONFLICT', 'ค่าตั้งต้นถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentUpdatedAt: current });
        }
      }

      const written = (
        await client.query<{ updated_at: Date }>(
          `INSERT INTO config_setting (key, scope, value, description, updated_by, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, now())
           ON CONFLICT (key, scope) DO UPDATE
              SET value = EXCLUDED.value, description = EXCLUDED.description,
                  updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING updated_at`,
          [spec.key, scope, JSON.stringify(value), spec.description, user.id],
        )
      ).rows[0];

      await writeAudit(client, auditContext(req), {
        action: 'CONFIG_UPDATED',
        entityType: 'config_setting',
        entityId: null,
        before: existing ? { key: spec.key, scope, value: existing.value } : null,
        after: { key: spec.key, scope, value },
        reason,
      });

      // Effective value for the scope that was written (or the caller's own scope for GLOBAL).
      const effectiveCtx: ScopeContext =
        scope.startsWith('HOSPITAL:')
          ? { hospitalId: scope.slice('HOSPITAL:'.length), regionId: null }
          : scope.startsWith('REGION:')
            ? { hospitalId: null, regionId: scope.slice('REGION:'.length) }
            : scopeCtx;
      if (effectiveCtx.hospitalId && !effectiveCtx.regionId) {
        const hospital = (await client.query<{ region_id: string }>(`SELECT region_id FROM hospital WHERE id = $1`, [effectiveCtx.hospitalId])).rows[0];
        if (hospital) effectiveCtx.regionId = hospital.region_id;
      }
      const allRows = rowsWithNames.map((row) =>
        row.scope === scope ? { ...row, value, updated_at: written.updated_at, updated_by: user.id, updated_by_name: user.name } : row,
      );
      if (!allRows.some((row) => row.scope === scope)) {
        allRows.push({ key: spec.key, scope, value, updated_at: written.updated_at, updated_by: user.id, updated_by_name: user.name });
      }

      return {
        ok: true,
        data: {
          key: spec.key,
          scope,
          value,
          previousValue: existing ? existing.value : null,
          effectiveValue: resolveEffective(spec, allRows, effectiveCtx).value,
          type: spec.type,
          updatedBy: { id: user.id, name: user.name },
          updatedAt: new Date(written.updated_at).toISOString(),
        },
      };
    });
  }

  /** API-AD-004: the single global agent kill switch (`agent.enabled` at GLOBAL scope, SYSTEM_ADMIN only). */
  async killSwitch(req: Request) {
    const user = req.user!;
    const body = bodyObject(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลในการสลับสวิตช์ (reason)');
    if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'VALIDATION', 'enabled ต้องเป็น true/false');

    const spec = requireConfigKey('agent.enabled');
    const enabled = body.enabled;

    return withTransaction(async (client) => {
      const existing = (
        await client.query<{ value: boolean; updated_at: Date }>(
          `SELECT value, updated_at FROM config_setting WHERE key = 'agent.enabled' AND scope = 'GLOBAL' FOR UPDATE`,
        )
      ).rows[0];

      const written = (
        await client.query<{ updated_at: Date }>(
          `INSERT INTO config_setting (key, scope, value, description, updated_by, updated_at)
           VALUES ('agent.enabled', 'GLOBAL', $1::jsonb, $2, $3, now())
           ON CONFLICT (key, scope) DO UPDATE
              SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING updated_at`,
          [JSON.stringify(enabled), spec.description, user.id],
        )
      ).rows[0];

      await writeAudit(client, auditContext(req), {
        action: enabled ? 'AGENT_KILL_SWITCH_ON' : 'AGENT_KILL_SWITCH_OFF',
        entityType: 'config_setting',
        entityId: null,
        before: existing ? { enabled: existing.value } : null,
        after: { enabled },
        reason,
      });

      return {
        ok: true,
        data: {
          key: 'agent.enabled',
          scope: 'GLOBAL',
          enabled,
          previousEnabled: existing ? existing.value : null,
          updatedBy: { id: user.id, name: user.name },
          updatedAt: new Date(written.updated_at).toISOString(),
          reason,
        },
      };
    });
  }
}

export const configService = new ConfigService();
