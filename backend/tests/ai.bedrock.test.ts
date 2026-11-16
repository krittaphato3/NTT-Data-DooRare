/** Bedrock provider: request mapping, no sampling params, real usage, real connection test (no network: stub client). */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { AIConfig } from '../src/modules/ai/byok/byok.types.js';
import { BedrockProvider, toBedrockRequest, toConverseRequest, splitThinking, usesMantle, type ConverseSender } from '../src/modules/ai/providers/bedrock.provider.js';

const config = {
  provider: 'AWS_BEDROCK',
  modelPrimary: 'anthropic.claude-haiku-5-5',
  modelFast: 'anthropic.claude-haiku-5-5',
  monthlyBudgetUsd: 100,
  estimatedSpendUsd: 0,
  streamingEnabled: false,
  credentials: { awsRegion: 'us-east-1' },
} as unknown as AIConfig;

function stubClient(handler: (params: Record<string, unknown>) => unknown): { client: AnthropicBedrockMantle; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push(params);
        return handler(params);
      },
    },
  } as unknown as AnthropicBedrockMantle;
  return { client, calls };
}

const okResponse = {
  model: 'anthropic.claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"ok":true}' }],
  usage: { input_tokens: 120, output_tokens: 30 },
};

test('toBedrockRequest: system split out, tool turns become blocks, blank assistant gets a placeholder', () => {
  const req = toBedrockRequest([
    { role: 'system', content: 'sys A' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'lookup', arguments: '{"id":1}' } }] },
    { role: 'tool', content: 'result', tool_call_id: 't1' },
    { role: 'assistant', content: '' },
  ]);
  assert.equal(req.system, 'sys A');
  assert.deepEqual(req.messages[1], { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'lookup', input: { id: 1 } }] });
  assert.deepEqual(req.messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }] });
  assert.equal(req.messages[3]?.content, '(no response)');
});

test('chat: no temperature, effort low, real usage, text returned', async () => {
  const { client, calls } = stubClient(() => okResponse);
  const res = await new BedrockProvider(config, client).chat(
    [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
    [],
    { temperature: 0, maxTokens: 500 },
  );
  assert.equal(res.content, '{"ok":true}');
  assert.deepEqual(res.usage, { promptTokens: 120, completionTokens: 30, totalTokens: 150 });
  assert.equal('temperature' in (calls[0] ?? {}), false);
  assert.deepEqual(calls[0]?.output_config, { effort: 'low' });
  assert.equal(calls[0]?.max_tokens, 500);
  assert.equal(calls[0]?.system, 's');
});

test('chat: tool_use block becomes a tool call; refusal throws', async () => {
  const withTool = stubClient(() => ({
    ...okResponse,
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'x', name: 'lookup', input: { a: 1 } }],
  }));
  const res = await new BedrockProvider(config, withTool.client).chat([{ role: 'user', content: 'u' }], [
    { name: 'lookup', description: 'd', parameters: { type: 'object', properties: {} } },
  ]);
  assert.equal(res.content, null);
  assert.deepEqual(res.toolCalls, [{ id: 'x', type: 'function', function: { name: 'lookup', arguments: '{"a":1}' } }]);

  const refused = stubClient(() => ({ ...okResponse, stop_reason: 'refusal', content: [] }));
  await assert.rejects(() => new BedrockProvider(config, refused.client).chat([{ role: 'user', content: 'u' }]), /refused/);
});

test('testConnection: really calls the model; failures are reported, not faked', async () => {
  const ok = stubClient(() => okResponse);
  const good = await new BedrockProvider(config, ok.client).testConnection();
  assert.equal(good.success, true);
  assert.equal(ok.calls.length, 1);

  const bad = stubClient(() => {
    throw new Error('AccessDeniedException: not authorized to invoke model');
  });
  const failed = await new BedrockProvider(config, bad.client).testConnection();
  assert.equal(failed.success, false);
  assert.match(failed.message, /AccessDenied/);
});

const novaConfig = { ...config, modelPrimary: 'amazon.nova-lite-v1:0', modelFast: 'amazon.nova-lite-v1:0' } as unknown as AIConfig;

