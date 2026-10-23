import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ReActEngine, type ReActExecutionEvent } from '../src/modules/ai/engine/index.js';
import { ToolRegistry } from '../src/modules/ai/tools/index.js';
import type { ChatMessage, ILLMProvider, LLMResponse } from '../src/modules/ai/providers/types.js';

test('ReActEngine terminates directly when no tool call is requested', async () => {
  const engine = new ReActEngine();
  const mockProvider: ILLMProvider = {
    providerType: 'MOCK',
    testConnection: async () => ({ success: true, latencyMs: 5, message: 'ok', modelId: 'mock' }),
    chat: async () => ({
      content: 'Hello! How can I assist you with clinical inventory today?',
      model: 'mock-model',
    }),
  };

  const events: ReActExecutionEvent[] = [];
  const result = await engine.execute({
    messages: [{ role: 'user', content: 'Hi' }],
    context: { role: 'PHARMACIST' },
    providerOverride: mockProvider,
    onEvent: (e) => events.push(e),
  });

  assert.equal(result.iterations, 1);
  assert.equal(result.toolExecutionCount, 0);
  assert.equal(result.finalResponse, 'Hello! How can I assist you with clinical inventory today?');
  assert.equal(events.some((e) => e.type === 'token'), true);
  assert.equal(events.some((e) => e.type === 'done'), true);
});

test('ReActEngine runs loop: calls tool, passes observation back, and concludes', async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'find_antidote',
    description: 'Finds antidote stock',
    parameters: z.object({ toxin: z.string() }),
    allowedRoles: ['ER_STAFF'],
    execute: async (args: { toxin: string }) => ({
      success: true,
      data: { found: true, stock: 12, hospital: 'Chula' },
    }),
  });

  let callCount = 0;
  const mockProvider: ILLMProvider = {
    providerType: 'MOCK',
    testConnection: async () => ({ success: true, latencyMs: 5, message: 'ok', modelId: 'mock' }),
    chat: async (messages) => {
      callCount++;
      if (callCount === 1) {
        // First step: model decides to call 'find_antidote'
        return {
          model: 'mock-model',
          content: null,
          toolCalls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'find_antidote',
                arguments: JSON.stringify({ toxin: 'snake' }),
              },
            },
          ],
        };
      }
      // Second step: model sees the observation and gives final answer
      const lastMessage = messages[messages.length - 1];
      assert.equal(lastMessage.role, 'tool');
      assert.equal(lastMessage.tool_call_id, 'call_123');
      return {
        model: 'mock-model',
        content: 'Found 12 vials of antivenom at Chula Hospital.',
      };
    },
  };

  const engine = new ReActEngine();
  const events: ReActExecutionEvent[] = [];

  const result = await engine.execute({
    messages: [{ role: 'user', content: 'Check antivenom for snake bite' }],
    context: { role: 'ER_STAFF' },
    providerOverride: mockProvider,
    registryOverride: registry,
    onEvent: (e) => events.push(e),
  });

  assert.equal(result.iterations, 2);
  assert.equal(result.toolExecutionCount, 1);
  assert.equal(result.finalResponse, 'Found 12 vials of antivenom at Chula Hospital.');
  assert.equal(events.some((e) => e.type === 'tool_start'), true);
  assert.equal(events.some((e) => e.type === 'tool_end'), true);
});

test('ReActEngine captures and yields Proposal cards from terminal proposal tools', async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'submit_transfer_proposal',
    description: 'Generates transfer proposal',
    parameters: z.object({ drug: z.string(), qty: z.number() }),
    allowedRoles: ['PHARMACIST'],
    execute: async (args: { drug: string; qty: number }) => ({
      success: true,
      proposal: {
        type: 'DRUG_TRANSFER_PROPOSAL',
        title: `Transfer ${args.qty} of ${args.drug}`,
        description: 'Auto-balanced transfer',
        summary: { drug: args.drug, qty: args.qty },
        actionApi: {
          endpoint: '/api/v1/transfer',
          method: 'POST',
          payload: { drug: args.drug, qty: args.qty },
        },
      },
    }),
  });

  let callCount = 0;
  const mockProvider: ILLMProvider = {
    providerType: 'MOCK',
    testConnection: async () => ({ success: true, latencyMs: 5, message: 'ok', modelId: 'mock' }),
    chat: async () => {
      callCount++;
      if (callCount === 1) {
        return {
          model: 'mock-model',
          content: null,
          toolCalls: [
            {
              id: 'call_prop_1',
              type: 'function',
              function: {
                name: 'submit_transfer_proposal',
                arguments: JSON.stringify({ drug: 'DAT-01', qty: 10 }),
              },
            },
          ],
        };
      }
      return {
        model: 'mock-model',
        content: 'Transfer proposal has been prepared for authorization.',
      };
    },
  };

  const engine = new ReActEngine();
  const events: ReActExecutionEvent[] = [];

  const result = await engine.execute({
    messages: [{ role: 'user', content: 'Transfer DAT-01' }],
    context: { role: 'PHARMACIST' },
    providerOverride: mockProvider,
    registryOverride: registry,
    onEvent: (e) => events.push(e),
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].title, 'Transfer 10 of DAT-01');
  assert.equal(events.some((e) => e.type === 'proposal'), true);
});

test('ReActEngine guards against infinite loops (max 5 iterations limit)', async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'infinite_tool',
    description: 'Always loops',
    parameters: z.object({}),
    allowedRoles: ['*'],
    execute: async () => ({ success: true, data: { status: 'looping' } }),
  });

  // Model that stubbornly keeps calling tool on every turn
  const loopingProvider: ILLMProvider = {
    providerType: 'MOCK',
    testConnection: async () => ({ success: true, latencyMs: 5, message: 'ok', modelId: 'mock' }),
    chat: async () => ({
      model: 'mock-model',
      content: null,
      toolCalls: [
        {
          id: `loop_${Math.random()}`,
          type: 'function',
          function: { name: 'infinite_tool', arguments: '{}' },
        },
      ],
    }),
  };

  const engine = new ReActEngine();
  const result = await engine.execute({
    messages: [{ role: 'user', content: 'Loop forever' }],
    context: { role: 'PHARMACIST' },
    providerOverride: loopingProvider,
    registryOverride: registry,
    maxIterations: 5,
  });

  assert.equal(result.iterations, 5);
  assert.equal(result.abortedDueToLimit, true);
  assert.match(result.finalResponse, /maximum allowed tool iterations/);
});
