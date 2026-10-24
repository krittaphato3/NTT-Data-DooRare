import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultToolRegistry } from '../../src/modules/ai/tools/index.js';
import { query, pool } from '../../src/db/client.js';
import { byokService } from '../../src/modules/ai/byok/byok.service.js';
import {
  ctx,
  assertPermissionDenied,
  assertFailed,
  assertNoSecrets,
  countRows,
  WHITELIST,
} from './helpers.js';
import {
  getLlmHealthMetricsTool,
  testLlmConnectivityTool,
  verifyAuditChainIntegrityTool,
  getSystemConfigurationStatusTool,
  submitSystemAdminProposalTool,
} from '../../src/modules/ai/tools/governance/systemAdmin.tools.js';
import { buildEndpoint } from '../../src/modules/ai/tools/governance/governance.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('systemAdmin.tools: Schema and allowedRoles validation', () => {
  const systemAdminOnlyTools = [
    getLlmHealthMetricsTool,
    testLlmConnectivityTool,
    getSystemConfigurationStatusTool,
    submitSystemAdminProposalTool,
  ];

  for (const tool of systemAdminOnlyTools) {
    assert.ok(tool.description.length > 0, `Tool ${tool.name} description must not be empty`);
    assert.deepEqual(
      tool.allowedRoles,
      ['SYSTEM_ADMIN'],
      `Tool ${tool.name} allowedRoles must be ['SYSTEM_ADMIN']`,
    );
  }

  // verify_audit_chain_integrity allows both SYSTEM_ADMIN and AUDITOR
  assert.deepEqual(
    verifyAuditChainIntegrityTool.allowedRoles,
    ['SYSTEM_ADMIN', 'AUDITOR'],
    'verify_audit_chain_integrity allowedRoles must be SYSTEM_ADMIN and AUDITOR',
  );

  // Parameter schema validation
  assert.equal(
    getSystemConfigurationStatusTool.parameters.safeParse({ limit: 0 }).success,
    false,
    'get_system_configuration_status should reject limit < 1',
  );
  assert.equal(
    getSystemConfigurationStatusTool.parameters.safeParse({ limit: 101 }).success,
    false,
    'get_system_configuration_status should reject limit > 100',
  );

  // submit_system_admin_proposal parameters
  assert.equal(
    submitSystemAdminProposalTool.parameters.safeParse({
      action: 'TOGGLE_KILL_SWITCH',
      enabled: 'not-a-boolean',
      reason: 'Valid reason here for test',
    }).success,
    false,
    'submit_system_admin_proposal should reject non-boolean enabled',
  );
  assert.equal(
    submitSystemAdminProposalTool.parameters.safeParse({
      action: 'UPDATE_AI_CONFIG',
      provider: 'INVALID_PROVIDER',
      reason: 'Valid reason here for test',
    }).success,
    false,
    'submit_system_admin_proposal should reject invalid AI provider',
  );
});

