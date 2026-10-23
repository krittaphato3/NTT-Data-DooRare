import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  ToolRegistry,
  zodToJsonSchema,
  pingSystemTool,
  sampleActionProposalTool,
  type IAgentTool,
} from '../src/modules/ai/tools/index.js';

test('zodToJsonSchema converts Zod object schema correctly', () => {
  const schema = z.object({
    drugName: z.string().describe('Generic drug name'),
    quantity: z.number().describe('Quantity required'),
    isUrgent: z.boolean().optional().describe('Whether urgent'),
  });

  const jsonSchema = zodToJsonSchema(schema);
  assert.equal(jsonSchema.type, 'object');
  assert.deepEqual(jsonSchema.required, ['drugName', 'quantity']);
  assert.equal((jsonSchema.properties.drugName as any).type, 'string');
  assert.equal((jsonSchema.properties.drugName as any).description, 'Generic drug name');
  assert.equal((jsonSchema.properties.quantity as any).type, 'number');
  assert.equal((jsonSchema.properties.isUrgent as any).type, 'boolean');
});

test('ToolRegistry registers and retrieves tools', () => {
  const registry = new ToolRegistry();
  registry.register(pingSystemTool);

  const tool = registry.get('ping_system');
  assert.ok(tool);
  assert.equal(tool.name, 'ping_system');

  // Prevent duplicate registration
  assert.throws(() => registry.register(pingSystemTool), /already registered/);
});

test('ToolRegistry enforces role authorization', async () => {
  const registry = new ToolRegistry();
  registry.register(pingSystemTool); // allowedRoles: ['*']
  registry.register(sampleActionProposalTool); // allowedRoles: ['PHARMACIST', 'ER_STAFF', 'SYSTEM_ADMIN']

  // Anonymous / Unauthorized caller trying to run Pharmacist tool
  const failRes = await registry.executeTool(
    'submit_sample_action_proposal',
    { proposalTitle: 'Test', targetHospital: 'Chula', quantity: 5 },
    { role: 'DRIVER' },
  );
  assert.equal(failRes.success, false);
  assert.match(failRes.error || '', /Permission denied/);

  // Authorized role (PHARMACIST)
  const passRes = await registry.executeTool(
    'submit_sample_action_proposal',
    { proposalTitle: 'Test', targetHospital: 'Chula', quantity: 5 },
    { role: 'PHARMACIST' },
  );
  assert.equal(passRes.success, true);
  assert.ok(passRes.proposal);
  assert.equal(passRes.proposal?.summary.hospital, 'Chula');

  // SYSTEM_ADMIN bypasses role restrictions
  const adminRes = await registry.executeTool(
    'submit_sample_action_proposal',
    { proposalTitle: 'Admin override', targetHospital: 'Siriraj', quantity: 2 },
    { role: 'SYSTEM_ADMIN' },
  );
  assert.equal(adminRes.success, true);
});

test('ToolRegistry validates parameters against Zod schema', async () => {
  const registry = new ToolRegistry();
  registry.register(sampleActionProposalTool);

  // Invalid quantity (string instead of number, or negative)
  const invalidRes = await registry.executeTool(
    'submit_sample_action_proposal',
    { proposalTitle: 'Invalid', targetHospital: 'Chula', quantity: -10 },
    { role: 'PHARMACIST' },
  );
  assert.equal(invalidRes.success, false);
  assert.match(invalidRes.error || '', /Invalid tool arguments/);
});

test('ToolRegistry filters ToolDefinition list by role', () => {
  const registry = new ToolRegistry();
  registry.register(pingSystemTool); // '*'
  registry.register(sampleActionProposalTool); // 'PHARMACIST', 'ER_STAFF', 'SYSTEM_ADMIN'

  const driverDefs = registry.getToolDefinitionsForRole('DRIVER');
  assert.equal(driverDefs.length, 1);
  assert.equal(driverDefs[0].name, 'ping_system');

  const pharmacistDefs = registry.getToolDefinitionsForRole('PHARMACIST');
  assert.equal(pharmacistDefs.length, 2);

  const adminDefs = registry.getToolDefinitionsForRole('SYSTEM_ADMIN');
  assert.equal(adminDefs.length, 2);
});
