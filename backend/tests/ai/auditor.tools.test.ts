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
} from './helpers.js';
import {
  inspectAgentRunProvenanceTool,
  inspectNarcoticsChainOfCustodyTool,
  verifyTamperEvidenceTool,
  submitAuditorFindingProposalTool,
  detectCustodyGaps,
  analyzeAuditWindow,
  NARCOTICS_IN_TRANSIT_MAX_HOURS,
  PROVENANCE_TEXT_MAX_CHARS,
  type CustodyTaskInput,
  type AuditWindowRow,
} from '../../src/modules/ai/tools/governance/auditor.tools.js';

test('auditor.tools: Schema and allowedRoles validation across all 4 auditor tools', async () => {
  const tools = [
    inspectAgentRunProvenanceTool,
    inspectNarcoticsChainOfCustodyTool,
    verifyTamperEvidenceTool,
    submitAuditorFindingProposalTool,
  ];

  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `Tool ${tool.name} description must not be empty`);
    assert.deepEqual(
      new Set(tool.allowedRoles),
      new Set(['AUDITOR', 'SYSTEM_ADMIN']),
      `Tool ${tool.name} allowedRoles must match ['AUDITOR', 'SYSTEM_ADMIN']`,
    );

    // Unauthorized roles denied via executeTool
    for (const deniedRole of ['PHARMACIST', 'DRIVER', 'HOSPITAL_ADMIN', 'DATA_ADMIN']) {
      const res = await defaultToolRegistry.executeTool(tool.name, {}, ctx(deniedRole));
      assertPermissionDenied(res);
    }
  }

  // Schema parameter validation: inspect_agent_run_provenance
  assert.equal(
    inspectAgentRunProvenanceTool.parameters.safeParse({ runId: 'not-a-uuid' }).success,
    false,
    'inspect_agent_run_provenance should reject invalid runId UUID',
  );
  assert.equal(
    inspectAgentRunProvenanceTool.parameters.safeParse({ limit: 0 }).success,
    false,
    'inspect_agent_run_provenance should reject limit < 1',
  );
  assert.equal(
    inspectAgentRunProvenanceTool.parameters.safeParse({ limit: 201 }).success,
    false,
    'inspect_agent_run_provenance should reject limit > 200',
  );

  // Schema parameter validation: verify_tamper_evidence
  assert.equal(
    verifyTamperEvidenceTool.parameters.safeParse({ windowSize: 9 }).success,
    false,
    'verify_tamper_evidence should reject windowSize < 10',
  );
  assert.equal(
    verifyTamperEvidenceTool.parameters.safeParse({ windowSize: 501 }).success,
    false,
    'verify_tamper_evidence should reject windowSize > 500',
  );

  // Schema parameter validation: submit_auditor_finding_proposal
  assert.equal(
    submitAuditorFindingProposalTool.parameters.safeParse({
      title: 'Tiny',
      severity: 'HIGH',
      description: 'Long enough description for test case here.',
      findings: [{ entityType: 'transport_task', entityId: 'id-1', observation: 'Obs' }],
    }).success,
    false,
    'submit_auditor_finding_proposal should reject title < 5 chars',
  );
  assert.equal(
    submitAuditorFindingProposalTool.parameters.safeParse({
      title: 'Valid Title Here',
      severity: 'HIGH',
      description: 'Too short',
      findings: [{ entityType: 'transport_task', entityId: 'id-1', observation: 'Obs' }],
    }).success,
    false,
    'submit_auditor_finding_proposal should reject description < 20 chars',
  );
  assert.equal(
    submitAuditorFindingProposalTool.parameters.safeParse({
      title: 'Valid Title Here',
      severity: 'HIGH',
      description: 'Long enough description for test case here.',
      findings: [],
    }).success,
    false,
    'submit_auditor_finding_proposal should reject empty findings array',
  );
  assert.equal(
    submitAuditorFindingProposalTool.parameters.safeParse({
      title: 'Valid Title Here',
      severity: 'HIGH',
      description: 'Long enough description for test case here.',
      findings: Array(21).fill({ entityType: 'audit_log', entityId: 'id', observation: 'Obs' }),
    }).success,
    false,
    'submit_auditor_finding_proposal should reject > 20 findings',
  );
  assert.equal(
    submitAuditorFindingProposalTool.parameters.safeParse({
      title: 'Valid Title Here',
      severity: 'INVALID_SEVERITY' as any,
      description: 'Long enough description for test case here.',
      findings: [{ entityType: 'audit_log', entityId: 'id', observation: 'Obs' }],
    }).success,
    false,
    'submit_auditor_finding_proposal should reject invalid severity enum',
  );
});