test('systemAdmin.tools: get_llm_health_metrics output invariants and mocking', async () => {
  // 1. Live call invariants
  const resLive = await defaultToolRegistry.executeTool(
    'get_llm_health_metrics',
    {},
    ctx('SYSTEM_ADMIN'),
  );

  assert.equal(resLive.success, true);
  const dataLive = resLive.data as any;

  // Exact set of expected keys
  const expectedKeys = [
    'provider',
    'modelPrimary',
    'modelFast',
    'monthlyBudgetUsd',
    'estimatedSpendUsd',
    'budgetUsedPercent',
    'streamingEnabled',
    'agentEnabled',
    'status',
  ];
  for (const k of expectedKeys) {
    assert.ok(k in dataLive, `get_llm_health_metrics output missing key: ${k}`);
  }

  // Deep check: no credential or secret keys anywhere
  assert.equal('credentials' in dataLive, false, 'credentials must not be in data');
  assert.equal('apiKey' in dataLive, false, 'apiKey must not be in data');
  assertNoSecrets(resLive);

  // Non-SYSTEM_ADMIN denied
  const resDenied = await defaultToolRegistry.executeTool(
    'get_llm_health_metrics',
    {},
    ctx('HOSPITAL_ADMIN'),
  );
  assertPermissionDenied(resDenied);

  // 2. Mocking scenarios for byokService.getConfig()
  const origGetConfig = byokService.getConfig.bind(byokService);

  try {
    // Scenario A: HEALTHY (budget 100, spend 25)
    byokService.getConfig = async () => ({
      provider: 'MOCK',
      modelPrimary: 'mock-primary',
      modelFast: 'mock-fast',
      monthlyBudgetUsd: 100,
      estimatedSpendUsd: 25,
      streamingEnabled: true,
      credentials: { apiKey: 'sk-antigravity-fake-secret-987654321' } as any,
      agentEnabled: true,
      updatedAt: new Date().toISOString(),
    });

    const resHealthy = await defaultToolRegistry.executeTool(
      'get_llm_health_metrics',
      {},
      ctx('SYSTEM_ADMIN'),
    );
    assert.equal(resHealthy.success, true);
    assert.equal((resHealthy.data as any).status, 'HEALTHY');
    assert.equal((resHealthy.data as any).budgetUsedPercent, 25);
    assertNoSecrets(resHealthy);

    // Scenario B: BUDGET_WARNING (spend >= budget)
    byokService.getConfig = async () => ({
      provider: 'OPENAI',
      modelPrimary: 'gpt-4o',
      modelFast: 'gpt-4o-mini',
      monthlyBudgetUsd: 100,
      estimatedSpendUsd: 105,
      streamingEnabled: true,
      credentials: { apiKey: 'sk-antigravity-fake-secret-987654321' } as any,
      agentEnabled: true,
    });

    const resBudgetWarning = await defaultToolRegistry.executeTool(
      'get_llm_health_metrics',
      {},
      ctx('SYSTEM_ADMIN'),
    );
    assert.equal(resBudgetWarning.success, true);
    assert.equal((resBudgetWarning.data as any).status, 'BUDGET_WARNING');
    assert.equal((resBudgetWarning.data as any).budgetUsedPercent, 105);
    assertNoSecrets(resBudgetWarning);

    // Scenario C: DISABLED (kill switch active)
    byokService.getConfig = async () => ({
      provider: 'MOCK',
      modelPrimary: 'mock-primary',
      modelFast: 'mock-fast',
      monthlyBudgetUsd: 100,
      estimatedSpendUsd: 0,
      streamingEnabled: false,
      credentials: {} as any,
      agentEnabled: false,
    });

    const resDisabled = await defaultToolRegistry.executeTool(
      'get_llm_health_metrics',
      {},
      ctx('SYSTEM_ADMIN'),
    );
    assert.equal(resDisabled.success, true);
    assert.equal((resDisabled.data as any).status, 'DISABLED');
    assertNoSecrets(resDisabled);

    // Scenario D: Zero budget
    byokService.getConfig = async () => ({
      provider: 'MOCK',
      modelPrimary: 'mock-primary',
      modelFast: 'mock-fast',
      monthlyBudgetUsd: 0,
      estimatedSpendUsd: 50,
      streamingEnabled: true,
      credentials: {} as any,
      agentEnabled: true,
    });

    const resZeroBudget = await defaultToolRegistry.executeTool(
      'get_llm_health_metrics',
      {},
      ctx('SYSTEM_ADMIN'),
    );
    assert.equal(resZeroBudget.success, true);
    assert.equal((resZeroBudget.data as any).status, 'HEALTHY');
    assert.equal((resZeroBudget.data as any).budgetUsedPercent, null);
    assertNoSecrets(resZeroBudget);
  } finally {
    byokService.getConfig = origGetConfig;
  }
});

test('systemAdmin.tools: test_llm_connectivity execution, mocking, and secret redaction', async () => {
  // 1. Live roundtrip connectivity (provider is MOCK in test environment)
  const resLive = await defaultToolRegistry.executeTool(
    'test_llm_connectivity',
    {},
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resLive.success, true);
  assert.equal(typeof (resLive.data as any).latencyMs, 'number');
  assertNoSecrets(resLive);

  // Role isolation
  const resDenied = await defaultToolRegistry.executeTool(
    'test_llm_connectivity',
    {},
    ctx('REGION_ADMIN'),
  );
  assertPermissionDenied(resDenied);

  // 2. Mocking byokService.testConnection
  const origTestConnection = byokService.testConnection.bind(byokService);

  try {
    let capturedReq: any = null;
    byokService.testConnection = async (req: any) => {
      capturedReq = req;
      return {
        ok: true,
        success: true,
        provider: 'MOCK',
        modelId: 'mock-model-test',
        latencyMs: 42,
        message: 'Connection successful',
      };
    };

    const resMock = await defaultToolRegistry.executeTool(
      'test_llm_connectivity',
      { unexpectedExtraParam: 'should-be-ignored' } as any,
      ctx('SYSTEM_ADMIN'),
    );

    assert.equal(resMock.success, true);
    assert.equal((resMock.data as any).latencyMs, 42);
    assert.equal(capturedReq?.user?.role, 'SYSTEM_ADMIN');
    assert.deepEqual(capturedReq?.body, {});

    // 3. Error redaction: ensure sk-*, Bearer, AKIA* are redacted on failure
    byokService.testConnection = async () => {
      throw new Error(
        'Upstream failure: Bearer sk-antigravity-test-token-12345678 failed authentication with AKIAIOSFODNN7EXAMPLE key',
      );
    };

    const resError = await defaultToolRegistry.executeTool(
      'test_llm_connectivity',
      {},
      ctx('SYSTEM_ADMIN'),
    );

    assert.equal(resError.success, false);
    assert.ok(resError.error, 'Error message must be present');
    assert.equal(
      resError.error?.includes('sk-antigravity-test-token-12345678'),
      false,
      'Raw sk- token must be redacted',
    );
    assert.equal(
      resError.error?.includes('AKIAIOSFODNN7EXAMPLE'),
      false,
      'Raw AWS access key must be redacted',
    );
    assertNoSecrets(resError);
  } finally {
    byokService.testConnection = origTestConnection;
  }
});

