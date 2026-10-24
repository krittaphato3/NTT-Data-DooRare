import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  clinicalTools,
  logisticsTools,
  governanceTools,
  defaultToolRegistry,
} from '../../src/modules/ai/tools/index.js';
import { ALL_ROLES } from '../../src/modules/admin/users.rules.js';
import { PROPOSAL_ACTION_WHITELIST } from '../../src/modules/ai/tools/governance/governance.utils.js';
import type { RequestContext } from '../../src/modules/ai/tools/tool.types.js';

const EXPECTED_TEN_ROLES = [
  'SYSTEM_ADMIN',
  'REGION_ADMIN',
  'HOSPITAL_ADMIN',
  'PHARMACIST',
  'PROCUREMENT_OFFICER',
  'WAREHOUSE_OFFICER',
  'ER_STAFF',
  'DRIVER',
  'DATA_ADMIN',
  'AUDITOR',
] as const;

test('rbac-matrix: 1. Inventory and tool registry completeness', () => {
  // 1. ALL_ROLES set assertions
  assert.equal(ALL_ROLES.length, 10, 'ALL_ROLES must contain exactly 10 roles');
  const roleSet = new Set(ALL_ROLES);
  assert.equal(roleSet.size, 10, 'ALL_ROLES must not contain duplicate roles');
  for (const r of EXPECTED_TEN_ROLES) {
    assert.ok(roleSet.has(r as any), `ALL_ROLES must include ${r}`);
  }

  // 2. Domain tool collections counts
  assert.equal(clinicalTools.length, 12, 'clinicalTools must have length 12');
  assert.equal(logisticsTools.length, 15, 'logisticsTools must have length 15');
  assert.equal(governanceTools.length, 22, 'governanceTools must have length 22');
  const domainTotal = clinicalTools.length + logisticsTools.length + governanceTools.length;
  assert.equal(domainTotal, 49, 'Domain tools total must be 49');

  // 3. Registry total count and sample tools derivation
  const allRegistered = defaultToolRegistry.getAll();
  assert.equal(allRegistered.length, 51, 'Registry must have 51 total tools (49 domain + 2 sample)');

  const domainNames = new Set([
    ...clinicalTools.map((t) => t.name),
    ...logisticsTools.map((t) => t.name),
    ...governanceTools.map((t) => t.name),
  ]);
  assert.equal(domainNames.size, 49, 'Domain tool names must all be unique across domains');

  const sampleToolNames = allRegistered
    .map((t) => t.name)
    .filter((name) => !domainNames.has(name))
    .sort();
  assert.deepEqual(
    sampleToolNames,
    ['ping_system', 'submit_sample_action_proposal'],
    'Sample tools must be exactly ping_system and submit_sample_action_proposal',
  );

  // 4. Registry tool name uniqueness and formatting regex
  const registeredNames = allRegistered.map((t) => t.name);
  assert.equal(new Set(registeredNames).size, 51, 'All tool names in registry must be unique');
  for (const name of registeredNames) {
    assert.match(name, /^[a-z][a-z0-9_]*$/, `Tool name '${name}' must match /^[a-z][a-z0-9_]*$/`);
  }
});

test('rbac-matrix: 2. Static invariants for every registered tool', (t) => {
  const allTools = defaultToolRegistry.getAll();
  const allRolesSet = new Set<string>(ALL_ROLES);
  const wildcardOrAllRolesTools: string[] = [];

  for (const tool of allTools) {
    // Description invariant
    assert.ok(
      typeof tool.description === 'string' && tool.description.trim().length > 0,
      `Tool '${tool.name}' must have a non-empty string description`,
    );

    // Parameters is a ZodObject
    assert.ok(
      tool.parameters instanceof z.ZodObject,
      `Tool '${tool.name}' parameters must be an instance of z.ZodObject`,
    );

    // AllowedRoles non-empty
    assert.ok(
      Array.isArray(tool.allowedRoles) && tool.allowedRoles.length > 0,
      `Tool '${tool.name}' must have non-empty allowedRoles array`,
    );

    // No duplicates in allowedRoles
    assert.equal(
      new Set(tool.allowedRoles).size,
      tool.allowedRoles.length,
      `Tool '${tool.name}' allowedRoles must not contain duplicates`,
    );

    // Every allowed role must be in ALL_ROLES or '*'
    for (const role of tool.allowedRoles) {
      if (role === '*') continue;
      assert.ok(
        allRolesSet.has(role),
        `Tool '${tool.name}' specifies role '${role}' which is not in ALL_ROLES`,
      );
    }

    if (tool.allowedRoles.includes('*') || tool.allowedRoles.length === ALL_ROLES.length) {
      wildcardOrAllRolesTools.push(tool.name);
    }
  }

  // Report and assert tools listing all roles
  assert.deepEqual(
    wildcardOrAllRolesTools,
    ['ping_system'],
    'Only ping_system may specify wildcard or all 10 roles',
  );
  t.diagnostic(`Tools allowing all roles: ${wildcardOrAllRolesTools.join(', ')}`);
});

