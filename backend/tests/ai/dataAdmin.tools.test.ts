import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolRegistry } from '../../src/modules/ai/tools/index.js';
import { query } from '../../src/db/client.js';
import {
  ctx,
  assertPermissionDenied,
  assertFailed,
  assertNoSecrets,
  countRows,
  WHITELIST,
} from './helpers.js';
import {
  getUnmappedCatalogItemsTool,
  getMappingSuggestionsTool,
  auditVedClassificationsTool,
  submitDataAdminProposalTool,
} from '../../src/modules/ai/tools/governance/dataAdmin.tools.js';
import {
  HIGH_COST_VED_REVIEW_THRESHOLD_THB,
  buildEndpoint,
} from '../../src/modules/ai/tools/governance/governance.utils.js';

test('dataAdmin.tools: Schema and allowedRoles validation across all 4 tools', async () => {
  const tools = [
    getUnmappedCatalogItemsTool,
    getMappingSuggestionsTool,
    auditVedClassificationsTool,
    submitDataAdminProposalTool,
  ];

  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `Tool ${tool.name} description must not be empty`);
    assert.deepEqual(
      new Set(tool.allowedRoles),
      new Set(['DATA_ADMIN', 'SYSTEM_ADMIN']),
      `Tool ${tool.name} allowedRoles must match ['DATA_ADMIN', 'SYSTEM_ADMIN']`,
    );

    // Unauthorized roles denied via executeTool
    for (const deniedRole of ['PHARMACIST', 'HOSPITAL_ADMIN', 'AUDITOR']) {
      const res = await defaultToolRegistry.executeTool(tool.name, {}, ctx(deniedRole));
      assertPermissionDenied(res);
    }
  }

  // Schema parameter validation: get_unmapped_catalog_items
  assert.equal(
    getUnmappedCatalogItemsTool.parameters.safeParse({ limit: 0 }).success,
    false,
    'get_unmapped_catalog_items should reject limit < 1',
  );
  assert.equal(
    getUnmappedCatalogItemsTool.parameters.safeParse({ limit: 201 }).success,
    false,
    'get_unmapped_catalog_items should reject limit > 200',
  );

  // Schema parameter validation: get_mapping_suggestions
  assert.equal(
    getMappingSuggestionsTool.parameters.safeParse({ topN: 0 }).success,
    false,
    'get_mapping_suggestions should reject topN < 1',
  );
  assert.equal(
    getMappingSuggestionsTool.parameters.safeParse({ topN: 11 }).success,
    false,
    'get_mapping_suggestions should reject topN > 10',
  );
  assert.equal(
    getMappingSuggestionsTool.parameters.safeParse({ hospitalDrugId: 'not-a-uuid' }).success,
    false,
    'get_mapping_suggestions should reject invalid hospitalDrugId UUID',
  );

  // Runtime parameter validation: get_mapping_suggestions requires exactly one identifier
  const resNeither = await defaultToolRegistry.executeTool(
    'get_mapping_suggestions',
    {},
    ctx('DATA_ADMIN'),
  );
  assertFailed(resNeither, /Must provide exactly one of hospitalDrugId or mappingId/i);

  const resBoth = await defaultToolRegistry.executeTool(
    'get_mapping_suggestions',
    {
      hospitalDrugId: 'a0000000-0000-4000-8000-000000000001',
      mappingId: 'b0000000-0000-4000-8000-000000000002',
    },
    ctx('DATA_ADMIN'),
  );
  assertFailed(resBoth, /Must provide exactly one of hospitalDrugId or mappingId/i);

  // Schema parameter validation: submit_data_admin_proposal
  assert.equal(
    submitDataAdminProposalTool.parameters.safeParse({
      action: 'REJECT_DRUG_MAPPING',
      mappingId: '00000000-0000-0000-0000-000000000001',
      reason: 'short',
    }).success,
    false,
    'submit_data_admin_proposal should reject REJECT_DRUG_MAPPING reason < 10 chars',
  );
  assert.equal(
    submitDataAdminProposalTool.parameters.safeParse({
      action: 'VERIFY_DRUG_MAPPING',
      mappingId: 'not-a-uuid',
    }).success,
    false,
    'submit_data_admin_proposal should reject non-uuid mappingId',
  );
});

