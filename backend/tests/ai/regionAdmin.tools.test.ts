import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolRegistry } from '../../src/modules/ai/tools/index.js';
import { query, pool } from '../../src/db/client.js';
import {
  ctx,
  getRegionIds,
  assertPermissionDenied,
  assertFailed,
  assertNoSecrets,
  countRows,
  WHITELIST,
} from './helpers.js';
import {
  getRegionalStockHeatmapTool,
  getRegionalSurgeSignalsTool,
  simulatePoolAllocationTool,
  getRegionalDirectivesTool,
  submitRegionAdminProposalTool,
} from '../../src/modules/ai/tools/governance/regionAdmin.tools.js';
import {
  HEATMAP_CRITICAL_DAYS,
  HEATMAP_LOW_DAYS,
  buildEndpoint,
} from '../../src/modules/ai/tools/governance/governance.utils.js';

test('regionAdmin.tools: Schema and allowedRoles validation', () => {
  const tools = [
    getRegionalStockHeatmapTool,
    getRegionalSurgeSignalsTool,
    simulatePoolAllocationTool,
    getRegionalDirectivesTool,
    submitRegionAdminProposalTool,
  ];

  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `Tool ${tool.name} description must not be empty`);
    assert.deepEqual(
      tool.allowedRoles,
      ['REGION_ADMIN', 'SYSTEM_ADMIN'],
      `Tool ${tool.name} allowedRoles must match ['REGION_ADMIN', 'SYSTEM_ADMIN']`,
    );
  }

  // Parameter schema validation
  assert.equal(
    getRegionalStockHeatmapTool.parameters.safeParse({ limit: 0 }).success,
    false,
    'get_regional_stock_heatmap should reject limit < 1',
  );
  assert.equal(
    getRegionalStockHeatmapTool.parameters.safeParse({ limit: 201 }).success,
    false,
    'get_regional_stock_heatmap should reject limit > 200',
  );

  assert.equal(
    simulatePoolAllocationTool.parameters.safeParse({ poolEntryId: 'not-a-uuid' }).success,
    false,
    'simulate_pool_allocation should reject non-uuid poolEntryId',
  );

  assert.equal(
    submitRegionAdminProposalTool.parameters.safeParse({
      action: 'RESOLVE_ALLOCATION_OPTION',
      allocationPlanId: '00000000-0000-0000-0000-000000000001',
      optionId: 'INVALID_OPTION',
    }).success,
    false,
    'submit_region_admin_proposal should reject invalid allocation option',
  );
});