test('systemAdmin.tools: verify_audit_chain_integrity behavior and role access', async () => {
  // Allowed: SYSTEM_ADMIN
  const resSys = await defaultToolRegistry.executeTool(
    'verify_audit_chain_integrity',
    {},
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resSys.success, true);
  const dataSys = resSys.data as any;
  assert.equal(typeof dataSys.intact, 'boolean');
  assert.equal(typeof dataSys.problems, 'number');
  assert.equal(dataSys.intact, dataSys.problems === 0);
  assert.ok(dataSys.checkedAt);
  assert.ok(dataSys.note);

  // Allowed: AUDITOR
  const resAuditor = await defaultToolRegistry.executeTool(
    'verify_audit_chain_integrity',
    {},
    ctx('AUDITOR'),
  );
  assert.equal(resAuditor.success, true);

  // Denied: PHARMACIST, DRIVER, HOSPITAL_ADMIN
  assertPermissionDenied(
    await defaultToolRegistry.executeTool('verify_audit_chain_integrity', {}, ctx('PHARMACIST')),
  );
  assertPermissionDenied(
    await defaultToolRegistry.executeTool('verify_audit_chain_integrity', {}, ctx('DRIVER')),
  );
  assertPermissionDenied(
    await defaultToolRegistry.executeTool('verify_audit_chain_integrity', {}, ctx('HOSPITAL_ADMIN')),
  );
});

test('systemAdmin.tools: get_system_configuration_status redaction and DB cross-check', async () => {
  const res = await defaultToolRegistry.executeTool(
    'get_system_configuration_status',
    { limit: 10 },
    ctx('SYSTEM_ADMIN'),
  );

  assert.equal(res.success, true);
  const data = res.data as any;

  // Invariants
  assert.ok(data.settings.length <= 10, 'Returned settings length must be <= limit');
  assert.equal(data.returnedConfigCount, data.settings.length);

  // Sensitive key redaction
  const sensitiveRegex = /secret|key|token|password|credential/i;
  for (const s of data.settings) {
    assert.equal(
      sensitiveRegex.test(s.key),
      false,
      `Setting '${s.key}' matches sensitive regex and should have been hidden`,
    );
  }

  // Cross-check active hospital count with DB
  const hospRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM hospital WHERE active = true`,
  );
  assert.equal(data.activeHospitalCount, parseInt(hospRes.rows[0].count, 10));

  // Cross-check total config count with DB
  const cfgRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM config_setting WHERE scope = 'GLOBAL'`,
  );
  assert.equal(data.totalConfigKeys, parseInt(cfgRes.rows[0].count, 10));

  assertNoSecrets(res);
});

