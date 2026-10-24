import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolRegistry } from '../../src/modules/ai/tools/index.js';
import { query, pool } from '../../src/db/client.js';
import {
  ctx,
  getActiveHospitalIds,
  assertPermissionDenied,
  assertFailed,
  assertNoSecrets,
  countRows,
  WHITELIST,
} from './helpers.js';
import {
  getHospitalKpiDashboardTool,
  getWaiverImpactAnalysisTool,
  auditHospitalAnomaliesTool,
  submitHospitalAdminProposalTool,
} from '../../src/modules/ai/tools/governance/hospitalAdmin.tools.js';
import {
  WAIVER_HIGH_VALUE_THRESHOLD_THB,
  WAIVER_MEDIUM_VALUE_THRESHOLD_THB,
  buildEndpoint,
} from '../../src/modules/ai/tools/governance/governance.utils.js';

test('hospitalAdmin.tools: Schema and allowedRoles validation', () => {
  const tools = [
    getHospitalKpiDashboardTool,
    getWaiverImpactAnalysisTool,
    auditHospitalAnomaliesTool,
    submitHospitalAdminProposalTool,
  ];

  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `Tool ${tool.name} description must not be empty`);
    assert.deepEqual(
      tool.allowedRoles,
      ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
      `Tool ${tool.name} allowedRoles must match ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN']`,
    );
  }

  // Schema argument rejections
  assert.equal(
    getWaiverImpactAnalysisTool.parameters.safeParse({ obligationId: 'not-a-uuid' }).success,
    false,
    'get_waiver_impact_analysis should reject non-uuid obligationId',
  );

  assert.equal(
    auditHospitalAnomaliesTool.parameters.safeParse({ lookbackDays: 0 }).success,
    false,
    'audit_hospital_anomalies should reject lookbackDays < 1',
  );

  assert.equal(
    auditHospitalAnomaliesTool.parameters.safeParse({ lookbackDays: 366 }).success,
    false,
    'audit_hospital_anomalies should reject lookbackDays > 365',
  );

  assert.equal(
    submitHospitalAdminProposalTool.parameters.safeParse({
      action: 'WAIVE_RETURN_OBLIGATION',
      obligationId: '00000000-0000-0000-0000-000000000001',
      reason: 'short',
    }).success,
    false,
    'submit_hospital_admin_proposal should reject reason shorter than 10 characters',
  );
});

test('hospitalAdmin.tools: Tenant isolation via executeTool', async (t) => {
  const hospitals = await getActiveHospitalIds(2);
  if (hospitals.length < 2) {
    t.skip('Need at least 2 active hospitals to test cross-tenant isolation');
    return;
  }
  const [hospA, hospB] = hospitals;

  // 1. HOSPITAL_ADMIN with hospitalId A requesting hospitalId B is denied
  const crossTenantResult = await defaultToolRegistry.executeTool(
    'get_hospital_kpi_dashboard',
    { hospitalId: hospB },
    ctx('HOSPITAL_ADMIN', { hospitalId: hospA }),
  );
  assertFailed(crossTenantResult, /Permission denied: Cannot access hospital outside your authorized scope/i);

  // 2. HOSPITAL_ADMIN with no context hospitalId fails clearly
  const noCtxResult = await defaultToolRegistry.executeTool(
    'get_hospital_kpi_dashboard',
    {},
    ctx('HOSPITAL_ADMIN', {}),
  );
  assertFailed(noCtxResult, /Context hospitalId is required for hospital-scoped operations/i);

  // 3. SYSTEM_ADMIN with no context and no arg fails clearly
  const sysNoArgResult = await defaultToolRegistry.executeTool(
    'get_hospital_kpi_dashboard',
    {},
    ctx('SYSTEM_ADMIN', {}),
  );
  assertFailed(sysNoArgResult, /Hospital ID is required/i);

  // 4. SYSTEM_ADMIN with hospitalId arg succeeds
  const sysArgResult = await defaultToolRegistry.executeTool(
    'get_hospital_kpi_dashboard',
    { hospitalId: hospA },
    ctx('SYSTEM_ADMIN', {}),
  );
  assert.equal(sysArgResult.success, true);
  assertNoSecrets(sysArgResult);
});

