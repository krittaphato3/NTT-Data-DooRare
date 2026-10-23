/**
 * BYOK and Multi-Provider LLM Gateway Unit Tests (Person 1)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { maskSecretKey, validateAiConfig } from '../src/modules/ai/byok/byok.utils.js';
import { MockProvider } from '../src/modules/ai/providers/mock.provider.js';
import { LLMProviderFactory } from '../src/modules/ai/providers/factory.js';
import type { AIConfig } from '../src/modules/ai/byok/byok.types.js';

test('byok.utils: maskSecretKey masks API keys without leaking plain text', () => {
  assert.equal(maskSecretKey(''), '');
  assert.equal(maskSecretKey(undefined), '');
  assert.equal(maskSecretKey('short'), '••••');

  const openAiKey = 'sk-proj-1234567890abcdef1234567890';
  const masked = maskSecretKey(openAiKey);
  assert.ok(!masked.includes('1234567890abcdef'), 'masked key must not leak the middle payload');
  assert.ok(masked.startsWith('sk-'), 'masked key preserves sk- prefix');
  assert.ok(masked.endsWith('890'), 'masked key shows last few characters');
});

test('byok.utils: validateAiConfig validates provider and budget constraints', () => {
  const valid: AIConfig = {
    provider: 'MOCK',
    modelPrimary: 'mock-reasoning-v1',
    modelFast: 'mock-fast-v1',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 12.5,
    credentials: {},
  };
  assert.doesNotThrow(() => validateAiConfig(valid));

  // Invalid budget
  assert.throws(
    () => validateAiConfig({ ...valid, monthlyBudgetUsd: -10 }),
    /budget must be a positive number/i,
  );

  // Invalid provider
  assert.throws(
    () => validateAiConfig({ ...valid, provider: 'UNSUPPORTED' as any }),
    /unsupported ai provider/i,
  );
});

test('mock.provider: executes connection test with latency and models', async () => {
  const provider = new MockProvider({
    provider: 'MOCK',
    modelPrimary: 'mock-model-primary',
    modelFast: 'mock-model-fast',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {},
  });

  const res = await provider.testConnection();
  assert.equal(res.success, true);
  assert.ok(res.latencyMs >= 0);
  assert.equal(res.modelId, 'mock-model-primary');
  assert.ok(res.message.includes('Mock AI provider connected'));
});

test('mock.provider: handles chat completion and tool calling output', async () => {
  const provider = new MockProvider({
    provider: 'MOCK',
    modelPrimary: 'mock-model-primary',
    modelFast: 'mock-model-fast',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {},
  });

  const reply = await provider.chat([
    { role: 'user', content: 'Where is the urgent antidote?' },
  ]);
  assert.ok(reply.content !== null || (reply.toolCalls && reply.toolCalls.length > 0));
  assert.ok(reply.usage);
  assert.ok(reply.usage.totalTokens > 0);
});

test('factory: blocks execution when agent kill-switch is triggered', async () => {
  const factory = new LLMProviderFactory();
  
  // When agent is enabled, getting provider succeeds
  const provider = factory.getProvider({
    config: {
      provider: 'MOCK',
      modelPrimary: 'mock-primary',
      modelFast: 'mock-fast',
      monthlyBudgetUsd: 100,
      estimatedSpendUsd: 0,
      credentials: {},
    },
    agentEnabled: true,
  });
  assert.ok(provider);

  // When agent is disabled via kill switch, factory throws an error
  assert.throws(
    () =>
      factory.getProvider({
        config: {
          provider: 'MOCK',
          modelPrimary: 'mock-primary',
          modelFast: 'mock-fast',
          monthlyBudgetUsd: 100,
          estimatedSpendUsd: 0,
          credentials: {},
        },
        agentEnabled: false,
      }),
    /kill switch/i,
  );
});

test('factory: caches provider and invalidates on config update', () => {
  const factory = new LLMProviderFactory();
  const cfg1: AIConfig = {
    provider: 'MOCK',
    modelPrimary: 'mock-1',
    modelFast: 'mock-fast',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {},
  };

  const p1 = factory.getProvider({ config: cfg1, agentEnabled: true });
  const p2 = factory.getProvider({ config: cfg1, agentEnabled: true });
  assert.equal(p1, p2, 'factory should return cached instance for identical config');

  const cfg2: AIConfig = {
    ...cfg1,
    modelPrimary: 'mock-2-changed',
  };
  const p3 = factory.getProvider({ config: cfg2, agentEnabled: true });
  assert.notEqual(p1, p3, 'factory should return new instance when config changes');
});

test('openai.provider: catches missing api key in testConnection', async () => {
  const { OpenAIProvider } = await import('../src/modules/ai/providers/openai.provider.js');
  const provider = new OpenAIProvider({
    provider: 'OPENAI',
    modelPrimary: 'gpt-4o',
    modelFast: 'gpt-4o-mini',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: { apiKey: '' },
  });

  const res = await provider.testConnection();
  assert.equal(res.success, false);
  assert.ok(res.message.includes('missing') || res.message.includes('configure'));
});

test('anthropic.provider: catches missing api key in testConnection', async () => {
  const { AnthropicProvider } = await import('../src/modules/ai/providers/anthropic.provider.js');
  const provider = new AnthropicProvider({
    provider: 'ANTHROPIC',
    modelPrimary: 'claude-3-5-sonnet-20241022',
    modelFast: 'claude-3-5-haiku-20241022',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: { apiKey: '' },
  });

  const res = await provider.testConnection();
  assert.equal(res.success, false);
  assert.ok(res.message.includes('missing') || res.message.includes('configure'));
});

test('byok.service: returns default configuration with mock defaults', async () => {
  const { byokService } = await import('../src/modules/ai/byok/byok.service.js');
  const defaults = byokService.getDefaultConfig();
  assert.ok(defaults.provider);
  assert.ok(defaults.modelPrimary);
  assert.ok(defaults.monthlyBudgetUsd >= 0);
  assert.equal(defaults.streamingEnabled, true, 'streaming must be enabled by default');
});

test('byok.service: validates reason requirement on update', async () => {
  const { byokService } = await import('../src/modules/ai/byok/byok.service.js');
  const reqWithoutReason: any = {
    user: { id: '00000000-0000-0000-0000-000000000000', role: 'SYSTEM_ADMIN' },
    body: { provider: 'MOCK', reason: '  ' },
  };

  await assert.rejects(
    async () => byokService.updateConfig(reqWithoutReason),
    /reason/i,
  );
});

test('custom.provider: validates endpoint and constructs path correctly', async () => {
  const { CustomProvider } = await import('../src/modules/ai/providers/custom.provider.js');

  // 1. Missing endpoint validation
  const missingEndpoint = new CustomProvider({
    provider: 'CUSTOM',
    modelPrimary: 'custom-model',
    modelFast: 'custom-model-fast',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {},
  });
  const res1 = await missingEndpoint.testConnection();
  assert.equal(res1.success, false);
  assert.ok(res1.message.includes('endpoint'));

  // 2. URL construction for multiple path choices
  const chatCompletions = new CustomProvider({
    provider: 'CUSTOM',
    modelPrimary: 'deepseek-chat',
    modelFast: 'deepseek-chat',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {
      customEndpoint: 'https://api.custom-ai.com/v1/',
      customApiPath: '/chat/completions',
    },
  });
  assert.equal(chatCompletions.getFullUrl(), 'https://api.custom-ai.com/v1/chat/completions');

  const responsesPath = new CustomProvider({
    provider: 'CUSTOM',
    modelPrimary: 'local-llm',
    modelFast: 'local-llm',
    monthlyBudgetUsd: 100,
    estimatedSpendUsd: 0,
    credentials: {
      customEndpoint: 'http://localhost:8000',
      customApiPath: '/responses',
    },
  });
  assert.equal(responsesPath.getFullUrl(), 'http://localhost:8000/responses');
});


