/** Admin rules (Step 8): catalogue integrity, config resolution/validation, user status and role guards. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFIG_BY_KEY,
  CONFIG_CATALOGUE,
  READ_ONLY_REASON,
  isRestrictedConfigKey,
  requireConfigKey,
  validateConfigValue,
} from '../src/modules/admin/config.catalogue.js';
import { isEditableForRole, parseConfigScope, resolveEffective, type ConfigRow } from '../src/modules/admin/config.rules.js';
import {
  ALL_ROLES,
  HOSPITAL_ASSIGNABLE_ROLES,
  OPERATIONAL_ROLES,
  deriveStatus,
  diffRoles,
  isOnline,
  validateRoleSet,
  wouldDropLastAdmin,
} from '../src/modules/admin/users.rules.js';

const HOSPITAL_A = '11111111-1111-4111-8111-111111111111';
const HOSPITAL_B = '22222222-2222-4222-8222-222222222222';
const REGION_A = '33333333-3333-4333-8333-333333333333';

const row = (scope: string, value: unknown, updatedAt = '2026-10-22T00:00:00.000Z'): ConfigRow => ({
  key: 'return.default_days',
  scope,
  value,
  updated_at: updatedAt,
  updated_by: null,
  updated_by_name: null,
});

test('catalogue: every key is unique and fully described', () => {
  const keys = new Set<string>();
  for (const spec of CONFIG_CATALOGUE) {
    assert.ok(!keys.has(spec.key), `duplicate key ${spec.key}`);
    keys.add(spec.key);
    assert.ok(spec.group.length > 0, `${spec.key} needs a group`);
    assert.ok(spec.description.length > 0, `${spec.key} needs a description`);
    assert.ok(['number', 'boolean', 'text'].includes(spec.type), `${spec.key} needs a valid type`);
    assert.equal(typeof spec.fileDefault, spec.type === 'text' ? 'string' : spec.type, `${spec.key} default type`);
    if (spec.type === 'number') {
      assert.equal(typeof spec.fileDefault, 'number');
      if (spec.min !== undefined && spec.max !== undefined) assert.ok(spec.min <= spec.max, `${spec.key} min/max`);
      assert.ok((spec.fileDefault as number) >= (spec.min ?? -Infinity));
      assert.ok((spec.fileDefault as number) <= (spec.max ?? Infinity));
    }
  }
  assert.equal(CONFIG_BY_KEY.size, CONFIG_CATALOGUE.length);
});

test('catalogue: read-only entries carry the standard reason and are not editable', () => {
  const readOnly = CONFIG_CATALOGUE.filter((spec) => spec.readOnly);
  assert.ok(readOnly.length > 0, 'expected read-only keys for spec-only groups');
  assert.ok(readOnly.some((spec) => spec.key === 'forecast.cv_threshold'));
  assert.ok(readOnly.some((spec) => spec.key === 'agent.model_id'));
  assert.ok(readOnly.some((spec) => spec.key === 'retention.audit_years'));
  for (const spec of readOnly) assert.ok(READ_ONLY_REASON.length > 0);
  for (const spec of CONFIG_CATALOGUE) {
    assert.equal(isEditableForRole(['SYSTEM_ADMIN'], spec), !spec.readOnly, `${spec.key} editable by SA`);
  }
});

test('catalogue: every backend-read key is present and writable', () => {
  const backendKeys = [
    'agent.enabled',
    'return.default_days',
    'network.auto_approve',
    'coldchain.default_box_hours',
    'borrow.score.w_time',
    'borrow.timeout_min.very_urgent',
    'borrow.urgency.urgent_E_days',
    'expiry.cost_model_thb.per_km',
    'expiry.repeat.dismiss_days',
    'emergency.blood.prc_o_min_remaining_days',
    'emergency.max_parallel',
    'ved.z.V',
  ];
  for (const key of backendKeys) {
    const spec = requireConfigKey(key);
    assert.equal(spec.readOnly ?? false, false, `${key} should be writable`);
  }
});

test('catalogue: restricted prefixes match §23', () => {
  assert.equal(isRestrictedConfigKey('borrow.score.w_time'), true);
  assert.equal(isRestrictedConfigKey('ved.z.V'), true);
  assert.equal(isRestrictedConfigKey('agent.enabled'), true);
  assert.equal(isRestrictedConfigKey('borrow.max_parallel'), false);
  assert.equal(isRestrictedConfigKey('return.default_days'), false);
  assert.equal(isEditableForRole(['HOSPITAL_ADMIN'], requireConfigKey('borrow.score.w_time')), false);
  assert.equal(isEditableForRole(['HOSPITAL_ADMIN'], requireConfigKey('return.default_days')), true);
  assert.equal(isEditableForRole(['PHARMACIST'], requireConfigKey('return.default_days')), false);
});

test('catalogue: unknown keys are a 404 and values are validated by type/bounds/enum', () => {
  assert.throws(() => requireConfigKey('nope.key'), /ไม่พบคีย์ตั้งค่า/);
  const days = requireConfigKey('return.default_days');
  assert.equal(validateConfigValue(days, 45), 45);
  assert.equal(validateConfigValue(days, '45'), 45);
  assert.throws(() => validateConfigValue(days, 'abc'), /ต้องเป็นตัวเลข/);
  assert.throws(() => validateConfigValue(days, 0), /ต้องไม่น้อยกว่า 1/);
  const flag = requireConfigKey('agent.enabled');
  assert.equal(validateConfigValue(flag, false), false);
  assert.throws(() => validateConfigValue(flag, 'false'), /true\/false/);
  const ved = requireConfigKey('ved.default_class');
  assert.equal(validateConfigValue(ved, 'V'), 'V');
  assert.throws(() => validateConfigValue(ved, 'X'), /ต้องเป็นหนึ่งใน/);
});

test('resolveEffective: HOSPITAL → REGION → GLOBAL → file default', () => {
  const spec = requireConfigKey('return.default_days');
  const ctx = { hospitalId: HOSPITAL_A, regionId: REGION_A };

  const withAll = resolveEffective(
    spec,
    [row('GLOBAL', 30), row(`REGION:${REGION_A}`, 40), row(`HOSPITAL:${HOSPITAL_A}`, 45)],
    ctx,
  );
  assert.equal(withAll.value, 45);
  assert.equal(withAll.scope, 'HOSPITAL');
  assert.equal(withAll.overrides.global?.value, 30);
  assert.equal(withAll.overrides.region?.value, 40);
  assert.equal(withAll.overrides.hospital?.value, 45);

  const region = resolveEffective(spec, [row('GLOBAL', 30), row(`REGION:${REGION_A}`, 40)], ctx);
  assert.equal(region.value, 40);
  assert.equal(region.scope, 'REGION');
  assert.equal(region.overrides.hospital, undefined);

  const global = resolveEffective(spec, [row('GLOBAL', 30)], ctx);
  assert.equal(global.value, 30);
  assert.equal(global.scope, 'GLOBAL');

  const fallback = resolveEffective(spec, [], ctx);
  assert.equal(fallback.value, spec.fileDefault);
  assert.equal(fallback.scope, 'DEFAULT');
  assert.equal(fallback.updatedAt, null);
});

test('resolveEffective: another hospital/region override is never used', () => {
  const spec = requireConfigKey('return.default_days');
  const ctx = { hospitalId: HOSPITAL_A, regionId: REGION_A };
  const effective = resolveEffective(spec, [row(`HOSPITAL:${HOSPITAL_B}`, 99), row('REGION:99999999-9999-4999-8999-999999999999', 88)], ctx);
  assert.equal(effective.value, spec.fileDefault);
  assert.equal(effective.scope, 'DEFAULT');
  assert.equal(effective.overrides.hospital, undefined);
  assert.equal(effective.overrides.region, undefined);
});

test('parseConfigScope: defaults and explicit scopes', () => {
  const ctx = { hospitalId: HOSPITAL_A, regionId: REGION_A };
  assert.equal(parseConfigScope(undefined, ctx, false), `HOSPITAL:${HOSPITAL_A}`);
  assert.equal(parseConfigScope(undefined, { hospitalId: null, regionId: null }, true), 'GLOBAL');
  assert.equal(parseConfigScope('GLOBAL', ctx, true), 'GLOBAL');
  assert.equal(parseConfigScope('HOSPITAL', ctx, true), `HOSPITAL:${HOSPITAL_A}`);
  assert.equal(parseConfigScope('REGION', ctx, true), `REGION:${REGION_A}`);
  assert.equal(parseConfigScope(`HOSPITAL:${HOSPITAL_B}`, ctx, true), `HOSPITAL:${HOSPITAL_B}`);
  assert.equal(parseConfigScope(undefined, ctx, true), 'GLOBAL', 'SA never infers an existing override');
  assert.throws(() => parseConfigScope('NOPE', ctx, true), /scope ต้องเป็น/);
  assert.throws(() => parseConfigScope('HOSPITAL:not-a-uuid', ctx, true), /UUID/);
  assert.throws(() => parseConfigScope('HOSPITAL', { hospitalId: null, regionId: REGION_A }, true), /hospitalId/);
});

test('users: INVITED is derived and online is a 15-minute window', () => {
  assert.equal(deriveStatus(true, null), 'INVITED');
  assert.equal(deriveStatus(true, '2026-10-20T00:00:00.000Z'), 'ACTIVE');
  assert.equal(deriveStatus(false, '2026-10-20T00:00:00.000Z'), 'SUSPENDED');
  const now = new Date('2026-10-22T12:00:00.000Z');
  assert.equal(isOnline('2026-10-22T11:50:00.000Z', now), true);
  assert.equal(isOnline('2026-10-22T11:44:00.000Z', now), false);
  assert.equal(isOnline(null, now), false);
});

test('users: role sets honour the enum, the grant rights and separation of duties', () => {
  const ha = validateRoleSet(['PHARMACIST'], undefined, HOSPITAL_ASSIGNABLE_ROLES);
  assert.deepEqual(ha, { roles: ['PHARMACIST'], primaryRole: 'PHARMACIST' });

  const multi = validateRoleSet(['PHARMACIST', 'DATA_ADMIN', 'PHARMACIST'], 'DATA_ADMIN', HOSPITAL_ASSIGNABLE_ROLES);
  assert.deepEqual(multi.roles, ['PHARMACIST', 'DATA_ADMIN']);
  assert.equal(multi.primaryRole, 'DATA_ADMIN');

  assert.throws(() => validateRoleSet([], undefined, ALL_ROLES), /อย่างน้อย 1 บทบาท/);
  assert.throws(() => validateRoleSet(['WIZARD'], undefined, ALL_ROLES), /ไม่พบบทบาท/);
  assert.throws(() => validateRoleSet(['SYSTEM_ADMIN'], undefined, HOSPITAL_ASSIGNABLE_ROLES), /ไม่มีสิทธิ์กำหนด/);
  assert.throws(() => validateRoleSet(['PHARMACIST'], 'DRIVER', ALL_ROLES), /primaryRole/);
  assert.throws(() => validateRoleSet(['SYSTEM_ADMIN', 'PHARMACIST'], undefined, ALL_ROLES), /บทบาทเดียว/);
  assert.throws(() => validateRoleSet(['AUDITOR', 'DATA_ADMIN'], undefined, ALL_ROLES), /บทบาทเดียว/);
  for (const operational of OPERATIONAL_ROLES) {
    assert.throws(() => validateRoleSet(['HOSPITAL_ADMIN', operational], undefined, ALL_ROLES), /separation of duties/);
  }
  assert.deepEqual(validateRoleSet(['HOSPITAL_ADMIN'], undefined, ALL_ROLES), { roles: ['HOSPITAL_ADMIN'], primaryRole: 'HOSPITAL_ADMIN' });
});

test('users: role diff and the last-admin guard', () => {
  assert.deepEqual(diffRoles(['A', 'B'], ['B', 'C']), { added: ['C'], removed: ['A'] });
  assert.deepEqual(diffRoles(['A'], ['A']), { added: [], removed: [] });

  const base = {
    otherActiveAdmins: 0,
    targetActive: true,
    targetIsAdmin: true,
    nextActive: true,
    nextRoles: ['HOSPITAL_ADMIN'],
    adminRole: 'HOSPITAL_ADMIN',
  };
  assert.equal(wouldDropLastAdmin(base), false, 'keeping the role is fine');
  assert.equal(wouldDropLastAdmin({ ...base, nextRoles: ['PHARMACIST'] }), true, 'demoting the last admin is refused');
  assert.equal(wouldDropLastAdmin({ ...base, nextActive: false }), true, 'deactivating the last admin is refused');
  assert.equal(wouldDropLastAdmin({ ...base, nextRoles: ['PHARMACIST'], otherActiveAdmins: 1 }), false);
  assert.equal(wouldDropLastAdmin({ ...base, targetActive: false }), false, 'inactive targets are not counted');
  assert.equal(wouldDropLastAdmin({ ...base, targetIsAdmin: false }), false);
});