test('dataAdmin.tools: get_unmapped_catalog_items filtering, independent counts, and ordering', async () => {
  // 1. Independent SQL count of active unmapped catalog items
  const baseSql = `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE dm.status = 'UNMATCHED')::int AS unmatched,
           COUNT(*) FILTER (WHERE dm.status = 'SUGGESTED')::int AS suggested,
           COUNT(*) FILTER (WHERE dm.id IS NULL)::int AS no_mapping
      FROM hospital_drug hd
      JOIN hospital h ON h.id = hd.hospital_id
      LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
     WHERE hd.active = true
       AND (dm.status IN ('UNMATCHED', 'SUGGESTED') OR dm.id IS NULL)
  `;
  const countAllRes = await query<{
    total: number;
    unmatched: number;
    suggested: number;
    no_mapping: number;
  }>(baseSql);
  const dbCounts = countAllRes.rows[0];

  const resAll = await defaultToolRegistry.executeTool(
    'get_unmapped_catalog_items',
    { limit: 200, offset: 0 },
    ctx('DATA_ADMIN'),
  );
  assert.equal(resAll.success, true);
  const dataAll = resAll.data as any;

  assert.equal(dataAll.total, dbCounts.total);
  assert.equal(dataAll.summary.unmatched, dbCounts.unmatched);
  assert.equal(dataAll.summary.suggested, dbCounts.suggested);
  assert.equal(dataAll.summary.noMappingRow, dbCounts.no_mapping);
  assert.equal(
    dataAll.summary.unmatched + dataAll.summary.suggested + dataAll.summary.noMappingRow,
    dataAll.total,
    'Summary counts must sum up exactly to total',
  );
  assert.equal(dataAll.truncated, dataAll.total > dataAll.offset + dataAll.items.length);

  // Status values restricted to allowed set
  const allowedStatuses = new Set(['UNMATCHED', 'SUGGESTED', 'NO_MAPPING_ROW']);
  for (const item of dataAll.items) {
    assert.ok(
      allowedStatuses.has(item.mappingStatus),
      `mappingStatus '${item.mappingStatus}' must be in allowed set`,
    );
  }

  // Ordering check: V before E before D
  const vedRank: Record<string, number> = { V: 1, E: 2, D: 3 };
  let prevRank = 0;
  for (const item of dataAll.items) {
    const currentRank = vedRank[item.ved] ?? 99;
    assert.ok(
      currentRank >= prevRank,
      `VED ordering violation: encountered ${item.ved} (rank ${currentRank}) after rank ${prevRank}`,
    );
    prevRank = currentRank;
  }

  // 2. Specific filter tests
  const resUnmatched = await defaultToolRegistry.executeTool(
    'get_unmapped_catalog_items',
    { status: 'UNMATCHED', limit: 10 },
    ctx('DATA_ADMIN'),
  );
  assert.equal(resUnmatched.success, true);
  assert.equal((resUnmatched.data as any).total, dbCounts.unmatched);
  for (const item of (resUnmatched.data as any).items) {
    assert.equal(item.mappingStatus, 'UNMATCHED');
  }

  const resSuggested = await defaultToolRegistry.executeTool(
    'get_unmapped_catalog_items',
    { status: 'SUGGESTED', limit: 10 },
    ctx('DATA_ADMIN'),
  );
  assert.equal(resSuggested.success, true);
  assert.equal((resSuggested.data as any).total, dbCounts.suggested);
  for (const item of (resSuggested.data as any).items) {
    assert.equal(item.mappingStatus, 'SUGGESTED');
  }

  const resNoMapping = await defaultToolRegistry.executeTool(
    'get_unmapped_catalog_items',
    { status: 'NO_MAPPING_ROW', limit: 10 },
    ctx('DATA_ADMIN'),
  );
  assert.equal(resNoMapping.success, true);
  assert.equal((resNoMapping.data as any).total, dbCounts.no_mapping);
  for (const item of (resNoMapping.data as any).items) {
    assert.equal(item.mappingStatus, 'NO_MAPPING_ROW');
  }

  // 3. Hospital filter
  const hospRes = await query<{ id: string }>(`SELECT id FROM hospital WHERE active = true LIMIT 1`);
  if (hospRes.rows.length > 0) {
    const targetHospId = hospRes.rows[0].id;
    const resHosp = await defaultToolRegistry.executeTool(
      'get_unmapped_catalog_items',
      { hospitalId: targetHospId, limit: 50 },
      ctx('DATA_ADMIN'),
    );
    assert.equal(resHosp.success, true);
    // Cross-check every returned row belongs to this hospital
    for (const item of (resHosp.data as any).items) {
      const checkHd = await query<{ hospital_id: string }>(
        `SELECT hospital_id FROM hospital_drug WHERE id = $1`,
        [item.hospitalDrugId],
      );
      assert.equal(checkHd.rows[0].hospital_id, targetHospId);
    }
  }

  assertNoSecrets(resAll);
});

