import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolRegistry } from '../src/modules/ai/tools/index.js';
import { stageTools, ROLE_PROPOSAL_TOOL } from '../src/modules/ai/tools/selector.js';
import { ALL_ROLES } from '../src/modules/admin/users.rules.js';
import type { ToolDefinition } from '../src/modules/ai/providers/types.js';

test('ROLE_PROPOSAL_TOOL defines explicit mapping for all 10 user roles', () => {
  assert.equal(ALL_ROLES.length, 10, 'Expected exactly 10 roles in ALL_ROLES');
  for (const role of ALL_ROLES) {
    const toolName = ROLE_PROPOSAL_TOOL[role];
    assert.ok(toolName, `Missing proposal tool mapping for role '${role}'`);
    assert.match(toolName, /^submit_[a-z_]+_proposal$/, `Proposal tool name '${toolName}' must match naming convention`);
  }
});

test('All 10 role proposal tools are registered in defaultToolRegistry and authorized for their role', () => {
  for (const [role, toolName] of Object.entries(ROLE_PROPOSAL_TOOL)) {
    const tool = defaultToolRegistry.get(toolName);
    assert.ok(tool, `Tool '${toolName}' mapped to role '${role}' must be registered in defaultToolRegistry`);

    const roleDefs = defaultToolRegistry.getToolDefinitionsForRole(role);
    assert.ok(
      roleDefs.some((t) => t.name === toolName),
      `Role '${role}' must be authorized to receive its proposal tool '${toolName}'`,
    );
  }
});

test('stageTools pins the primary proposal tool and ask_operator for all 10 roles even under heavy family competition', () => {
  // 15 dummy tools matching the query with positive weight to compete against the proposal tool
  const dummyStockTools: ToolDefinition[] = Array.from({ length: 15 }, (_, i) => ({
    name: `stock_level_check_${i}`,
    description: 'สต็อก ยาคงคลัง rop reorder alert',
    parameters: { type: 'object', properties: {} },
  }));

  for (const role of ALL_ROLES) {
    const expectedProposal = ROLE_PROPOSAL_TOOL[role];
    const testTools: ToolDefinition[] = [
      { name: expectedProposal, description: 'Role proposal tool', parameters: { type: 'object', properties: {} } },
      { name: 'ask_operator', description: 'Ask operator escape hatch', parameters: { type: 'object', properties: {} } },
      ...dummyStockTools,
    ];

    const result = stageTools(testTools, {
      query: 'ตรวจสอบสต็อกคงคลังยาฉุกเฉินด่วน', // matches stock family, giving high scores to dummy tools
      role,
      maxTools: 5,
    });

    assert.equal(result.staged, true, `Expected staging to be active for role ${role}`);
    assert.ok(
      result.names.includes(expectedProposal),
      `Primary proposal tool '${expectedProposal}' for role '${role}' must NEVER be staged away`,
    );
    assert.ok(
      result.names.includes('ask_operator'),
      `'ask_operator' must NEVER be staged away for role '${role}'`,
    );
  }
});

test('stageTools correctly resolves the 5 previously failing role proposal tools', () => {
  const previouslyFailingCases = [
    { role: 'ER_STAFF', expected: 'submit_er_action_proposal' },
    { role: 'WAREHOUSE_OFFICER', expected: 'submit_warehouse_confirmation_proposal' },
    { role: 'DRIVER', expected: 'submit_driver_status_proposal' },
    { role: 'PROCUREMENT_OFFICER', expected: 'submit_procurement_proposal' },
    { role: 'AUDITOR', expected: 'submit_auditor_finding_proposal' },
  ];

  for (const { role, expected } of previouslyFailingCases) {
    const tools: ToolDefinition[] = [
      { name: expected, description: 'Proposal tool', parameters: { type: 'object', properties: {} } },
      { name: 'ask_operator', description: 'Ask operator', parameters: { type: 'object', properties: {} } },
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `borrow_ladder_tool_${i}`,
        description: 'ยืม lender ladder waiver',
        parameters: { type: 'object', properties: {} },
      })),
    ];

    const res = stageTools(tools, {
      query: 'ขอยืมยาเร่งด่วน',
      role,
      maxTools: 4,
    });

    assert.ok(res.names.includes(expected), `Role '${role}' must pin '${expected}'`);
  }
});

test('stageTools handles case-insensitivity and untrimmed role names', () => {
  const tools: ToolDefinition[] = [
    { name: 'submit_er_action_proposal', description: 'Proposal', parameters: { type: 'object', properties: {} } },
    { name: 'ask_operator', description: 'Ask operator', parameters: { type: 'object', properties: {} } },
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `dummy_tool_${i}`,
      description: 'สต็อก stock alert',
      parameters: { type: 'object', properties: {} },
    })),
  ];

  const resLower = stageTools(tools, { query: 'สต็อก', role: 'er_staff', maxTools: 5 });
  assert.ok(resLower.names.includes('submit_er_action_proposal'), 'Lower-case role must pin tool');

  const resSpaces = stageTools(tools, { query: 'สต็อก', role: '  ER_STAFF  ', maxTools: 5 });
  assert.ok(resSpaces.names.includes('submit_er_action_proposal'), 'Untrimmed role must pin tool');
});

test('stageTools handles undefined or empty role safely without throwing', () => {
  const tools: ToolDefinition[] = [
    { name: 'ask_operator', description: 'Ask operator', parameters: { type: 'object', properties: {} } },
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `tool_${i}`,
      description: 'สต็อก',
      parameters: { type: 'object', properties: {} },
    })),
  ];

  assert.doesNotThrow(() => {
    const res = stageTools(tools, { query: 'สต็อก', role: undefined, maxTools: 5 });
    assert.ok(res.names.includes('ask_operator'));
  });
});
