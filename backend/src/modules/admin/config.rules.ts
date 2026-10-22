/** Pure helpers for GET/PUT /config: scope parsing and HOSPITAL → REGION → GLOBAL → file-default resolution. */
import { HttpError } from '../../middleware/httpError.js';
import { isUuid } from '../../core/validate.js';
import type { ConfigOverrideView, ConfigScopeKind } from './admin.types.js';
import { isRestrictedConfigKey, type ConfigKeySpec } from './config.catalogue.js';

export interface ConfigRow {
  key: string;
  scope: string;
  value: unknown;
  updated_at: Date | string;
  updated_by: string | null;
  updated_by_name: string | null;
}

export interface ScopeContext {
  hospitalId: string | null;
  regionId: string | null;
}

export interface EffectiveConfig {
  value: unknown;
  scope: ConfigScopeKind;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
  overrides: {
    global?: ConfigOverrideView;
    region?: ConfigOverrideView;
    hospital?: ConfigOverrideView;
  };
}

const iso = (value: Date | string): string => new Date(value).toISOString();

const overrideView = (row: ConfigRow): ConfigOverrideView => ({
  value: row.value,
  updatedAt: iso(row.updated_at),
  updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name || row.updated_by } : null,
});

/** Effective value at a hospital (or at a region / globally when the caller has no hospital). */
export function resolveEffective(spec: ConfigKeySpec, rows: ConfigRow[], ctx: ScopeContext): EffectiveConfig {
  const byScope = new Map(rows.map((row) => [row.scope, row]));
  const hospitalScope = ctx.hospitalId ? `HOSPITAL:${ctx.hospitalId}` : null;
  const regionScope = ctx.regionId ? `REGION:${ctx.regionId}` : null;
  const chain = [hospitalScope, regionScope, 'GLOBAL'].filter((scope): scope is string => Boolean(scope));

  const overrides: EffectiveConfig['overrides'] = {};
  const globalRow = byScope.get('GLOBAL');
  if (globalRow) overrides.global = overrideView(globalRow);
  if (regionScope) {
    const regionRow = byScope.get(regionScope);
    if (regionRow) overrides.region = overrideView(regionRow);
  }
  if (hospitalScope) {
    const hospitalRow = byScope.get(hospitalScope);
    if (hospitalRow) overrides.hospital = overrideView(hospitalRow);
  }

  for (const scope of chain) {
    const row = byScope.get(scope);
    if (!row) continue;
    return {
      value: row.value,
      scope: (scope === 'GLOBAL' ? 'GLOBAL' : scope.startsWith('REGION:') ? 'REGION' : 'HOSPITAL') as ConfigScopeKind,
      updatedAt: iso(row.updated_at),
      updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name || row.updated_by } : null,
      overrides,
    };
  }
  return { value: spec.fileDefault, scope: 'DEFAULT', updatedAt: null, updatedBy: null, overrides };
}

/**
 * Resolves the `scope` of a PUT body to a concrete `config_setting.scope` value.
 * Omitted scope: a HOSPITAL_ADMIN writes its own hospital; SYSTEM_ADMIN writes GLOBAL (never infer a
 * region/hospital override from an existing row — that would silently edit another scope).
 */
export function parseConfigScope(raw: unknown, ctx: ScopeContext, isSystemAdmin: boolean): string {
  if (raw === undefined || raw === null || raw === '') {
    if (!isSystemAdmin) {
      if (!ctx.hospitalId) throw new HttpError(400, 'VALIDATION', 'ผู้ใช้ระดับเขตต้องระบุ scope');
      return `HOSPITAL:${ctx.hospitalId}`;
    }
    return 'GLOBAL';
  }
  if (typeof raw !== 'string') throw new HttpError(400, 'VALIDATION', 'scope ต้องเป็นข้อความ');

  const value = raw.trim();
  if (value === 'GLOBAL') return 'GLOBAL';
  if (value === 'HOSPITAL') {
    if (!ctx.hospitalId) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ hospitalId สำหรับ scope HOSPITAL');
    return `HOSPITAL:${ctx.hospitalId}`;
  }
  if (value === 'REGION') {
    if (!ctx.regionId) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ regionId สำหรับ scope REGION');
    return `REGION:${ctx.regionId}`;
  }
  const match = value.match(/^(HOSPITAL|REGION):(.+)$/);
  if (!match) throw new HttpError(400, 'VALIDATION', "scope ต้องเป็น GLOBAL, REGION, HOSPITAL, 'REGION:<id>' หรือ 'HOSPITAL:<id>'");
  const [, kind, id] = match;
  if (!isUuid(id)) throw new HttpError(400, 'VALIDATION', 'scope อ้างถึง id ที่ไม่ใช่ UUID');
  return `${kind}:${id}`;
}

/** Whether the signed-in role may write this key at all (§23 restricted groups need SYSTEM_ADMIN here). */
export function isEditableForRole(allRoles: string[], spec: ConfigKeySpec): boolean {
  if (spec.readOnly) return false;
  if (allRoles.includes('SYSTEM_ADMIN')) return true;
  if (allRoles.includes('HOSPITAL_ADMIN')) return !isRestrictedConfigKey(spec.key);
  return false;
}