test('dataAdmin.tools: get_mapping_suggestions candidates consistency and advisory contract', async (t) => {
  // Query a drug mapping with algorithmic candidates
  const mapCandRes = await query<{ mapping_id: string; hospital_drug_id: string }>(
    `SELECT dm.id AS mapping_id, dm.hospital_drug_id
       FROM drug_mapping dm
       JOIN mapping_candidate mc ON mc.drug_mapping_id = dm.id
      GROUP BY dm.id, dm.hospital_drug_id
      LIMIT 1`,
  );

  await t.test('mapping suggestions consistency across hospitalDrugId and mappingId', async (sub) => {
    if (mapCandRes.rows.length === 0) {
      sub.skip('No drug_mapping with candidates found in database');
      return;
    }

    const { mapping_id, hospital_drug_id } = mapCandRes.rows[0];

    const resByMapping = await defaultToolRegistry.executeTool(
      'get_mapping_suggestions',
      { mappingId: mapping_id, topN: 5 },
      ctx('DATA_ADMIN'),
    );
    assert.equal(resByMapping.success, true);
    const dataByMapping = resByMapping.data as any;

    const resByDrug = await defaultToolRegistry.executeTool(
      'get_mapping_suggestions',
      { hospitalDrugId: hospital_drug_id, topN: 5 },
      ctx('DATA_ADMIN'),
    );
    assert.equal(resByDrug.success, true);
    const dataByDrug = resByDrug.data as any;

    assert.equal(dataByMapping.advisory, true);
    assert.equal(dataByDrug.advisory, true);
    assert.ok(dataByMapping.candidates.length <= 5);
    assert.equal(dataByMapping.candidates.length, dataByDrug.candidates.length);

    // Same candidates returned
    assert.deepEqual(
      dataByMapping.candidates.map((c: any) => c.tmtId),
      dataByDrug.candidates.map((c: any) => c.tmtId),
    );

    // Candidates ordered by rank ascending
    let prevRank = -1;
    for (const cand of dataByMapping.candidates) {
      assert.ok(cand.rank >= prevRank, 'Candidates must be ordered by rank ascending');
      prevRank = cand.rank;
    }

    assertNoSecrets(resByMapping);
    assertNoSecrets(resByDrug);
  });

  await t.test('drug without mapping row returns success with empty candidates and note', async () => {
    // Check if there is an unmapped hospital drug
    const unmappedDrugRes = await query<{ id: string }>(
      `SELECT hd.id
         FROM hospital_drug hd
         LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
        WHERE dm.id IS NULL AND hd.active = true
        LIMIT 1`,
    );

    const targetDrugId =
      unmappedDrugRes.rows.length > 0
        ? unmappedDrugRes.rows[0].id
        : 'a0000000-0000-4000-8000-000000000099';

    const res = await defaultToolRegistry.executeTool(
      'get_mapping_suggestions',
      { hospitalDrugId: targetDrugId },
      ctx('DATA_ADMIN'),
    );
    assert.equal(res.success, true);
    const data = res.data as any;
    assert.deepEqual(data.candidates, []);
    assert.equal(data.advisory, true);
    assert.match(data.note, /No mapping row exists/i);
  });

  await t.test('unknown mapping UUID returns success with empty candidates and note', async () => {
    const res = await defaultToolRegistry.executeTool(
      'get_mapping_suggestions',
      { mappingId: 'b0000000-0000-4000-8000-000000000099' },
      ctx('DATA_ADMIN'),
    );
    assert.equal(res.success, true);
    const data = res.data as any;
    assert.deepEqual(data.candidates, []);
    assert.equal(data.advisory, true);
    assert.match(data.note, /No mapping row exists/i);
  });
});