function stubConverse(response: unknown): { sender: ConverseSender; inputs: Record<string, unknown>[] } {
  const inputs: Record<string, unknown>[] = [];
  const sender: ConverseSender = {
    send: async (command) => {
      inputs.push((command as unknown as { input: Record<string, unknown> }).input);
      if (response instanceof Error) throw response;
      return response as Awaited<ReturnType<ConverseSender['send']>>;
    },
  };
  return { sender, inputs };
}

test('usesMantle: Claude 5.x only; Nova and Haiku 4.5 go through Converse', () => {
  assert.equal(usesMantle('anthropic.claude-haiku-5-5'), true);
  assert.equal(usesMantle('amazon.nova-lite-v1:0'), false);
  assert.equal(usesMantle('us.anthropic.claude-haiku-4-5-20251001-v1:0'), false);
});

test('toConverseRequest: system split out, tool result merged into one user turn', () => {
  const req = toConverseRequest([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }] },
    { role: 'tool', content: 'r1', tool_call_id: 't1' },
  ]);
  assert.deepEqual(req.system, [{ text: 'sys' }]);
  assert.deepEqual(req.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(req.messages[2]?.content, [{ toolResult: { toolUseId: 't1', content: [{ text: 'r1' }] } }]);
});

test('Nova via Converse: text, usage, temperature passed, no Mantle call', async () => {
  const mantle = stubClient(() => {
    throw new Error('Mantle must not be used for Nova');
  });
  const { sender, inputs } = stubConverse({
    output: { message: { content: [{ text: '{"ok":true}' }] } },
    usage: { inputTokens: 100, outputTokens: 20 },
  });
  const res = await new BedrockProvider(novaConfig, mantle.client, sender).chat(
    [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
    [],
    { temperature: 0, maxTokens: 300 },
  );
  assert.equal(res.content, '{"ok":true}');
  assert.deepEqual(res.usage, { promptTokens: 100, completionTokens: 20, totalTokens: 120 });
  assert.deepEqual(inputs[0]?.inferenceConfig, { maxTokens: 300, temperature: 0 });
  assert.equal(inputs[0]?.modelId, 'amazon.nova-lite-v1:0');
  assert.equal(mantle.calls.length, 0);
});

test('Nova testConnection reports a Converse failure', async () => {
  const { sender } = stubConverse(new Error('AccessDeniedException: not available for this account'));
  const r = await new BedrockProvider(novaConfig, undefined, sender).testConnection();
  assert.equal(r.success, false);
  assert.match(r.message, /AccessDenied/);
});

test('splitThinking: thinking moves to thought; thinking-only text has no visible answer', () => {
  assert.deepEqual(splitThinking('<thinking>why</thinking>\nAnswer'), { visible: 'Answer', thought: 'why' });
  assert.deepEqual(splitThinking('<thinking>only this</thinking>'), { visible: null, thought: 'only this' });
  assert.deepEqual(splitThinking('plain'), { visible: 'plain', thought: null });
});

test('Nova thinking-only reply is retried once and the real answer returned', async () => {
  const replies = [
    { output: { message: { content: [{ text: '<thinking>no request</thinking>' }] } }, usage: { inputTokens: 10, outputTokens: 5 } },
    { output: { message: { content: [{ text: 'สวัสดี คำตอบจริง' }] } }, usage: { inputTokens: 12, outputTokens: 6 } },
  ];
  const inputs: Record<string, unknown>[] = [];
  const sender: ConverseSender = {
    send: async (command) => {
      inputs.push((command as unknown as { input: Record<string, unknown> }).input);
      return replies.shift() as Awaited<ReturnType<ConverseSender['send']>>;
    },
  };
  const res = await new BedrockProvider(novaConfig, undefined, sender).chat([{ role: 'user', content: 'ทำไรได้บ้าง' }]);
  assert.equal(res.content, 'สวัสดี คำตอบจริง');
  assert.equal(res.thought, 'no request');
  assert.equal(inputs.length, 2);
  assert.deepEqual(res.usage, { promptTokens: 22, completionTokens: 11, totalTokens: 33 });
});
