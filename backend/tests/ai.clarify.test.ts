import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { askOperatorTool } from '../src/modules/ai/tools/askOperator.tool.js';
import { submitPharmacistProposalTool } from '../src/modules/ai/tools/clinical/pharmacist.tools.js';
import { ToolRegistry, zodToJsonSchema } from '../src/modules/ai/tools/registry.js';
import { ReActEngine } from '../src/modules/ai/engine/react.engine.js';
import type { ILLMProvider } from '../src/modules/ai/providers/types.js';
import type { ToolRegistry } from '../src/modules/ai/tools/registry.js';
import type { RequestContext } from '../src/modules/ai/tools/tool.types.js';

test('ask_operator: returns a question payload with sane defaults', async () => {
  const result = await askOperatorTool.execute(
    { questions: [{ header: 'จำนวน', question: 'ต้องการยืมกี่หน่วย?' }] },
    { role: 'PHARMACIST' },
  );
  assert.equal(result.success, true);
  assert.equal(result.question?.questions.length, 1);
  assert.equal(result.question?.questions[0].allowFreeText, true);
  assert.equal(result.question?.questions[0].multiSelect, false);
  assert.deepEqual(result.question?.questions[0].options, []);
});

test('ask_operator: rejects an empty question list', async () => {
  const result = await askOperatorTool.execute({ questions: [] }, { role: 'PHARMACIST' });
  assert.equal(result.success, false);
  assert.match(result.error ?? '', /at least one question/);
});

test('engine: an ask_operator question ends the turn and is emitted once', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async () => {
      chatCalls++;
      return {
        model: 'fake',
        content: null,
        toolCalls: [
          {
            id: 'call_ask',
            type: 'function',
            function: {
              name: 'ask_operator',
              arguments: JSON.stringify({
                questions: [{ header: 'จำนวน', question: 'กี่หน่วย?', options: [{ label: '10' }, { label: '20' }] }],
              }),
            },
          },
        ],
      };
    },
  } as unknown as ILLMProvider;

  const registry = {
    getToolDefinitionsForRole: () => [
      { name: 'ask_operator', description: 'ask', parameters: { type: 'object', properties: {} } },
    ],
    executeTool: async () => ({
      success: true,
      data: { asked: 1 },
      question: {
        questions: [
          {
            header: 'จำนวน',
            question: 'กี่หน่วย?',
            options: [{ label: '10' }, { label: '20' }],
            allowFreeText: true,
            multiSelect: false,
          },
        ],
      },
    }),
  } as unknown as ToolRegistry;

  const events: any[] = [];
  const result = await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'ขอยืมยา 20 หน่วย' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
    onEvent: (event) => {
      events.push(event);
    },
  });

  assert.equal(chatCalls, 1, 'the loop must stop at the question instead of asking the model again');
  assert.equal(result.iterations, 1);
  const asked = events.filter((e) => e.type === 'question');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].questions[0].header, 'จำนวน');
});

test('engine: repeated invalid arguments become a question panel (no model cooperation needed)', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async () => {
      chatCalls++;
      return {
        model: 'fake',
        content: null,
        toolCalls: [
          {
            id: `call_${chatCalls}`,
            type: 'function',
            function: { name: 'submit_pharmacist_proposal', arguments: '{"actionType":"CREATE_BORROW_REQUEST"}' },
          },
        ],
      };
    },
  } as unknown as ILLMProvider;

  const registry = {
    getToolDefinitionsForRole: () => [
      { name: 'submit_pharmacist_proposal', description: 'propose', parameters: { type: 'object', properties: {} } },
      { name: 'ask_operator', description: 'ask', parameters: { type: 'object', properties: {} } },
    ],
    executeTool: async () => ({
      success: false,
      error:
        "Invalid tool arguments for 'submit_pharmacist_proposal': items.0.qtyRequested: expected number, received undefined",
      validationErrors: [{ path: 'items.0.qtyRequested', message: 'expected number, received undefined' }],
    }),
  } as unknown as ToolRegistry;

  const events: any[] = [];
  const result = await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'สร้างคำขอยืมยาให้หน่อย' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
    onEvent: (event) => {
      events.push(event);
    },
  });

  assert.equal(chatCalls, 1, 'the harness asks immediately, no retry and no error card');
  assert.equal(result.iterations, 1);
  const asked = events.filter((e) => e.type === 'question');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].questions.length, 1);
  assert.match(asked[0].questions[0].question, /items\.0\.qtyRequested/);
  assert.equal(asked[0].questions[0].allowFreeText, true);
});

test('engine: a tool-level payload rejection also becomes a question on the first failure', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async () => {
      chatCalls++;
      return {
        model: 'fake',
        content: null,
        toolCalls: [
          {
            id: `call_${chatCalls}`,
            type: 'function',
            function: { name: 'submit_pharmacist_proposal', arguments: '{"actionType":"CREATE_BORROW_REQUEST"}' },
          },
        ],
      };
    },
  } as unknown as ILLMProvider;

  const registry = {
    getToolDefinitionsForRole: () => [
      { name: 'submit_pharmacist_proposal', description: 'propose', parameters: { type: 'object', properties: {} } },
    ],
    executeTool: async () => ({
      success: false,
      // Shape returned by the proposal tools themselves (not the registry schema).
      error:
        'Invalid proposal payload for CREATE_BORROW_REQUEST: {"expected":"string","code":"invalid_type","path":["items",0,"drugMasterId"],"message":"Invalid input: expected string, received undefined"}',
    }),
  } as unknown as ToolRegistry;

  const events: any[] = [];
  const result = await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'สร้างคำขอยืมยา พารา 20 ขวด' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
    onEvent: (event) => {
      events.push(event);
    },
  });

  assert.equal(chatCalls, 1);
  assert.equal(result.iterations, 1);
  const asked = events.filter((e) => e.type === 'question');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].questions[0].header, 'ชื่อยา / รหัสยา');
  assert.match(asked[0].questions[0].question, /items\.0\.drugMasterId/);
});