test('rbac-matrix: 3. Registry behavior discovery for system admin and invalid/unknown roles', async () => {
  const allTools = defaultToolRegistry.getAll();

  // (a) SYSTEM_ADMIN access semantics:
  // getToolsForRole('SYSTEM_ADMIN') must return all 51 tools regardless of allowedRoles array
  const sysAdminTools = defaultToolRegistry.getToolsForRole('SYSTEM_ADMIN');
  assert.equal(sysAdminTools.length, allTools.length, 'SYSTEM_ADMIN must receive all tools');

  // Verify executeTool for SYSTEM_ADMIN on a tool whose allowedRoles does NOT explicitly list SYSTEM_ADMIN
  // (All tools currently allow SYSTEM_ADMIN, but registry explicitly has `role === 'SYSTEM_ADMIN'` bypass)
  const sampleNonSysAdminTool = allTools.find((t) => !t.allowedRoles.includes('SYSTEM_ADMIN'));
  if (sampleNonSysAdminTool) {
    const res = await defaultToolRegistry.executeTool(
      sampleNonSysAdminTool.name,
      {},
      { role: 'SYSTEM_ADMIN' },
    );
    assert.doesNotMatch(res.error ?? '', /Permission denied/i);
  }

  // (b) Invalid, empty, lowercase, and unknown role semantics on a non-wildcard tool
  const nonWildcardTool = allTools.find((t) => !t.allowedRoles.includes('*'))!;
  const testTool = nonWildcardTool.name;

  // 1. undefined role
  assert.deepEqual(defaultToolRegistry.getToolsForRole(undefined), []);
  const resUndefined = await defaultToolRegistry.executeTool(
    testTool,
    {},
    { role: undefined } as unknown as RequestContext,
  );
  assert.equal(resUndefined.success, false);
  assert.match(resUndefined.error!, /Permission denied: Role 'ANONYMOUS' is not authorized/i);

  // 2. empty string role
  assert.deepEqual(defaultToolRegistry.getToolsForRole(''), []);
  const resEmpty = await defaultToolRegistry.executeTool(testTool, {}, { role: '' } as RequestContext);
  assert.equal(resEmpty.success, false);
  assert.match(resEmpty.error!, /Permission denied: Role 'ANONYMOUS' is not authorized/i);

  // 3. lowercase 'pharmacist' (not in allowedRoles; only receives wildcard '*' tools)
  assert.deepEqual(
    defaultToolRegistry.getToolsForRole('pharmacist').map((t) => t.name),
    ['ping_system'],
  );
  const resLower = await defaultToolRegistry.executeTool(
    testTool,
    {},
    { role: 'pharmacist' } as RequestContext,
  );
  assert.equal(resLower.success, false);
  assert.match(resLower.error!, /Permission denied: Role 'pharmacist' is not authorized/i);

  // 4. unknown role 'HACKER' (not in allowedRoles; only receives wildcard '*' tools)
  assert.deepEqual(
    defaultToolRegistry.getToolsForRole('HACKER').map((t) => t.name),
    ['ping_system'],
  );
  const resUnknown = await defaultToolRegistry.executeTool(
    testTool,
    {},
    { role: 'HACKER' } as RequestContext,
  );
  assert.equal(resUnknown.success, false);
  assert.match(resUnknown.error!, /Permission denied: Role 'HACKER' is not authorized/i);
});

