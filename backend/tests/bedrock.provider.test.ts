/**
 * Bedrock Provider & AWS SigV4 unit tests.
 * Exercises SigV4 request signing, Bedrock Converse API formatting, response parsing, and error paths.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BedrockProvider,
  formatBedrockPayload,
  rfc3986Encode,
  signAwsRequest,
} from '../src/modules/ai/providers/bedrock.provider.js';
import type { AIConfig } from '../src/modules/ai/byok/byok.types.js';
import type { ChatMessage, ToolDefinition } from '../src/modules/ai/providers/types.js';

const mockConfig: AIConfig = {
  provider: 'AWS_BEDROCK',
  modelPrimary: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  modelFast: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  monthlyBudgetUsd: 100,
  estimatedSpendUsd: 0,
  credentials: {
    awsRegion: 'ap-southeast-1',
    awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
};

test('rfc3986Encode: encodes RFC3986 reserved characters', () => {
  assert.equal(rfc3986Encode('abc-123_.~'), 'abc-123_.~');
  assert.equal(rfc3986Encode('foo bar!*()'), 'foo%20bar%21%2A%28%29');
  assert.equal(rfc3986Encode('model:v1'), 'model%3Av1');
});

test('signAwsRequest: generates valid SigV4 headers and deterministic signature', () => {
  const timestamp = new Date('2026-11-17T00:00:00.000Z');
  const headers = signAwsRequest({
    method: 'POST',
    url: 'https://bedrock-runtime.ap-southeast-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2:0/converse',
    region: 'ap-southeast-1',
    service: 'bedrock',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    body: JSON.stringify({ ping: true }),
    timestamp,
  });

  assert.equal(headers.host, 'bedrock-runtime.ap-southeast-1.amazonaws.com');
  assert.equal(headers['x-amz-date'], '20261117T000000Z');
  assert.ok(headers['x-amz-content-sha256'], 'must have content sha256');
  assert.equal(headers['content-type'], 'application/json');

  const auth = headers.authorization;
  assert.ok(auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261117/ap-southeast-1/bedrock/aws4_request'));
  assert.ok(auth.includes('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date'));
  assert.ok(auth.includes('Signature='));
});

test('signAwsRequest: includes session token when provided', () => {
  const headers = signAwsRequest({
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test/converse',
    region: 'us-east-1',
    service: 'bedrock',
    accessKeyId: 'ASIATEST',
    secretAccessKey: 'testsecret',
    sessionToken: 'testsessiontoken123',
    body: '',
  });

  assert.equal(headers['x-amz-security-token'], 'testsessiontoken123');
  assert.ok(headers.authorization.includes('x-amz-security-token'));
});

test('formatBedrockPayload: extracts system prompt and handles alternating messages', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an AI assistant.' },
    { role: 'user', content: 'Hello' },
    { role: 'user', content: 'Second question' },
    { role: 'assistant', content: 'Response' },
    { role: 'user', content: 'Follow up' },
  ];

  const payload = formatBedrockPayload(messages, undefined, { maxTokens: 500, temperature: 0.5 });

  assert.deepEqual(payload.system, [{ text: 'You are an AI assistant.' }]);
  assert.equal(payload.inferenceConfig?.maxTokens, 500);
  assert.equal(payload.inferenceConfig?.temperature, 0.5);

  // Consecutive user messages are merged into 1 user turn
  assert.equal(payload.messages.length, 3);
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[0].content.length, 2);
  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[2].role, 'user');
});

test('formatBedrockPayload: formats tools into toolConfig and toolResults into user message', () => {
  const tools: ToolDefinition[] = [
    {
      name: 'check_stock',
      description: 'Check hospital stock level',
      parameters: {
        type: 'object',
        properties: { hospitalId: { type: 'string' } },
        required: ['hospitalId'],
      },
    },
  ];

  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      content: 'Calling tool',
      tool_calls: [
        {
          id: 'call_99',
          type: 'function',
          function: { name: 'check_stock', arguments: '{"hospitalId":"h1"}' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call_99',
      content: JSON.stringify({ available: 15 }),
    },
  ];

  const payload = formatBedrockPayload(messages, tools);

  assert.ok(payload.toolConfig);
  assert.equal(payload.toolConfig.tools[0].toolSpec.name, 'check_stock');
  assert.equal(payload.toolConfig.tools[0].toolSpec.description, 'Check hospital stock level');

  // Tool response is wrapped in toolResult block under role 'user'
  const lastMsg = payload.messages[payload.messages.length - 1];
  assert.equal(lastMsg.role, 'user');
  assert.ok(lastMsg.content[0].toolResult);
  assert.equal(lastMsg.content[0].toolResult?.toolUseId, 'call_99');
});

test('BedrockProvider: testConnection returns error when credentials missing', async () => {
  const emptyConfig: AIConfig = {
    ...mockConfig,
    credentials: {},
  };
  const provider = new BedrockProvider(emptyConfig);
  const result = await provider.testConnection();

  assert.equal(result.success, false);
  assert.ok(result.message.includes('not configured'));
});

test('BedrockProvider: chat throws when credentials missing', async () => {
  const emptyConfig: AIConfig = {
    ...mockConfig,
    credentials: {},
  };
  const provider = new BedrockProvider(emptyConfig);

  await assert.rejects(
    async () => provider.chat([{ role: 'user', content: 'hi' }]),
    /AWS Bedrock credentials/
  );
});

test('BedrockProvider: testConnection succeeds on HTTP 200 response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      assert.ok(url.includes('bedrock-runtime.ap-southeast-1.amazonaws.com'));
      assert.ok(init?.headers);
      const headers = init.headers as Record<string, string>;
      assert.ok(headers.authorization?.startsWith('AWS4-HMAC-SHA256'));

      return new Response(
        JSON.stringify({
          output: { message: { role: 'assistant', content: [{ text: 'pong' }] } },
          usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const provider = new BedrockProvider(mockConfig);
    const result = await provider.testConnection();

    assert.equal(result.success, true);
    assert.ok(result.message.includes('Amazon Bedrock connected successfully'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BedrockProvider: testConnection handles HTTP 403 AccessDeniedException', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          __type: 'AccessDeniedException',
          message: 'User is not authorized to perform: bedrock:InvokeModel',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const provider = new BedrockProvider(mockConfig);
    const result = await provider.testConnection();

    assert.equal(result.success, false);
    assert.ok(result.message.includes('not authorized'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BedrockProvider: chat parses content and tool calls from Bedrock Converse', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [
                { text: 'Checking the inventory.' },
                {
                  toolUse: {
                    toolUseId: 'call_123',
                    name: 'get_stock',
                    input: { drugId: 'd-101' },
                  },
                },
              ],
            },
          },
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const provider = new BedrockProvider(mockConfig);
    const res = await provider.chat([{ role: 'user', content: 'What is stock?' }]);

    assert.equal(res.content, 'Checking the inventory.');
    assert.equal(res.toolCalls?.length, 1);
    assert.equal(res.toolCalls[0].id, 'call_123');
    assert.equal(res.toolCalls[0].function.name, 'get_stock');
    assert.equal(res.toolCalls[0].function.arguments, '{"drugId":"d-101"}');
    assert.equal(res.usage?.totalTokens, 65);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