test('auditor.tools: inspect_agent_run_provenance list mode, metadata restriction, and single-run mode', async (t) => {
  // 1. List mode
  const resList = await defaultToolRegistry.executeTool(
    'inspect_agent_run_provenance',
    { limit: 50, offset: 0 },
    ctx('AUDITOR'),
  );
  assert.equal(resList.success, true);
  const dataList = resList.data as any;

  assert.ok(Array.isArray(dataList.items));
  const countRes = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM agent_run`);
  const dbRunCount = countRes.rows[0].count;
  assert.equal(dataList.total, dbRunCount);
  assert.equal(dataList.truncated, dataList.total > dataList.offset + dataList.items.length);

  // Status breakdown limited to the five allowed statuses
  const allowedStatuses = new Set(['OK', 'INVALID', 'FALLBACK', 'ERROR', 'SKIPPED']);
  assert.deepEqual(
    Object.keys(dataList.summary.byStatus).sort(),
    Array.from(allowedStatuses).sort(),
  );

  // Metadata only: No raw prompt input/output or tool args/result in list items
  for (const item of dataList.items) {
    assert.equal('input' in item, false);
    assert.equal('output' in item, false);
    assert.equal('args' in item, false);
    assert.equal('result' in item, false);
  }

  assertNoSecrets(resList);

  // 2. Single-run mode: Unknown UUID returns success: false
  const resUnknown = await defaultToolRegistry.executeTool(
    'inspect_agent_run_provenance',
    { runId: 'a0000000-0000-4000-8000-000000000099' },
    ctx('AUDITOR'),
  );
  assert.equal(resUnknown.success, false);
  assert.match(resUnknown.error ?? '', /Agent run '.*' not found/i);

  // 3. Single-run mode with real database row
  await t.test('single-run mode inspection with real database row', async (sub) => {
    const runRes = await query<{ id: string }>(`SELECT id FROM agent_run LIMIT 1`);
    if (runRes.rows.length === 0) {
      sub.skip('No agent_run records exist in seed database (count: 0)');
      return;
    }

    const realRunId = runRes.rows[0].id;
    const resSingle = await defaultToolRegistry.executeTool(
      'inspect_agent_run_provenance',
      { runId: realRunId },
      ctx('AUDITOR'),
    );
    assert.equal(resSingle.success, true);
    const dataSingle = resSingle.data as any;

    assert.equal(dataSingle.run.id, realRunId);
    assert.ok(Array.isArray(dataSingle.toolCalls));
    assert.ok(Array.isArray(dataSingle.auditLogEntries));

    // toolCalls ordered by seq ascending
    let prevSeq = -1;
    for (const tc of dataSingle.toolCalls) {
      assert.ok(tc.seq >= prevSeq, 'toolCalls must be ordered by seq ascending');
      prevSeq = tc.seq;
      assert.ok(typeof tc.argsTruncated === 'boolean');
      assert.ok(typeof tc.resultTruncated === 'boolean');
    }

    // Related audit entries contain only metadata columns and NEVER before/after payloads
    for (const auditEntry of dataSingle.auditLogEntries) {
      assert.equal('before' in auditEntry, false);
      assert.equal('after' in auditEntry, false);
      assert.ok(auditEntry.rowHash);
    }

    assertNoSecrets(resSingle);
  });
});

test('auditor.tools: inspect_narcotics_chain_of_custody independent counts, filtering, and pagination', async () => {
  // Independent SQL derived from DooRare schema semantics:
  // Controlled transport tasks occur via two paths:
  // 1. BORROW_LEG: transport_task -> borrow_leg -> borrow_request_item -> drug_master (is_controlled = true)
  // 2. ALLOCATION_LINE: transport_task -> allocation_line -> allocation_plan -> pool_entry -> near_expiry_item -> stock_lot -> hospital_drug -> drug_master (is_controlled = true)
  const independentSql = `
    SELECT count(*)::int AS total,
           COUNT(*) FILTER (WHERE ref_type = 'ALLOCATION_LINE')::int AS allocation_count
      FROM (
        SELECT tt.id, tt.ref_type
          FROM transport_task tt
          JOIN borrow_leg bl ON bl.id = tt.ref_id AND tt.ref_type = 'BORROW_LEG'
          JOIN borrow_request_item bri ON bri.id = bl.request_item_id
          JOIN drug_master dm ON dm.id = bri.drug_master_id AND dm.is_controlled = true
        UNION ALL
        SELECT tt.id, tt.ref_type
          FROM transport_task tt
          JOIN allocation_line al ON al.id = tt.ref_id AND tt.ref_type = 'ALLOCATION_LINE'
          JOIN allocation_plan ap ON ap.id = al.plan_id
          JOIN pool_entry pe ON pe.id = ap.pool_entry_id
          JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
          JOIN stock_lot sl ON sl.id = ne.lot_id
          JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
          JOIN drug_master dm ON dm.id = hd.drug_master_id AND dm.is_controlled = true
      ) t
  `;
  const indepRes = await query<{ total: number; allocation_count: number }>(independentSql);
  const { total: expectedTotal, allocation_count: expectedAllocCount } = indepRes.rows[0];

  const resAll = await defaultToolRegistry.executeTool(
    'inspect_narcotics_chain_of_custody',
    { limit: 200, offset: 0 },
    ctx('AUDITOR'),
  );
  assert.equal(resAll.success, true);
  const dataAll = resAll.data as any;

  assert.equal(dataAll.total, expectedTotal);
  assert.equal(dataAll.summaryByCode.CONTROLLED_IN_ALLOCATION, expectedAllocCount);

  // Allowed finding codes
  const allowedFindingCodes = new Set([
    'MISSING_DRIVER',
    'MISSING_TIMESTAMP',
    'TIMESTAMP_ORDER_VIOLATION',
    'NO_EVENT_TRAIL',
    'NO_HANDOVER_PHOTO',
    'STALE_IN_TRANSIT',
    'CONTROLLED_IN_ALLOCATION',
  ]);

  for (const task of dataAll.tasks) {
    assert.ok(task.taskId);
    assert.ok(task.drugName);
    for (const f of task.findings) {
      assert.ok(allowedFindingCodes.has(f.code), `Finding code ${f.code} must be in allowed set`);
    }
  }

  // Summary counts match sum of findings
  const codeSum = Object.values(dataAll.summaryByCode).reduce((acc: number, c: any) => acc + c, 0);
  assert.equal(dataAll.totalFindings, codeSum);

  // Pagination consistency test: page 1 and page 2 with limit 2
  if (dataAll.total >= 4) {
    const resP1 = await defaultToolRegistry.executeTool(
      'inspect_narcotics_chain_of_custody',
      { limit: 2, offset: 0 },
      ctx('AUDITOR'),
    );
    const resP2 = await defaultToolRegistry.executeTool(
      'inspect_narcotics_chain_of_custody',
      { limit: 2, offset: 2 },
      ctx('AUDITOR'),
    );
    const p1Tasks = (resP1.data as any).tasks;
    const p2Tasks = (resP2.data as any).tasks;

    assert.equal(p1Tasks.length, 2);
    assert.equal(p2Tasks.length, 2);
    assert.equal((resP1.data as any).truncated, true);

    const p1Ids = new Set(p1Tasks.map((t: any) => t.taskId));
    for (const t of p2Tasks) {
      assert.equal(p1Ids.has(t.taskId), false, 'Page 1 and Page 2 tasks must be disjoint');
    }
  }

  // Single taskId filter test
  if (dataAll.tasks.length > 0) {
    const targetTaskId = dataAll.tasks[0].taskId;
    const resSingle = await defaultToolRegistry.executeTool(
      'inspect_narcotics_chain_of_custody',
      { taskId: targetTaskId },
      ctx('AUDITOR'),
    );
    assert.equal(resSingle.success, true);
    assert.equal((resSingle.data as any).total, 1);
    assert.equal((resSingle.data as any).tasks[0].taskId, targetTaskId);
  }

  assertNoSecrets(resAll);
});

test('auditor.tools: detectCustodyGaps pure unit testing of all 7 compliance finding codes', () => {
  const baseTask: CustodyTaskInput = {
    taskId: 'task-1',
    taskNo: 'TSK-001',
    status: 'RECEIVED',
    driver_id: 'driver-1',
    loaded_at: '2026-10-24T08:00:00.000Z',
    departed_at: '2026-10-24T08:15:00.000Z',
    arrived_at: '2026-10-24T09:30:00.000Z',
    received_at: '2026-10-24T09:45:00.000Z',
    eventCount: 4,
    photoCount: 2,
    handoverPhotoCount: 1,
    is_controlled: true,
    ref_type: 'BORROW_LEG',
    drug_name: 'Morphine sulfate 10mg/ml',
  };

  // Base case: Fully compliant BORROW_LEG RECEIVED task yields empty findings array
  const cleanFindings = detectCustodyGaps(baseTask);
  assert.deepEqual(cleanFindings, [], 'Compliant task must yield zero findings');

  // 1. MISSING_DRIVER
  const missingDriverPositive = detectCustodyGaps({ ...baseTask, driver_id: null });
  assert.ok(missingDriverPositive.some((f) => f.code === 'MISSING_DRIVER'));

  const missingDriverNegative = detectCustodyGaps({
    ...baseTask,
    status: 'WAITING_DISPATCH',
    driver_id: null,
  });
  assert.equal(
    missingDriverNegative.some((f) => f.code === 'MISSING_DRIVER'),
    false,
    'WAITING_DISPATCH does not require driver yet',
  );

  // 2. MISSING_TIMESTAMP per lifecycle status
  assert.ok(
    detectCustodyGaps({ ...baseTask, status: 'LOADED', loaded_at: null }).some(
      (f) => f.code === 'MISSING_TIMESTAMP',
    ),
  );
  assert.ok(
    detectCustodyGaps({ ...baseTask, status: 'IN_TRANSIT', departed_at: null }).some(
      (f) => f.code === 'MISSING_TIMESTAMP',
    ),
  );
  assert.ok(
    detectCustodyGaps({ ...baseTask, status: 'ARRIVED', arrived_at: null }).some(
      (f) => f.code === 'MISSING_TIMESTAMP',
    ),
  );
  assert.ok(
    detectCustodyGaps({ ...baseTask, status: 'RECEIVED', received_at: null }).some(
      (f) => f.code === 'MISSING_TIMESTAMP',
    ),
  );

  // 3. TIMESTAMP_ORDER_VIOLATION
  const outOfOrder = detectCustodyGaps({
    ...baseTask,
    loaded_at: '2026-10-24T08:30:00.000Z',
    departed_at: '2026-10-24T08:15:00.000Z', // departed earlier than loaded
  });
  assert.ok(outOfOrder.some((f) => f.code === 'TIMESTAMP_ORDER_VIOLATION'));

  // 4. NO_EVENT_TRAIL
  const noEvents = detectCustodyGaps({ ...baseTask, eventCount: 0 });
  assert.ok(noEvents.some((f) => f.code === 'NO_EVENT_TRAIL'));

  const withEvents = detectCustodyGaps({ ...baseTask, eventCount: 2 });
  assert.equal(withEvents.some((f) => f.code === 'NO_EVENT_TRAIL'), false);

  // 5. NO_HANDOVER_PHOTO
  const noPhotos = detectCustodyGaps({ ...baseTask, handoverPhotoCount: 0, photoCount: 0 });
  assert.ok(noPhotos.some((f) => f.code === 'NO_HANDOVER_PHOTO'));

  // 6. STALE_IN_TRANSIT
  const departedMs = new Date('2026-10-24T00:00:00.000Z').getTime();
  const thresholdExceededNow = departedMs + (NARCOTICS_IN_TRANSIT_MAX_HOURS + 1) * 3600 * 1000;
  const staleTransit = detectCustodyGaps(
    {
      ...baseTask,
      status: 'IN_TRANSIT',
      departed_at: new Date(departedMs).toISOString(),
      arrived_at: null,
      received_at: null,
    },
    thresholdExceededNow,
  );
  assert.ok(staleTransit.some((f) => f.code === 'STALE_IN_TRANSIT'));

  const withinThresholdNow = departedMs + (NARCOTICS_IN_TRANSIT_MAX_HOURS - 1) * 3600 * 1000;
  const freshTransit = detectCustodyGaps(
    {
      ...baseTask,
      status: 'IN_TRANSIT',
      departed_at: new Date(departedMs).toISOString(),
      arrived_at: null,
      received_at: null,
    },
    withinThresholdNow,
  );
  assert.equal(freshTransit.some((f) => f.code === 'STALE_IN_TRANSIT'), false);

  // 7. CONTROLLED_IN_ALLOCATION (Rule BR-F1b-014 violation)
  const allocViolation = detectCustodyGaps({
    ...baseTask,
    ref_type: 'ALLOCATION_LINE',
  });
  assert.ok(allocViolation.some((f) => f.code === 'CONTROLLED_IN_ALLOCATION'));

  // CANCELLED task skips procedural checks but flags CONTROLLED_IN_ALLOCATION
  const cancelledTask = detectCustodyGaps({
    ...baseTask,
    status: 'CANCELLED',
    driver_id: null,
    eventCount: 0,
    ref_type: 'ALLOCATION_LINE',
  });
  assert.equal(cancelledTask.length, 1);
  assert.equal(cancelledTask[0].code, 'CONTROLLED_IN_ALLOCATION');
});

test('auditor.tools: verify_tamper_evidence live database execution and exact output shape', async () => {
  const res = await defaultToolRegistry.executeTool(
    'verify_tamper_evidence',
    { windowSize: 50 },
    ctx('AUDITOR'),
  );
  assert.equal(res.success, true);
  const data = res.data as any;

  // Exact set of keys
  const expectedKeys = [
    'chainVerifyProblems',
    'intact',
    'windowChecked',
    'linkedPairs',
    'edgeRows',
    'forks',
    'genesisCandidatesInWindow',
    'anomalies',
    'checkedAt',
    'note',
  ];
  assert.deepEqual(Object.keys(data).sort(), expectedKeys.sort());

  // Invariants
  assert.equal(data.intact, data.chainVerifyProblems === 0);
  const verifyRes = await query<{ problems: string }>(`SELECT audit_chain_verify() AS problems`);
  assert.equal(data.chainVerifyProblems, Number(verifyRes.rows[0].problems));

  const countRes = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM audit_log`);
  const totalAudit = countRes.rows[0].count;
  assert.equal(data.windowChecked, Math.min(50, totalAudit));
  assert.ok(new Date(data.checkedAt).getTime() > 0);

  // Entity audit trail path with random UUID
  const resEntity = await defaultToolRegistry.executeTool(
    'verify_tamper_evidence',
    {
      windowSize: 50,
      entityType: 'transport_task',
      entityId: 'a0000000-0000-4000-8000-000000000001',
    },
    ctx('AUDITOR'),
  );
  assert.equal(resEntity.success, true);
  assert.ok(Array.isArray((resEntity.data as any).entityAuditTrail));

  assertNoSecrets(res);
});