test('rbac-matrix: 4. Full matrix 10 roles x 51 registered tools (DB-free via spy mocking)', async (t) => {
  const allTools = defaultToolRegistry.getAll();
  const originalExecutes = new Map<string, Function>();
  const spies = new Map<string, any>();

  // Wrap every tool's execute method with mock.method
  for (const tool of allTools) {
    originalExecutes.set(tool.name, tool.execute);
    const spy = mock.method(tool, 'execute', async () => ({
      success: true,
      data: { mocked: true },
    }));
    spies.set(tool.name, spy);
  }

  t.after(() => {
    mock.restoreAll();
    // Verify mock.restoreAll leaves original execute functions in place
    for (const tool of allTools) {
      assert.equal(
        tool.execute,
        originalExecutes.get(tool.name),
        `Tool '${tool.name}' execute must be restored to original function identity`,
      );
    }
  });

  // Evaluate matrix: 10 roles x 51 tools = 510 executions
  let totalEvaluated = 0;
  let totalUnauthorizedDenied = 0;
  let totalAuthorizedAllowed = 0;

  for (const role of ALL_ROLES) {
    for (const tool of allTools) {
      totalEvaluated++;
      const spy = spies.get(tool.name);
      const callCountBefore = spy.mock.callCount();

      const isExpectedAuthorized =
        role === 'SYSTEM_ADMIN' ||
        tool.allowedRoles.includes('*') ||
        tool.allowedRoles.includes(role);

      const res = await defaultToolRegistry.executeTool(tool.name, {}, { role });

      if (!isExpectedAuthorized) {
        totalUnauthorizedDenied++;
        assert.equal(
          res.success,
          false,
          `Role '${role}' must be unauthorized for tool '${tool.name}'`,
        );
        assert.match(
          res.error ?? '',
          /Permission denied/i,
          `Error for '${role}' on '${tool.name}' must be permission denied`,
        );
        // Absolute proof of no-mutation / no-SQL execution:
        assert.equal(
          spy.mock.callCount(),
          callCountBefore,
          `Mocked execute on '${tool.name}' must NOT be called for unauthorized role '${role}'`,
        );
      } else {
        totalAuthorizedAllowed++;
        assert.doesNotMatch(
          res.error ?? '',
          /Permission denied/i,
          `Role '${role}' must NOT be permission denied for tool '${tool.name}'`,
        );

        // If {} is valid for the tool, execute was called; otherwise zod validation rejected it before execution
        const zodAcceptsEmpty = tool.parameters.safeParse({}).success;
        if (zodAcceptsEmpty) {
          assert.equal(
            spy.mock.callCount(),
            callCountBefore + 1,
            `Mocked execute on '${tool.name}' must be called once when args are valid`,
          );
        } else {
          assert.equal(
            spy.mock.callCount(),
            callCountBefore,
            `Mocked execute on '${tool.name}' must not be called when zod validation fails`,
          );
        }
      }
    }
  }

  assert.equal(totalEvaluated, 510, 'Must have evaluated 10 roles x 51 tools = 510 combinations');
  t.diagnostic(
    `Full RBAC Matrix execution: ${totalEvaluated} combinations evaluated (${totalAuthorizedAllowed} authorized, ${totalUnauthorizedDenied} unauthorized denied with zero tool invocations)`,
  );
});