test('dataAdmin.tools: audit_ved_classifications findings, independent SQL cross-checks', async () => {
  const res = await defaultToolRegistry.executeTool(
    'audit_ved_classifications',
    { limit: 200 },
    ctx('DATA_ADMIN'),
  );
  assert.equal(res.success, true);
  const data = res.data as any;

  // Allowed finding codes
  const allowedCodes = new Set([
    'MISSING_ABC',
    'HIGH_COST_NON_VITAL',
    'VITAL_UNMAPPED',
    'VED_CONFLICT_ACROSS_HOSPITALS',
  ]);

  for (const finding of data.findings) {
    assert.ok(
      allowedCodes.has(finding.code),
      `Finding code '${finding.code}' must be in allowed set`,
    );
    assert.ok(finding.detail.length > 0);
  }

  // Assumptions present and note that VED is NOT NULL
  assert.equal(data.assumptions.highCostReviewThresholdThb, HIGH_COST_VED_REVIEW_THRESHOLD_THB);
  assert.ok(data.assumptions.missingVedCheckSkipped.includes('NOT NULL'));

  // Summary counts match returned findings when limit >= total
  if (data.limit >= data.total) {
    assert.equal(
      data.summary.HIGH_COST_NON_VITAL,
      data.findings.filter((f: any) => f.code === 'HIGH_COST_NON_VITAL').length,
    );
    assert.equal(
      data.summary.VITAL_UNMAPPED,
      data.findings.filter((f: any) => f.code === 'VITAL_UNMAPPED').length,
    );
    assert.equal(
      data.summary.MISSING_ABC,
      data.findings.filter((f: any) => f.code === 'MISSING_ABC').length,
    );
    assert.equal(
      data.summary.VED_CONFLICT_ACROSS_HOSPITALS,
      data.findings.filter((f: any) => f.code === 'VED_CONFLICT_ACROSS_HOSPITALS').length,
    );
  }

  // Independent SQL cross-checks:
  // 1. HIGH_COST_NON_VITAL
  const highCostSql = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM hospital_drug hd
      WHERE hd.active = true
        AND hd.unit_price_thb > $1
        AND hd.ved <> 'V'`,
    [HIGH_COST_VED_REVIEW_THRESHOLD_THB],
  );
  assert.equal(data.summary.HIGH_COST_NON_VITAL, highCostSql.rows[0].count);

  // 2. VITAL_UNMAPPED
  const vitalUnmappedSql = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM hospital_drug hd
       LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
      WHERE hd.active = true
        AND hd.ved = 'V'
        AND (dm.id IS NULL OR dm.status <> 'VERIFIED')`,
  );
  assert.equal(data.summary.VITAL_UNMAPPED, vitalUnmappedSql.rows[0].count);

  // 3. MISSING_ABC
  const missingAbcSql = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM hospital_drug hd
      WHERE hd.active = true
        AND hd.abc IS NULL`,
  );
  assert.equal(data.summary.MISSING_ABC, missingAbcSql.rows[0].count);

  // 4. VED_CONFLICT_ACROSS_HOSPITALS
  const conflictSql = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT dmast.id
         FROM drug_mapping dm
         JOIN hospital_drug hd ON hd.id = dm.hospital_drug_id
         JOIN drug_master dmast ON dmast.id = dm.drug_master_id
        WHERE dm.status = 'VERIFIED'
          AND hd.active = true
        GROUP BY dmast.id
       HAVING COUNT(DISTINCT hd.ved) > 1
     ) t`,
  );
  assert.equal(data.summary.VED_CONFLICT_ACROSS_HOSPITALS, conflictSql.rows[0].count);

  assertNoSecrets(res);
});