test('auditor.tools: analyzeAuditWindow pure unit testing of hash chain topology', () => {
  // (a) Clean linear chain of N rows in scrambled ID order
  const scrambledLinearChain: AuditWindowRow[] = [
    { id: 2, prev_hash: 'hash-1', row_hash: 'hash-2' },
    { id: 1, prev_hash: null, row_hash: 'hash-1' },
    { id: 3, prev_hash: 'hash-2', row_hash: 'hash-3' },
  ];
  const linearRes = analyzeAuditWindow(scrambledLinearChain);
  assert.equal(linearRes.linkedPairs, 2);
  assert.equal(linearRes.forks, 0);
  assert.equal(linearRes.edgeRows, 0);
  assert.equal(linearRes.genesisCandidatesInWindow, 1);
  assert.deepEqual(linearRes.anomalies, []);

  // (b) Fork (two rows sharing identical non-null prev_hash)
  const forkedRows: AuditWindowRow[] = [
    { id: 1, prev_hash: null, row_hash: 'hash-1' },
    { id: 2, prev_hash: 'hash-1', row_hash: 'hash-2a' },
    { id: 3, prev_hash: 'hash-1', row_hash: 'hash-2b' },
  ];
  const forkRes = analyzeAuditWindow(forkedRows);
  assert.equal(forkRes.forks, 1);
  assert.ok(forkRes.anomalies.some((a) => a.includes('Fork detected')));

  // (c) Window edge: row whose prev_hash is not present in window
  const edgeRows: AuditWindowRow[] = [
    { id: 10, prev_hash: 'hash-outside-window', row_hash: 'hash-10' },
    { id: 11, prev_hash: 'hash-10', row_hash: 'hash-11' },
  ];
  const edgeRes = analyzeAuditWindow(edgeRows);
  assert.equal(edgeRes.edgeRows, 1);
  assert.equal(edgeRes.linkedPairs, 1);
  assert.deepEqual(edgeRes.anomalies, []);

  // (d) Two genesis rows (prev_hash null) in window
  const twoGenesisRows: AuditWindowRow[] = [
    { id: 1, prev_hash: null, row_hash: 'hash-1' },
    { id: 2, prev_hash: null, row_hash: 'hash-2' },
  ];
  const genesisRes = analyzeAuditWindow(twoGenesisRows);
  assert.equal(genesisRes.genesisCandidatesInWindow, 2);

  // (e) Self-referential loop (prev_hash equals row_hash)
  const loopRows: AuditWindowRow[] = [
    { id: 1, prev_hash: 'hash-loop', row_hash: 'hash-loop' },
  ];
  const loopRes = analyzeAuditWindow(loopRows);
  assert.ok(loopRes.anomalies.some((a) => a.includes('Self-referential loop')));

  // (f) Empty window returns zeros without throwing
  const emptyRes = analyzeAuditWindow([]);
  assert.deepEqual(emptyRes, {
    linkedPairs: 0,
    edgeRows: 0,
    forks: 0,
    genesisCandidatesInWindow: 0,
    anomalies: [],
  });
});