test('hospitalAdmin.tools: KPI cross-check against independent SQL', async () => {
  const hospitals = await getActiveHospitalIds(5);

  let exercisedZeroTotal = false;
  let exercisedPositiveTotal = false;

  for (const hospitalId of hospitals) {
    const res = await defaultToolRegistry.executeTool(
      'get_hospital_kpi_dashboard',
      { hospitalId },
      ctx('SYSTEM_ADMIN', {}),
    );
    assert.equal(res.success, true);
    const data = res.data as any;

    // Independent SQL: active stockouts
    const stockoutSql = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM stock_alert WHERE hospital_id = $1 AND status IN ('OPEN', 'ACKNOWLEDGED', 'LINKED_TO_REQUEST', 'SNOOZED')`,
      [hospitalId],
    );
    assert.equal(data.activeStockouts, stockoutSql.rows[0].c);

    // Independent SQL: active borrow requests
    const borrowSql = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM borrow_request WHERE borrower_hospital_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED')`,
      [hospitalId],
    );
    assert.equal(data.activeBorrowRequests, borrowSql.rows[0].c);

    // Independent SQL: pending return obligations
    const returnSql = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM return_obligation WHERE debtor_hospital_id = $1 AND status IN ('OPEN', 'REMINDED', 'OVERDUE')`,
      [hospitalId],
    );
    assert.equal(data.pendingReturnObligations, returnSql.rows[0].c);

    // Independent SQL: expiring inventory value
    const expirySql = await query<{ total_value: number }>(
      `SELECT COALESCE(SUM(value_thb), 0)::numeric(14,2) AS total_value FROM near_expiry_item WHERE hospital_id = $1 AND status IN ('DETECTED', 'RELEASED_TO_POOL')`,
      [hospitalId],
    );
    assert.equal(data.expiringInventoryValueThb, Number(expirySql.rows[0].total_value));

    // Independent SQL: fulfillment 30d
    const f30Sql = await query<{ total: number; fulfilled: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'FULFILLED')::int AS fulfilled FROM borrow_request WHERE borrower_hospital_id = $1 AND status <> 'DRAFT' AND created_at >= NOW() - INTERVAL '30 days'`,
      [hospitalId],
    );
    const total = f30Sql.rows[0].total;
    const fulfilled = f30Sql.rows[0].fulfilled;

    assert.equal(data.fulfillment30d.totalRequests, total);
    assert.equal(data.fulfillment30d.fulfilledRequests, fulfilled);

    // Assert divide-by-zero behavior
    if (total === 0) {
      exercisedZeroTotal = true;
      assert.equal(data.fulfillment30d.fulfillmentRate, null);
      assert.equal(data.fulfillment30d.hasData, false);
      assert.equal(data.fulfillment30d.ratePercentage, 0);
    } else {
      exercisedPositiveTotal = true;
      assert.equal(data.fulfillment30d.hasData, true);
      const expectedRate = Number((fulfilled / total).toFixed(4));
      assert.equal(data.fulfillment30d.fulfillmentRate, expectedRate);
      assert.equal(data.fulfillment30d.ratePercentage, Number(((fulfilled / total) * 100).toFixed(1)));
    }

    assertNoSecrets(res);
  }

  // Ensure test covers fulfillment math branches
  assert.ok(
    exercisedZeroTotal || exercisedPositiveTotal,
    'Fulfillment calculation was evaluated for active hospitals',
  );
});