test('dataAdmin.tools: submit_data_admin_proposal verification, actions, and no-mutation proof', async (t) => {
  const snapMapping = await countRows('drug_mapping');
  const snapCandidate = await countRows('mapping_candidate');
  const snapDrug = await countRows('hospital_drug');
  const snapMaster = await countRows('drug_master');
  const snapAudit = await countRows('audit_log');

  // 1. Action: VERIFY_DRUG_MAPPING
  await t.test('VERIFY_DRUG_MAPPING with non-null base_units_per_pack and decimal override', async (sub) => {
    const mapRes = await query<{
      id: string;
      status: string;
      version: number;
      base_units_per_pack: string;
      drug_master_id: string | null;
    }>(
      `SELECT id, status::text AS status, version, base_units_per_pack::text AS base_units_per_pack, drug_master_id
         FROM drug_mapping
        WHERE base_units_per_pack IS NOT NULL AND base_units_per_pack > 0
        LIMIT 1`,
    );

    if (mapRes.rows.length === 0) {
      sub.skip('No drug_mapping with non-null base_units_per_pack found');
      return;
    }

    const mapping = mapRes.rows[0];
    const expectedBaseUnits = Number(mapping.base_units_per_pack);

    // Call 1a: Use existing baseUnitsPerPack from DB row
    const resVerify = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'VERIFY_DRUG_MAPPING',
        mappingId: mapping.id,
      },
      ctx('DATA_ADMIN'),
    );

    assert.equal(resVerify.success, true);
    assert.equal((resVerify.data as any).requiresHumanApproval, true);

    const whitelistVerify = WHITELIST.DATA_ADMIN.VERIFY_DRUG_MAPPING;
    const expectedEndpoint = buildEndpoint(whitelistVerify.endpointTemplate, { id: mapping.id });
    assert.equal(resVerify.proposal?.actionApi?.method, whitelistVerify.method);
    assert.equal(resVerify.proposal?.actionApi?.endpoint, expectedEndpoint);

    const payload = resVerify.proposal?.actionApi?.payload as any;
    assert.equal(payload.version, mapping.version);
    assert.equal(payload.baseUnitsPerPack, expectedBaseUnits);
    assert.equal(typeof payload.baseUnitsPerPack, 'number');

    // If already verified or rejected, warning field is returned
    if (mapping.status === 'VERIFIED' || mapping.status === 'REJECTED') {
      assert.ok(typeof (resVerify.data as any).warning === 'string');
    }

    // Call 1b: Decimal override accepted (e.g. 10.5)
    const resOverride = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'VERIFY_DRUG_MAPPING',
        mappingId: mapping.id,
        baseUnitsPerPack: 10.5,
      },
      ctx('DATA_ADMIN'),
    );
    assert.equal(resOverride.success, true);
    assert.equal((resOverride.proposal?.actionApi?.payload as any).baseUnitsPerPack, 10.5);

    assertNoSecrets(resVerify);
    assertNoSecrets(resOverride);
  });

  await t.test('VERIFY_DRUG_MAPPING fails when base_units_per_pack is NULL and no override provided', async (sub) => {
    const nullMapRes = await query<{ id: string }>(
      `SELECT id FROM drug_mapping WHERE base_units_per_pack IS NULL LIMIT 1`,
    );

    if (nullMapRes.rows.length === 0) {
      sub.skip('No drug_mapping with NULL base_units_per_pack found');
      return;
    }

    const mappingId = nullMapRes.rows[0].id;
    const res = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'VERIFY_DRUG_MAPPING',
        mappingId,
      },
      ctx('DATA_ADMIN'),
    );

    assert.equal(res.success, false);
    assert.match(res.error ?? '', /baseUnitsPerPack \(positive number\) is required/i);
  });

  await t.test('VERIFY_DRUG_MAPPING fails for unknown mapping UUID', async () => {
    const res = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'VERIFY_DRUG_MAPPING',
        mappingId: '00000000-0000-0000-0000-000000000000',
        baseUnitsPerPack: 100,
      },
      ctx('DATA_ADMIN'),
    );
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /Drug mapping '.*' not found/i);
  });

  // 2. Action: REJECT_DRUG_MAPPING
  await t.test('REJECT_DRUG_MAPPING generates proposal with exact payload', async () => {
    const mapRes = await query<{ id: string }>(`SELECT id FROM drug_mapping LIMIT 1`);
    const mappingId = mapRes.rows[0].id;

    const res = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'REJECT_DRUG_MAPPING',
        mappingId,
        reason: 'Local strength does not match canonical drug master record.',
      },
      ctx('DATA_ADMIN'),
    );

    assert.equal(res.success, true);
    assert.equal((res.data as any).requiresHumanApproval, true);

    const whitelistReject = WHITELIST.DATA_ADMIN.REJECT_DRUG_MAPPING;
    const expectedEndpoint = buildEndpoint(whitelistReject.endpointTemplate, { id: mappingId });
    assert.equal(res.proposal?.actionApi?.method, whitelistReject.method);
    assert.equal(res.proposal?.actionApi?.endpoint, expectedEndpoint);
    assert.deepEqual(res.proposal?.actionApi?.payload, {
      reason: 'Local strength does not match canonical drug master record.',
    });

    assertNoSecrets(res);
  });

  // 3. Action: UPDATE_CENTRAL_ITEM
  await t.test('UPDATE_CENTRAL_ITEM generates proposal with exact snake_case payload', async () => {
    const res = await defaultToolRegistry.executeTool(
      'submit_data_admin_proposal',
      {
        action: 'UPDATE_CENTRAL_ITEM',
        itemType: 'SUPPLY',
        internalCode: 'SUP-9999',
        genericName: 'Disposable surgical syringe 10ml',
        baseUnit: 'piece',
        strength: '10ml',
        dosageForm: 'Syringe',
      },
      ctx('DATA_ADMIN'),
    );

    assert.equal(res.success, true);
    assert.equal((res.data as any).requiresHumanApproval, true);

    const whitelistItem = WHITELIST.DATA_ADMIN.UPDATE_CENTRAL_ITEM;
    assert.equal(res.proposal?.actionApi?.method, whitelistItem.method);
    assert.equal(res.proposal?.actionApi?.endpoint, whitelistItem.endpointTemplate);
    assert.deepEqual(res.proposal?.actionApi?.payload, {
      item_type: 'SUPPLY',
      internal_code: 'SUP-9999',
      generic_name: 'Disposable surgical syringe 10ml',
      base_unit: 'piece',
      strength: '10ml',
      dosage_form: 'Syringe',
    });

    // Rejection of invalid itemType
    assert.equal(
      submitDataAdminProposalTool.parameters.safeParse({
        action: 'UPDATE_CENTRAL_ITEM',
        itemType: 'INVALID_CATEGORY',
        internalCode: 'SUP-0001',
        genericName: 'Item',
        baseUnit: 'piece',
      }).success,
      false,
      'Should reject invalid itemType category',
    );

    assertNoSecrets(res);
  });

  // NO-MUTATION PROOF: Row counts must remain strictly identical
  assert.equal(await countRows('drug_mapping'), snapMapping, 'drug_mapping count must not change');
  assert.equal(await countRows('mapping_candidate'), snapCandidate, 'mapping_candidate count must not change');
  assert.equal(await countRows('hospital_drug'), snapDrug, 'hospital_drug count must not change');
  assert.equal(await countRows('drug_master'), snapMaster, 'drug_master count must not change');
  assert.equal(await countRows('audit_log'), snapAudit, 'audit_log count must not change');
});