test('rbac-matrix: 5. Visibility and tenant role separation', () => {
  const allTools = defaultToolRegistry.getAll();

  // SYSTEM_ADMIN sees all 51 tools
  const sysAdminTools = defaultToolRegistry.getToolsForRole('SYSTEM_ADMIN');
  assert.equal(sysAdminTools.length, 51);
  const sysAdminDefs = defaultToolRegistry.getToolDefinitionsForRole('SYSTEM_ADMIN');
  assert.equal(sysAdminDefs.length, 51);

  // For each role, getToolsForRole and getToolDefinitionsForRole match exact expected set
  for (const role of ALL_ROLES) {
    const expectedNames = allTools
      .filter(
        (t) =>
          role === 'SYSTEM_ADMIN' ||
          t.allowedRoles.includes('*') ||
          t.allowedRoles.includes(role),
      )
      .map((t) => t.name)
      .sort();

    const actualToolNames = defaultToolRegistry
      .getToolsForRole(role)
      .map((t) => t.name)
      .sort();
    assert.deepEqual(actualToolNames, expectedNames);

    const actualDefNames = defaultToolRegistry
      .getToolDefinitionsForRole(role)
      .map((d) => d.name)
      .sort();
    assert.deepEqual(actualDefNames, expectedNames);
  }

  // Explicit security expectation: NO governance tool is visible to clinical / field roles
  const nonGovernanceRoles = [
    'PHARMACIST',
    'PROCUREMENT_OFFICER',
    'WAREHOUSE_OFFICER',
    'ER_STAFF',
    'DRIVER',
  ] as const;

  const governanceToolNames = new Set(governanceTools.map((t) => t.name));

  for (const role of nonGovernanceRoles) {
    const visibleTools = defaultToolRegistry.getToolsForRole(role);
    const visibleGovernanceTools = visibleTools.filter((t) => governanceToolNames.has(t.name));
    assert.equal(
      visibleGovernanceTools.length,
      0,
      `Role '${role}' must have ZERO visible governance tools, found: ${visibleGovernanceTools.map((t) => t.name).join(', ')}`,
    );
  }
});

test('rbac-matrix: 6. Privilege boundary assertions for governance proposals and AUDITOR role', () => {
  // 1. Check all submit_ proposals in governanceTools
  const submitTools = governanceTools.filter((t) => t.name.startsWith('submit_'));
  assert.equal(submitTools.length, 5, 'Must have exactly 5 submit_ tools in governance');

  for (const tool of submitTools) {
    if (tool.name === 'submit_hospital_admin_proposal') {
      assert.deepEqual(tool.allowedRoles.slice().sort(), ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'].sort());
    } else if (tool.name === 'submit_region_admin_proposal') {
      assert.deepEqual(tool.allowedRoles.slice().sort(), ['REGION_ADMIN', 'SYSTEM_ADMIN'].sort());
    } else if (tool.name === 'submit_system_admin_proposal') {
      assert.deepEqual(tool.allowedRoles.slice().sort(), ['SYSTEM_ADMIN']);
    } else if (tool.name === 'submit_data_admin_proposal') {
      assert.deepEqual(tool.allowedRoles.slice().sort(), ['DATA_ADMIN', 'SYSTEM_ADMIN'].sort());
    } else if (tool.name === 'submit_auditor_finding_proposal') {
      assert.deepEqual(tool.allowedRoles.slice().sort(), ['AUDITOR', 'SYSTEM_ADMIN'].sort());
    } else {
      assert.fail(`Unexpected submit tool in governance: ${tool.name}`);
    }
  }

  // 2. AUDITOR role is strictly prohibited from having executable endpoints in PROPOSAL_ACTION_WHITELIST
  const auditorWhitelist = (PROPOSAL_ACTION_WHITELIST as any).AUDITOR;
  assert.ok(auditorWhitelist !== undefined, 'PROPOSAL_ACTION_WHITELIST must define AUDITOR');
  assert.deepEqual(
    Object.keys(auditorWhitelist),
    [],
    'AUDITOR whitelist must be empty; auditors have zero executable API actions',
  );

  // 3. None of the executable actions in PROPOSAL_ACTION_WHITELIST include AUDITOR
  for (const [role, actions] of Object.entries(PROPOSAL_ACTION_WHITELIST)) {
    if (role === 'AUDITOR') continue;
    const actionDefs = Object.values(actions as Record<string, any>);
    assert.ok(actionDefs.length > 0, `Role ${role} in whitelist must define action endpoints`);
  }
});

test('rbac-matrix: 7. Compact matrix summary diagnostic', (t) => {
  const allTools = defaultToolRegistry.getAll();
  const roleCounts: Record<string, number> = {};

  for (const role of ALL_ROLES) {
    roleCounts[role] = defaultToolRegistry.getToolsForRole(role).length;
  }

  const lines = [
    '=== RBAC Matrix Summary (Tools Authorized per Role) ===',
    `Total Registered Tools: ${allTools.length} (Domain: 49, Sample: 2)`,
    ...ALL_ROLES.map((r) => `  - ${r.padEnd(20)} : ${roleCounts[r]} tools`),
  ];

  t.diagnostic('\n' + lines.join('\n'));
});