test('hospitalAdmin.tools: Waiver impact analysis', async (t) => {
  // 1. Pick an open/overdue obligation
  const openRes = await query<{
    id: string;
    debtor_hospital_id: string;
    creditor_hospital_id: string;
    qty: string;
    qty_returned: string;
    status: string;
    unit_price_thb: string | null;
    is_controlled: boolean | null;
  }>(
    `SELECT ro.id, ro.debtor_hospital_id, ro.creditor_hospital_id, ro.qty::text, ro.qty_returned::text, ro.status::text,
            hd.unit_price_thb::text AS unit_price_thb, COALESCE(dm.is_controlled, false) AS is_controlled
       FROM return_obligation ro
       LEFT JOIN drug_master dm ON dm.id = ro.drug_master_id
       LEFT JOIN hospital_drug hd ON hd.drug_master_id = dm.id AND hd.hospital_id = ro.creditor_hospital_id
      WHERE ro.status IN ('OPEN', 'OVERDUE')
      LIMIT 1`,
  );

  if (openRes.rows.length === 0) {
    t.skip('No OPEN or OVERDUE return_obligation found in seed database');
    return;
  }

  const ob = openRes.rows[0];
  const callerContext = ctx('HOSPITAL_ADMIN', { hospitalId: ob.debtor_hospital_id });

  const res = await defaultToolRegistry.executeTool(
    'get_waiver_impact_analysis',
    { obligationId: ob.id },
    callerContext,
  );
  assert.equal(res.success, true);
  const data = res.data as any;

  // Outstanding math
  const expectedOutstanding = Number(ob.qty) - Number(ob.qty_returned);
  assert.equal(data.outstandingQty, expectedOutstanding);

  // Estimated loss computation
  const unitPrice = ob.unit_price_thb ? Number(ob.unit_price_thb) : 0;
  const expectedLoss = Math.round(expectedOutstanding * unitPrice * 100) / 100;
  assert.equal(data.estimatedLossThb, expectedLoss);

  // Severity checks
  if (ob.is_controlled || expectedLoss >= WAIVER_HIGH_VALUE_THRESHOLD_THB) {
    assert.equal(data.severity, 'HIGH');
  } else if (expectedLoss >= WAIVER_MEDIUM_VALUE_THRESHOLD_THB) {
    assert.equal(data.severity, 'MEDIUM');
  } else {
    assert.equal(data.severity, 'LOW');
  }

  // 2. Non-participant HOSPITAL_ADMIN denied
  const otherHospitals = await query<{ id: string }>(
    `SELECT id FROM hospital WHERE id NOT IN ($1, $2) AND active = true LIMIT 1`,
    [ob.debtor_hospital_id, ob.creditor_hospital_id],
  );
  if (otherHospitals.rows.length > 0) {
    const nonParticipantResult = await defaultToolRegistry.executeTool(
      'get_waiver_impact_analysis',
      { obligationId: ob.id },
      ctx('HOSPITAL_ADMIN', { hospitalId: otherHospitals.rows[0].id }),
    );
    assertFailed(nonParticipantResult, /Permission denied: Caller hospital is neither debtor nor creditor/i);
  }

  // 3. Unknown obligation UUID fails
  const unknownResult = await defaultToolRegistry.executeTool(
    'get_waiver_impact_analysis',
    { obligationId: '00000000-0000-0000-0000-000000000000' },
    callerContext,
  );
  assertFailed(unknownResult, /not found/i);

  // 4. Closed obligation check (RETURNED or WAIVED)
  const closedRes = await query<{ id: string; debtor_hospital_id: string }>(
    `SELECT id, debtor_hospital_id FROM return_obligation WHERE status IN ('RETURNED', 'WAIVED') LIMIT 1`,
  );
  if (closedRes.rows.length > 0) {
    const closedOb = closedRes.rows[0];
    const closedResult = await defaultToolRegistry.executeTool(
      'get_waiver_impact_analysis',
      { obligationId: closedOb.id },
      ctx('HOSPITAL_ADMIN', { hospitalId: closedOb.debtor_hospital_id }),
    );
    assert.equal(closedResult.success, true);
    assert.equal((closedResult.data as any).alreadyClosed, true);
  }

  assertNoSecrets(res);
});

test('hospitalAdmin.tools: Anomaly detection result shape and thresholds', async () => {
  const hospitals = await getActiveHospitalIds(1);
  const hospitalId = hospitals[0];

  const res = await defaultToolRegistry.executeTool(
    'audit_hospital_anomalies',
    { hospitalId, lookbackDays: 30 },
    ctx('SYSTEM_ADMIN', {}),
  );

  assert.equal(res.success, true);
  const data = res.data as any;

  assert.ok(typeof data.healthy === 'boolean');
  assert.ok(Array.isArray(data.anomalies));
  assert.ok(data.assumptions != null);

  const validCodes = new Set([
    'HIGH_STOCKOUT_RATE',
    'UNUSUAL_WAIVER_VOLUME',
    'FREQUENT_EMERGENCY_ESCALATION',
    'PROLONGED_TRANSPORT_DELAY',
  ]);

  if (data.anomalies.length === 0) {
    assert.equal(data.healthy, true, 'healthy must be true when 0 anomalies detected');
  } else {
    assert.equal(data.healthy, false, 'healthy must be false when anomalies exist');
    for (const anom of data.anomalies) {
      assert.ok(validCodes.has(anom.code), `Anomaly code ${anom.code} must be a recognized code`);
      assert.ok(
        ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(anom.severity),
        `Severity ${anom.severity} must be valid`,
      );
      assert.ok(
        anom.observed >= anom.threshold,
        `Observed value (${anom.observed}) must be >= threshold (${anom.threshold})`,
      );
      assert.ok(anom.detail.length > 0);
    }
  }

  assertNoSecrets(res);
});