test('auditor.tools: submit_auditor_finding_proposal contract, secret redaction, and no-mutation', async () => {
  const snapAudit = await countRows('audit_log');
  const snapRun = await countRows('agent_run');
  const snapTask = await countRows('transport_task');

  const res = await defaultToolRegistry.executeTool(
    'submit_auditor_finding_proposal',
    {
      title: 'Review of Bearer sk-antigravity-99999999 and AKIAIOSFODNN7EXAMPLE token',
      severity: 'HIGH',
      description: 'Audit finding description containing credentials sk-1234567890abcdef and AKIAIOSFODNN7EXAMPLE.',
      findings: [
        {
          entityType: 'transport_task',
          entityId: 'task-123',
          observation: 'Discrepancy observed with Authorization Bearer secret-token-xyz.',
        },
      ],
      recommendedActions: [
        'Rotate credentials immediately and invalidate Bearer sk-temp-987654321.',
      ],
    },
    ctx('AUDITOR'),
  );

  assert.equal(res.success, true);
  const data = res.data as any;

  // Contract verification
  assert.equal(data.status, 'DRAFT_ONLY');
  assert.equal(data.executable, false);
  assert.equal(data.requiresHumanReview, true);
  assert.equal('proposal' in res, false, 'DRAFT_ONLY must not generate an executable proposal card');

  // Redaction checks: sensitive tokens redacted to [REDACTED]
  assert.equal(data.title.includes('sk-antigravity-99999999'), false);
  assert.equal(data.title.includes('AKIAIOSFODNN7EXAMPLE'), false);
  assert.ok(data.title.includes('[REDACTED]'));

  assert.equal(data.description.includes('sk-1234567890abcdef'), false);
  assert.ok(data.description.includes('[REDACTED]'));

  assert.equal(data.findings[0].observation.includes('secret-token-xyz'), false);
  assert.ok(data.findings[0].observation.includes('[REDACTED]'));

  assert.equal(data.recommendedActions[0].includes('sk-temp-987654321'), false);
  assert.ok(data.recommendedActions[0].includes('[REDACTED]'));

  // SYSTEM_ADMIN also allowed
  const resSys = await defaultToolRegistry.executeTool(
    'submit_auditor_finding_proposal',
    {
      title: 'Valid administrative audit findings documentation',
      severity: 'LOW',
      description: 'Standard documentation for routine regional reconciliation compliance audit.',
      findings: [
        {
          entityType: 'drug_mapping',
          entityId: 'map-1',
          observation: 'Minor classification inconsistency.',
        },
      ],
    },
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resSys.success, true);
  assert.deepEqual((resSys.data as any).recommendedActions, []);

  // NO-MUTATION PROOF: Row counts must remain strictly identical
  assert.equal(await countRows('audit_log'), snapAudit, 'audit_log count must not change');
  assert.equal(await countRows('agent_run'), snapRun, 'agent_run count must not change');
  assert.equal(await countRows('transport_task'), snapTask, 'transport_task count must not change');
});