test('regionAdmin.tools: Region scoping and tenant isolation', async (t) => {
  const regions = await getRegionIds(2);
  assert.ok(regions.length >= 1, 'At least 1 region must exist in the database');
  const regionId = regions[0];

  // 1. REGION_ADMIN with no regionId fails clearly
  const noCtxResult = await defaultToolRegistry.executeTool(
    'get_regional_stock_heatmap',
    {},
    ctx('REGION_ADMIN', {}),
  );
  assertFailed(noCtxResult, /Context regionId is required for region-scoped operations/i);

  // 2. SYSTEM_ADMIN with no context region and no arg fails clearly
  const sysNoArgResult = await defaultToolRegistry.executeTool(
    'get_regional_stock_heatmap',
    {},
    ctx('SYSTEM_ADMIN', {}),
  );
  assertFailed(sysNoArgResult, /Region ID is required/i);

  // 3. SYSTEM_ADMIN with regionId arg succeeds
  const sysArgResult = await defaultToolRegistry.executeTool(
    'get_regional_stock_heatmap',
    { regionId },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(sysArgResult.success, true);
  assertNoSecrets(sysArgResult);

  // 4. If >= 2 regions exist, test cross-region denial
  if (regions.length >= 2) {
    const crossRegionResult = await defaultToolRegistry.executeTool(
      'get_regional_stock_heatmap',
      { regionId: regions[1] },
      ctx('REGION_ADMIN', { regionId: regions[0] }),
    );
    assertFailed(crossRegionResult, /Permission denied: Cannot access region outside your authorized scope/i);
  } else {
    t.skip('Skipped cross-region denial test because seed database has only 1 region');
  }
});

test('regionAdmin.tools: Heatmap data invariants and risk classification', async () => {
  const [regionId] = await getRegionIds(1);

  const res = await defaultToolRegistry.executeTool(
    'get_regional_stock_heatmap',
    { regionId, limit: 50 },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(res.success, true);
  const data = res.data as any;

  // Cross-check hospital names with DB
  const hospRes = await query<{ name_th: string }>(
    `SELECT name_th FROM hospital WHERE region_id = $1 AND active = true`,
    [regionId],
  );
  const allowedHospNames = new Set(hospRes.rows.map((r) => r.name_th));

  assert.ok(Array.isArray(data.items));
  assert.equal(data.returnedCount, data.items.length);
  assert.ok(data.items.length <= 50, 'Limit must be respected');

  let criticalCount = 0;
  let lowCount = 0;
  let adequateCount = 0;
  let unknownCount = 0;

  for (const row of data.items) {
    assert.ok(
      allowedHospNames.has(row.hospitalName),
      `Hospital ${row.hospitalName} must belong to region ${regionId}`,
    );
    assert.ok(
      ['V', 'E'].includes(row.ved),
      `VED classification (${row.ved}) must be V or E`,
    );

    if (row.daysCover === null) {
      assert.equal(row.risk, 'UNKNOWN', 'Days cover null must have UNKNOWN risk');
      unknownCount++;
    } else if (row.daysCover <= HEATMAP_CRITICAL_DAYS) {
      assert.equal(row.risk, 'CRITICAL_SHORTAGE', `Days cover ${row.daysCover} must be CRITICAL_SHORTAGE (<= ${HEATMAP_CRITICAL_DAYS})`);
      criticalCount++;
    } else if (row.daysCover <= HEATMAP_LOW_DAYS) {
      assert.equal(row.risk, 'LOW_COVER', `Days cover ${row.daysCover} must be LOW_COVER (<= ${HEATMAP_LOW_DAYS})`);
      lowCount++;
    } else {
      assert.equal(row.risk, 'ADEQUATE', `Days cover ${row.daysCover} must be ADEQUATE`);
      adequateCount++;
    }
  }

  // Summary counts represent region-wide totals
  const countRes = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
       FROM hospital_drug hd
       JOIN hospital h ON h.id = hd.hospital_id
      WHERE h.region_id = $1 AND h.active = true AND hd.active = true AND hd.ved IN ('V', 'E')`,
    [regionId],
  );
  const totalRegionHd = parseInt(countRes.rows[0].c, 10);
  assert.equal(
    data.summary.CRITICAL_SHORTAGE + data.summary.LOW_COVER + data.summary.ADEQUATE + data.summary.UNKNOWN,
    totalRegionHd,
  );
  assert.ok(data.summary.CRITICAL_SHORTAGE >= criticalCount);
  assert.ok(data.summary.LOW_COVER >= lowCount);
  assert.ok(data.summary.ADEQUATE >= adequateCount);
  assert.ok(data.summary.UNKNOWN >= unknownCount);

  assertNoSecrets(res);
});

test('regionAdmin.tools: Surge signals active date filtering', async () => {
  const [regionId] = await getRegionIds(1);

  // Active signals only
  const activeRes = await defaultToolRegistry.executeTool(
    'get_regional_surge_signals',
    { regionId, includeExpired: false },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(activeRes.success, true);
  const activeData = activeRes.data as any;

  const todayStr = new Date().toISOString().slice(0, 10);
  for (const s of activeData.signals) {
    assert.ok(s.valid_from <= todayStr, `valid_from (${s.valid_from}) must be <= today (${todayStr})`);
    if (s.valid_to) {
      assert.ok(s.valid_to >= todayStr, `valid_to (${s.valid_to}) must be >= today (${todayStr})`);
    }
  }

  // Including expired signals
  const allRes = await defaultToolRegistry.executeTool(
    'get_regional_surge_signals',
    { regionId, includeExpired: true },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(allRes.success, true);
  const allData = allRes.data as any;

  assert.ok(
    allData.count >= activeData.count,
    `includeExpired true count (${allData.count}) must be >= active count (${activeData.count})`,
  );

  assertNoSecrets(activeRes);
  assertNoSecrets(allRes);
});

test('regionAdmin.tools: Pool simulation invariants and controlled prohibition', async (t) => {
  const [regionId] = await getRegionIds(1);

  // 1. Unknown pool entry fails
  const unknownRes = await defaultToolRegistry.executeTool(
    'simulate_pool_allocation',
    { poolEntryId: '00000000-0000-0000-0000-000000000000' },
    ctx('SYSTEM_ADMIN', { regionId }),
  );
  assertFailed(unknownRes, /not found/i);

  // 2. Controlled drug pool entry fails with BR-F1b-014 prohibition
  const controlledRes = await query<{ id: string; region_id: string }>(
    `SELECT pe.id, pe.region_id
       FROM pool_entry pe
       JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
       JOIN stock_lot sl ON sl.id = ne.lot_id
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
       JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE dm.is_controlled = true
      LIMIT 1`,
  );

  if (controlledRes.rows.length > 0) {
    const cEntry = controlledRes.rows[0];
    const cResult = await defaultToolRegistry.executeTool(
      'simulate_pool_allocation',
      { poolEntryId: cEntry.id },
      ctx('SYSTEM_ADMIN', { regionId: cEntry.region_id }),
    );
    assertFailed(cResult, /BR-F1b-014/i);
  } else {
    t.skip('No controlled drug pool_entry found in database');
  }

  // 3. Real non-controlled pool entry invariants
  const poolRes = await query<{ id: string; region_id: string; qty_available: string }>(
    `SELECT pe.id, pe.region_id, pe.qty_available::text
       FROM pool_entry pe
       JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
       JOIN stock_lot sl ON sl.id = ne.lot_id
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
       JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE dm.is_controlled = false
      ORDER BY pe.qty_available DESC
      LIMIT 1`,
  );

  if (poolRes.rows.length === 0) {
    t.skip('No non-controlled pool_entry found in database');
    return;
  }

  const pe = poolRes.rows[0];
  const simRes = await defaultToolRegistry.executeTool(
    'simulate_pool_allocation',
    { poolEntryId: pe.id },
    ctx('SYSTEM_ADMIN', { regionId: pe.region_id }),
  );
  assert.equal(simRes.success, true);
  const data = simRes.data as any;

  assert.equal(data.simulationOnly, true);
  assert.equal(
    Math.round((data.totalAllocated + data.remainingAvailable) * 1000) / 1000,
    Math.round(data.initialAvailable * 1000) / 1000,
  );
  assert.ok(data.totalAllocated <= data.initialAvailable);

  // Candidates ordered by distance with nulls last
  let seenNull = false;
  let prevDist = -1;
  for (const cand of data.allocations) {
    if (cand.distanceKm === null) {
      seenNull = true;
    } else {
      assert.equal(seenNull, false, 'Distance non-null candidate must not appear after null distance');
      assert.ok(cand.distanceKm >= prevDist, 'Candidates must be ordered by distance ascending');
      prevDist = cand.distanceKm;
    }
  }

  assertNoSecrets(simRes);
});

test('regionAdmin.tools: Directives secret redaction and policy scoping', async () => {
  const [regionId] = await getRegionIds(1);

  const res = await defaultToolRegistry.executeTool(
    'get_regional_directives',
    { regionId },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(res.success, true);
  const data = res.data as any;

  // Sources contain both signals and policies
  assert.ok(Array.isArray(data.sources));
  assert.ok(data.sources.includes('context_signal'));
  assert.ok(data.sources.includes('config_setting'));

  // Policies never include sensitive keys
  const sensitiveRegex = /secret|key|token|password|credential|byok|auth/i;
  for (const pol of data.policies) {
    assert.equal(
      sensitiveRegex.test(pol.key),
      false,
      `Policy key '${pol.key}' should have been redacted`,
    );
  }

  // Cross-check policy count with DB
  const dbPolicies = await query<{ key: string }>(
    `SELECT key FROM config_setting 
      WHERE scope = 'REGION:' || $1 
         OR (scope = 'GLOBAL' AND (
              key LIKE 'agent.%' OR
              key LIKE 'expiry.%' OR
              key LIKE 'borrow.%' OR
              key LIKE 'emergency.%'
            ))`,
    [regionId],
  );
  const nonSensitiveCount = dbPolicies.rows.filter((r) => !sensitiveRegex.test(r.key)).length;
  assert.equal(data.policies.length, nonSensitiveCount);

  assertNoSecrets(res);
});

test('regionAdmin.tools: Proposals structure and no-mutation verification', async (t) => {
  const [regionId] = await getRegionIds(1);

  const snapSignal = await countRows('context_signal');
  const snapPlan = await countRows('allocation_plan');

  // Proposal 1: CREATE_CONTEXT_SIGNAL
  const resSig = await defaultToolRegistry.executeTool(
    'submit_region_admin_proposal',
    {
      action: 'CREATE_CONTEXT_SIGNAL',
      regionId,
      signalType: 'SEASONAL_PEAK',
      payload: { reason: 'Respiratory illness surge expected in winter season.' },
      validFrom: '2026-11-01',
      validTo: '2027-01-31',
      source: 'MOPH_COMMUNICABLE_DISEASE_DIVISION',
      note: 'Pre-approved regional buffer notice.',
    },
    ctx('REGION_ADMIN', { regionId }),
  );

  assert.equal(resSig.success, true);
  assert.equal((resSig.data as any).requiresHumanApproval, true);

  const whitelistSig = WHITELIST.REGION_ADMIN.CREATE_CONTEXT_SIGNAL;
  assert.equal(resSig.proposal?.actionApi?.method, whitelistSig.method);
  assert.equal(resSig.proposal?.actionApi?.endpoint, whitelistSig.endpointTemplate);
  assert.deepEqual(
    Object.keys(resSig.proposal?.actionApi?.payload || {}).sort(),
    ['note', 'payload', 'regionId', 'signalType', 'source', 'validFrom', 'validTo'].sort(),
  );

  // Proposal 2: RESOLVE_ALLOCATION_OPTION
  const planRes = await query<{ id: string; region_id: string }>(
    `SELECT id, region_id FROM allocation_plan LIMIT 1`,
  );
  if (planRes.rows.length > 0) {
    const plan = planRes.rows[0];
    const resPlan = await defaultToolRegistry.executeTool(
      'submit_region_admin_proposal',
      {
        action: 'RESOLVE_ALLOCATION_OPTION',
        allocationPlanId: plan.id,
        optionId: 'HOLD',
        note: 'Hold allocation pending cross-district consolidation review.',
      },
      ctx('REGION_ADMIN', { regionId: plan.region_id }),
    );

    assert.equal(resPlan.success, true);
    assert.equal((resPlan.data as any).requiresHumanApproval, true);

    const whitelistPlan = WHITELIST.REGION_ADMIN.RESOLVE_ALLOCATION_OPTION;
    const expectedEndpoint = buildEndpoint(whitelistPlan.endpointTemplate, { id: plan.id });
    assert.equal(resPlan.proposal?.actionApi?.method, whitelistPlan.method);
    assert.equal(resPlan.proposal?.actionApi?.endpoint, expectedEndpoint);
    assert.deepEqual(
      Object.keys(resPlan.proposal?.actionApi?.payload || {}).sort(),
      ['option', 'reason', 'version'].sort(),
    );
  } else {
    t.skip('No allocation_plan found in database');
  }

  // NO-MUTATION PROOF
  assert.equal(await countRows('context_signal'), snapSignal, 'context_signal count must not change');
  assert.equal(await countRows('allocation_plan'), snapPlan, 'allocation_plan count must not change');
});

test.after(async () => {
  await pool.end();
});