test('hospitalAdmin.tools: Proposals structure and no-mutation verification', async (t) => {
  // Snapshot database rows before executing proposals
  const snapReturn = await countRows('return_obligation');
  const snapBorrow = await countRows('borrow_request');
  const snapIncident = await countRows('incident');
  const snapPlan = await countRows('emergency_plan');
  const snapWaived = await countRows('return_obligation', "status = 'WAIVED'");

  // Action 1: WAIVE_RETURN_OBLIGATION
  const obRes = await query<{ id: string; debtor_hospital_id: string }>(
    `SELECT id, debtor_hospital_id FROM return_obligation WHERE status IN ('OPEN', 'OVERDUE') LIMIT 1`,
  );
  if (obRes.rows.length > 0) {
    const ob = obRes.rows[0];
    const res = await defaultToolRegistry.executeTool(
      'submit_hospital_admin_proposal',
      {
        action: 'WAIVE_RETURN_OBLIGATION',
        obligationId: ob.id,
        reason: 'Authorized inter-hospital settlement waiver justification.',
      },
      ctx('HOSPITAL_ADMIN', { hospitalId: ob.debtor_hospital_id }),
    );

    assert.equal(res.success, true);
    assert.equal((res.data as any).requiresHumanApproval, true);

    const whitelistDef = WHITELIST.HOSPITAL_ADMIN.WAIVE_RETURN_OBLIGATION;
    const expectedEndpoint = buildEndpoint(whitelistDef.endpointTemplate, { id: ob.id });

    assert.equal(res.proposal?.actionApi?.method, whitelistDef.method);
    assert.equal(res.proposal?.actionApi?.endpoint, expectedEndpoint);
    assert.deepEqual(Object.keys(res.proposal?.actionApi?.payload || {}), ['reason']);
    assertNoSecrets(res);
  } else {
    t.skip('No open return_obligation for WAIVE_RETURN_OBLIGATION test');
  }

  // Action 2: APPROVE_INCIDENT_PLAN failure paths
  // Path 2a: Unknown incident UUID fails with clear error
  const resUnknownInc = await defaultToolRegistry.executeTool(
    'submit_hospital_admin_proposal',
    {
      action: 'APPROVE_INCIDENT_PLAN',
      incidentId: '00000000-0000-0000-0000-000000000000',
    },
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resUnknownInc.success, false);
  assert.match(resUnknownInc.error ?? '', /Incident '00000000-0000-0000-0000-000000000000' not found/i);

  // Path 2b: Incident exists in DB but has no plan in READY_FOR_APPROVAL (e.g. all 64 seed plans are APPROVED)
  const existingIncRes = await query<{ id: string; hospital_id: string }>(
    `SELECT id, hospital_id FROM incident LIMIT 1`,
  );
  if (existingIncRes.rows.length > 0) {
    const inc = existingIncRes.rows[0];
    const resNoReadyPlan = await defaultToolRegistry.executeTool(
      'submit_hospital_admin_proposal',
      {
        action: 'APPROVE_INCIDENT_PLAN',
        incidentId: inc.id,
        note: 'Attempt approval with no plan ready',
      },
      ctx('HOSPITAL_ADMIN', { hospitalId: inc.hospital_id }),
    );
    assert.equal(resNoReadyPlan.success, false);
    assert.match(
      resNoReadyPlan.error ?? '',
      /No emergency plan with status 'READY_FOR_APPROVAL' found for incident/i,
    );
  }

  // Action 3: ESCALATE_BORROW_MANUAL
  const brRes = await query<{ id: string; hospital_id: string }>(
    `SELECT id, borrower_hospital_id AS hospital_id FROM borrow_request LIMIT 1`,
  );
  if (brRes.rows.length > 0) {
    const br = brRes.rows[0];
    const res = await defaultToolRegistry.executeTool(
      'submit_hospital_admin_proposal',
      {
        action: 'ESCALATE_BORROW_MANUAL',
        borrowRequestId: br.id,
        reason: 'Immediate regional committee escalation required due to rare antidote critical need.',
      },
      ctx('HOSPITAL_ADMIN', { hospitalId: br.hospital_id }),
    );

    assert.equal(res.success, true);
    assert.equal((res.data as any).requiresHumanApproval, true);

    const whitelistDef = WHITELIST.HOSPITAL_ADMIN.ESCALATE_BORROW_MANUAL;
    const expectedEndpoint = buildEndpoint(whitelistDef.endpointTemplate, { id: br.id });

    assert.equal(res.proposal?.actionApi?.method, whitelistDef.method);
    assert.equal(res.proposal?.actionApi?.endpoint, expectedEndpoint);
    assert.deepEqual(Object.keys(res.proposal?.actionApi?.payload || {}), ['reason']);
    assertNoSecrets(res);
  } else {
    t.skip('No active borrow_request for ESCALATE_BORROW_MANUAL test');
  }

  // NO-MUTATION PROOF: row counts must remain identical
  assert.equal(await countRows('return_obligation'), snapReturn, 'return_obligation count must not change');
  assert.equal(await countRows('borrow_request'), snapBorrow, 'borrow_request count must not change');
  assert.equal(await countRows('incident'), snapIncident, 'incident count must not change');
  assert.equal(await countRows('emergency_plan'), snapPlan, 'emergency_plan count must not change');
  assert.equal(
    await countRows('return_obligation', "status = 'WAIVED'"),
    snapWaived,
    'Waived return_obligation count must not change',
  );
});