test('auditor.tools: NO-MUTATION proof for all read tools across DB audit and transport tables', async () => {
  const snapRun = await countRows('agent_run');
  const snapToolCall = await countRows('agent_tool_call');
  const snapAudit = await countRows('audit_log');
  const snapTask = await countRows('transport_task');
  const snapEvent = await countRows('transport_event');
  const snapPhoto = await countRows('transport_photo');

  // Execute read tools
  await defaultToolRegistry.executeTool(
    'inspect_agent_run_provenance',
    { limit: 10 },
    ctx('AUDITOR'),
  );
  await defaultToolRegistry.executeTool(
    'inspect_narcotics_chain_of_custody',
    { limit: 10 },
    ctx('AUDITOR'),
  );
  await defaultToolRegistry.executeTool(
    'verify_tamper_evidence',
    { windowSize: 20 },
    ctx('AUDITOR'),
  );

  // Assert counts strictly identical
  assert.equal(await countRows('agent_run'), snapRun);
  assert.equal(await countRows('agent_tool_call'), snapToolCall);
  assert.equal(await countRows('audit_log'), snapAudit);
  assert.equal(await countRows('transport_task'), snapTask);
  assert.equal(await countRows('transport_event'), snapEvent);
  assert.equal(await countRows('transport_photo'), snapPhoto);
});
