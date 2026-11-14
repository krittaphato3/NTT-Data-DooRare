import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReActEngine } from '../src/modules/ai/engine/react.engine.js';
import type { ILLMProvider, LLMResponse } from '../src/modules/ai/providers/types.js';
import type { ToolRegistry } from '../src/modules/ai/tools/registry.js';
import type { RequestContext } from '../src/modules/ai/tools/tool.types.js';

const STOCK_TOOL = {
  name: 'get_stock_and_alerts',
  description: 'Reads stock levels and active stock alerts.',
  parameters: { type: 'object', properties: {} },
};

test('engine: a repeated identical tool call is served from the per-turn cache', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async (): Promise<LLMResponse> => {
      chatCalls++;
      if (chatCalls <= 2) {
        return {
          model: 'fake',
          content: null,
          toolCalls: [
            {
              id: `call_${chatCalls}`,
              type: 'function',
              function: { name: 'get_stock_and_alerts', arguments: '{"drugId":"d-1"}' },
            },
          ],
        };
      }
      return { model: 'fake', content: 'done' };
    },
  } as unknown as ILLMProvider;

  let executed = 0;
  const seenArgs: unknown[] = [];
  const registry = {
    getToolDefinitionsForRole: () => [STOCK_TOOL],
    executeTool: async (_name: string, args: unknown) => {
      executed++;
      seenArgs.push(args);
      return { success: true, data: { ok: true } };
    },
  } as unknown as ToolRegistry;

  const events: any[] = [];
  const result = await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'สต็อกยาตัวไหนใกล้ ROP' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
    onEvent: (event) => {
      events.push(event);
    },
  });

  assert.equal(result.finalResponse, 'done');
  assert.equal(executed, 1, 'a repeated identical call must not hit the database twice');
  assert.equal(result.toolExecutionCount, 1);
  assert.equal(result.stagedTools.length, 1);

  const toolEnds = events.filter((e) => e.type === 'tool_end');
  assert.equal(toolEnds.length, 2);
  assert.equal(toolEnds[0].cached, false);
  assert.equal(toolEnds[1].cached, true);
});

test('engine: argument key order does not defeat the cache', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async (): Promise<LLMResponse> => {
      chatCalls++;
      if (chatCalls <= 2) {
        return {
          model: 'fake',
          content: null,
          toolCalls: [
            {
              id: `call_${chatCalls}`,
              type: 'function',
              // Same tool, different key order on the second turn: sorted keys must still collide.
              function: {
                name: 'get_stock_and_alerts',
                arguments: chatCalls === 1 ? '{"drugId":"d-1","limit":5}' : '{"limit":5,"drugId":"d-1"}',
              },
            },
          ],
        };
      }
      return { model: 'fake', content: 'done' };
    },
  } as unknown as ILLMProvider;

  let executed = 0;
  const registry = {
    getToolDefinitionsForRole: () => [STOCK_TOOL],
    executeTool: async () => {
      executed++;
      return { success: true, data: { ok: true } };
    },
  } as unknown as ToolRegistry;

  await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'สต็อกยาตัวไหนใกล้ ROP' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
  });

  assert.equal(executed, 1, 'key order must not defeat the cache');
});

test('engine: different arguments do execute again', async () => {
  let chatCalls = 0;
  const provider = {
    chat: async (): Promise<LLMResponse> => {
      chatCalls++;
      if (chatCalls <= 2) {
        return {
          model: 'fake',
          content: null,
          toolCalls: [
            {
              id: `call_${chatCalls}`,
              type: 'function',
              function: {
                name: 'get_stock_and_alerts',
                arguments: chatCalls === 1 ? '{"drugId":"d-1"}' : '{"drugId":"d-2"}',
              },
            },
          ],
        };
      }
      return { model: 'fake', content: 'done' };
    },
  } as unknown as ILLMProvider;

  let executed = 0;
  const registry = {
    getToolDefinitionsForRole: () => [STOCK_TOOL],
    executeTool: async () => {
      executed++;
      return { success: true, data: { ok: true } };
    },
  } as unknown as ToolRegistry;

  await new ReActEngine().execute({
    messages: [{ role: 'user', content: 'สต็อกยาตัวไหนใกล้ ROP' }],
    context: { role: 'PHARMACIST', hospitalId: 'h-1', userId: 'u-1' } as RequestContext,
    providerOverride: provider,
    registryOverride: registry,
  });

  assert.equal(executed, 2);
});