test('hospitalAdmin.tools: APPROVE_INCIDENT_PLAN proposal success-path', async (t) => {
  const readyPlanRes = await query<{ incident_id: string; hospital_id: string; plan_id: string }>(
    `SELECT ep.incident_id, i.hospital_id, ep.id AS plan_id
       FROM emergency_plan ep
       JOIN incident i ON i.id = ep.incident_id
      WHERE ep.status = 'READY_FOR_APPROVAL'
      LIMIT 1`,
  );

  if (readyPlanRes.rows.length === 0) {
    const epCountRes = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM emergency_plan WHERE status = 'READY_FOR_APPROVAL'`,
    );
    t.skip(
      `Seed database has 0 emergency plans with status READY_FOR_APPROVAL (found: ${epCountRes.rows[0].c})`,
    );
    return;
  }

  const rPlan = readyPlanRes.rows[0];
  const snapIncident = await countRows('incident');
  const snapPlan = await countRows('emergency_plan');

  const resApprove = await defaultToolRegistry.executeTool(
    'submit_hospital_admin_proposal',
    {
      action: 'APPROVE_INCIDENT_PLAN',
      incidentId: rPlan.incident_id,
      note: 'Executive approval following emergency committee review.',
    },
    ctx('HOSPITAL_ADMIN', { hospitalId: rPlan.hospital_id }),
  );

  assert.equal(resApprove.success, true);
  assert.equal((resApprove.data as any).requiresHumanApproval, true);

  const whitelistDef = WHITELIST.HOSPITAL_ADMIN.APPROVE_INCIDENT_PLAN;
  const expectedEndpoint = buildEndpoint(whitelistDef.endpointTemplate, { id: rPlan.incident_id });
  assert.equal(resApprove.proposal?.actionApi?.method, 'POST');
  assert.equal(resApprove.proposal?.actionApi?.endpoint, expectedEndpoint);
  assert.deepEqual(
    Object.keys(resApprove.proposal?.actionApi?.payload || {}).sort(),
    ['note', 'planId'].sort(),
  );
  assert.equal((resApprove.proposal?.actionApi?.payload as any).planId, rPlan.plan_id);
  assert.equal(
    (resApprove.proposal?.actionApi?.payload as any).note,
    'Executive approval following emergency committee review.',
  );

  // Without note
  const resNoNote = await defaultToolRegistry.executeTool(
    'submit_hospital_admin_proposal',
    {
      action: 'APPROVE_INCIDENT_PLAN',
      incidentId: rPlan.incident_id,
    },
    ctx('HOSPITAL_ADMIN', { hospitalId: rPlan.hospital_id }),
  );
  assert.equal(resNoNote.success, true);
  assert.deepEqual(Object.keys(resNoNote.proposal?.actionApi?.payload || {}), ['planId']);

  // No-mutation proof
  assert.equal(await countRows('incident'), snapIncident, 'incident count must not change');
  assert.equal(await countRows('emergency_plan'), snapPlan, 'emergency_plan count must not change');
});

test.after(async () => {
  await pool.end();
});