test('systemAdmin.tools: Proposals structure and no-mutation verification', async () => {
  const snapConfig = await countRows('config_setting');
  const snapAudit = await countRows('audit_log');

  // Proposal 1: TOGGLE_KILL_SWITCH
  const resKill = await defaultToolRegistry.executeTool(
    'submit_system_admin_proposal',
    {
      action: 'TOGGLE_KILL_SWITCH',
      enabled: false,
      reason: 'Automated drill: Testing emergency kill switch procedure for central AI.',
    },
    ctx('SYSTEM_ADMIN'),
  );

  assert.equal(resKill.success, true);
  assert.equal((resKill.data as any).requiresHumanApproval, true);

  const whitelistKill = WHITELIST.SYSTEM_ADMIN.TOGGLE_KILL_SWITCH;
  assert.equal(resKill.proposal?.actionApi?.method, whitelistKill.method);
  assert.equal(resKill.proposal?.actionApi?.endpoint, whitelistKill.endpointTemplate);
  assert.deepEqual(resKill.proposal?.actionApi?.payload, {
    enabled: false,
    reason: 'Automated drill: Testing emergency kill switch procedure for central AI.',
  });

  // Proposal 2: UPDATE_AI_CONFIG
  // Secret injection attempt must be blocked
  const resSecretAttempt = await submitSystemAdminProposalTool.execute(
    {
      action: 'UPDATE_AI_CONFIG',
      apiKey: 'sk-antigravity-forbidden-credential',
      reason: 'Attempting to submit API key via proposal',
    } as any,
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resSecretAttempt.success, false);
  assert.match(resSecretAttempt.error ?? '', /Security violation/i);

  // Valid non-secret AI config proposal
  const resAiConfig = await defaultToolRegistry.executeTool(
    'submit_system_admin_proposal',
    {
      action: 'UPDATE_AI_CONFIG',
      provider: 'OPENAI',
      modelPrimary: 'gpt-4o',
      modelFast: 'gpt-4o-mini',
      monthlyBudgetUsd: 500,
      streamingEnabled: true,
      reason: 'Executive expansion of Central AI monthly budget and primary model tier.',
    },
    ctx('SYSTEM_ADMIN'),
  );

  assert.equal(resAiConfig.success, true);
  assert.equal((resAiConfig.data as any).requiresHumanApproval, true);

  const whitelistAi = WHITELIST.SYSTEM_ADMIN.UPDATE_AI_CONFIG;
  assert.equal(resAiConfig.proposal?.actionApi?.method, whitelistAi.method);
  assert.equal(resAiConfig.proposal?.actionApi?.endpoint, whitelistAi.endpointTemplate);
  assert.equal((resAiConfig.proposal?.actionApi?.payload as any)?.monthlyBudgetUsd, 500);
  assertNoSecrets(resAiConfig);

  // Proposal 3: UPDATE_SYSTEM_CONFIG
  // Sensitive key update attempt must be blocked
  const resSensitiveKeyAttempt = await defaultToolRegistry.executeTool(
    'submit_system_admin_proposal',
    {
      action: 'UPDATE_SYSTEM_CONFIG',
      key: 'auth.jwt.secret_token',
      value: 'new-secret',
      reason: 'Attempting to propose secret configuration update',
    },
    ctx('SYSTEM_ADMIN'),
  );
  assert.equal(resSensitiveKeyAttempt.success, false);
  assert.match(resSensitiveKeyAttempt.error ?? '', /Security violation/i);

  // Valid non-sensitive configuration proposal
  const resSysConfig = await defaultToolRegistry.executeTool(
    'submit_system_admin_proposal',
    {
      action: 'UPDATE_SYSTEM_CONFIG',
      key: 'system.maintenance_notice',
      value: { message: 'Planned database indexing window at 03:00 GMT+7', active: true },
      reason: 'Announcing scheduled maintenance window across all regional dashboards.',
    },
    ctx('SYSTEM_ADMIN'),
  );

  assert.equal(resSysConfig.success, true);
  assert.equal((resSysConfig.data as any).requiresHumanApproval, true);

  const whitelistSys = WHITELIST.SYSTEM_ADMIN.UPDATE_SYSTEM_CONFIG;
  const expectedEndpoint = buildEndpoint(whitelistSys.endpointTemplate, {
    key: 'system.maintenance_notice',
  });
  assert.equal(resSysConfig.proposal?.actionApi?.method, whitelistSys.method);
  assert.equal(resSysConfig.proposal?.actionApi?.endpoint, expectedEndpoint);

  // NO-MUTATION PROOF: Row counts must remain strictly identical
  assert.equal(await countRows('config_setting'), snapConfig, 'config_setting count must not change');
  assert.equal(await countRows('audit_log'), snapAudit, 'audit_log count must not change');
});

test('systemAdmin.tools: Source-guard regression test (no getRawConfig, no SQL mutations)', () => {
  const governanceDir = path.resolve(__dirname, '../../src/modules/ai/tools/governance');
  const files = fs.readdirSync(governanceDir).filter((f) => f.endsWith('.ts'));

  assert.ok(files.length >= 6, 'Must check all governance files');

  for (const file of files) {
    const fullPath = path.join(governanceDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Rule: Never call getRawConfig() in governance tools
    assert.equal(
      content.includes('getRawConfig'),
      false,
      `File ${file} must not reference getRawConfig`,
    );

    // Rule: Principle AGT-GEN-001 - tools are read-only or calculation-only. NO direct INSERT/UPDATE/DELETE.
    // Check inside query<...>(`...`) calls:
    const queryCalls = content.match(/query<[^>]*>\s*\(\s*`([^`]+)`/g) || [];
    for (const call of queryCalls) {
      assert.equal(
        /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE|TRUNCATE\b)/i.test(
          call,
        ),
        false,
        `File ${file} executes mutating SQL in query call: ${call.slice(0, 80)}...`,
      );
    }
  }
});

test.after(async () => {
  await pool.end();
});