test('registry: the JSON schema describes nested payload fields', () => {
  const schema = z.object({
    items: z.array(z.object({ drugMasterId: z.string(), qtyRequested: z.number() })),
  });
  const json = zodToJsonSchema(schema) as any;
  assert.equal(json.properties.items.type, 'array');
  assert.equal(json.properties.items.items.properties.drugMasterId.type, 'string');
  assert.deepEqual(json.properties.items.items.required, ['drugMasterId', 'qtyRequested']);
});

test('registry: numeric strings are repaired before strict validation', async () => {
  const registry = new ToolRegistry();
  let received: any;
  registry.register({
    name: 'echo_qty',
    description: 'test only',
    parameters: z.object({
      qty: z.number().positive(),
      items: z.array(z.object({ q: z.number() })),
    }),
    allowedRoles: ['*'],
    execute: async (args) => {
      received = args;
      return { success: true };
    },
  });

  const res = await registry.executeTool('echo_qty', { qty: '20', items: [{ q: '5' }] }, { role: 'PHARMACIST' });
  assert.equal(res.success, true, res.error);
  assert.deepEqual(received, { qty: 20, items: [{ q: 5 }] });
});

test('registry: a value that cannot be read as a number still asks the operator', async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'echo_qty_only',
    description: 'test only',
    parameters: z.object({ qty: z.number().positive() }),
    allowedRoles: ['*'],
    execute: async () => ({ success: true }),
  });

  const res = await registry.executeTool('echo_qty_only', { qty: 'มาก' }, { role: 'PHARMACIST' });
  assert.equal(res.success, false);
  assert.equal(res.validationErrors?.[0].path, 'qty');
});

test('ask_operator: supports string options and coerces them to label objects', async () => {
  const parsed = askOperatorTool.parameters.safeParse({
    questions: [
      {
        header: 'เลือกโรงพยาบาล',
        question: 'ต้องการยืมยาจากที่ใด?',
        options: ['รพ.สมุทรปราการ', 'รพ.บางพลี'],
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const res = await askOperatorTool.execute(parsed.data, { role: 'PHARMACIST' });
    assert.equal(res.success, true);
    assert.equal(res.question?.questions[0].options[0].label, 'รพ.สมุทรปราการ');
    assert.equal(res.question?.questions[0].options[1].label, 'รพ.บางพลี');
  }
});

test('ask_operator: supports single question root object without array wrapper', async () => {
  const parsed = askOperatorTool.parameters.safeParse({
    question: 'ยืมยาจำนวนเท่าใด?',
    options: ['10', '20'],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const res = await askOperatorTool.execute(parsed.data, { role: 'PHARMACIST' });
    assert.equal(res.success, true);
    assert.equal(res.question?.questions.length, 1);
    assert.equal(res.question?.questions[0].question, 'ยืมยาจำนวนเท่าใด?');
    assert.equal(res.question?.questions[0].options[0].label, '10');
  }
});

test('ask_operator: auto-fills default clinical options if model asks about drug formulation or hospital without options', async () => {
  const res = await askOperatorTool.execute(
    {
      questions: [
        { header: 'ความแรงและรูปแบบยา', question: 'ต้องการยืมยาพาราเซตามอลรูปแบบใด?' },
        { header: 'โรงพยาบาลผู้ให้ยืม', question: 'ต้องการยืมจาก รพ. ใด?' },
      ],
    },
    { role: 'PHARMACIST' },
  );
  assert.equal(res.success, true);
  assert.equal(res.question?.questions.length, 2);
  // Drug question gets Paracetamol choices automatically
  assert.ok(res.question?.questions[0].options.length >= 2);
  assert.ok(res.question?.questions[0].options.some((o: any) => o.label.includes('500 mg')));
  // Hospital question gets hospital choices automatically
  assert.ok(res.question?.questions[1].options.length >= 2);
  assert.ok(res.question?.questions[1].options.some((o: any) => o.label.includes('โรงพยาบาล') || o.label.includes('รพ.')));
});

test('ask_operator: supports choices alias and comma-separated options string', async () => {
  const parsed = askOperatorTool.parameters.safeParse({
    questions: [
      {
        header: 'ความเร่งด่วน',
        prompt: 'เลือกระดับความเร่งด่วน',
        choices: 'NORMAL, URGENT, VERY_URGENT',
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const res = await askOperatorTool.execute(parsed.data, { role: 'PHARMACIST' });
    assert.equal(res.success, true);
    assert.equal(res.question?.questions[0].options.length, 3);
    assert.equal(res.question?.questions[0].options[0].label, 'NORMAL');
    assert.equal(res.question?.questions[0].options[1].label, 'URGENT');
    assert.equal(res.question?.questions[0].options[2].label, 'VERY_URGENT');
  }
});

test('submitPharmacistProposalTool: auto-coerces missing actionType, strips nil UUID targetId, and tolerates summary-only inputs', async () => {
  const inputArgs = {
    title: 'สร้างคำขออนุมัติยืมยา Paracetamol syrup 120 mg/5 mL (500 หน่วย)',
    targetId: '00000000-0000-0000-0000-000000000000',
    summary: {
      qty: 500,
      drug: 'Paracetamol syrup 120 mg/5 mL',
      urgency: 'URGENT',
    },
  };

  const parsed = submitPharmacistProposalTool.parameters.safeParse(inputArgs);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.actionType, 'CREATE_BORROW_REQUEST');
    assert.equal(parsed.data.targetId, undefined);
    assert.equal(parsed.data.title, inputArgs.title);
  }
});
