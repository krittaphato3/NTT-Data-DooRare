import crypto from 'node:crypto';
import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  LLMUsage,
  ProviderConnectionResult,
  ToolCall,
  ToolDefinition,
} from './types.js';

export interface AwsSigV4Options {
  method: string;
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  headers?: Record<string, string>;
  body?: string;
  timestamp?: Date;
}

/** RFC 3986 encoding for AWS SigV4 path and query elements */
export function rfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Signs an HTTP request using AWS Signature Version 4 (AWS4-HMAC-SHA256).
 * Pure Node.js crypto implementation with no external dependencies.
 */
export function signAwsRequest(options: AwsSigV4Options): Record<string, string> {
  const {
    method,
    url: rawUrl,
    region,
    service,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    body = '',
    timestamp = new Date(),
  } = options;

  const url = new URL(rawUrl);
  const host = url.host;

  // Format dates: ISO 8601 basic format (YYYYMMDDTHHMMSSZ)
  const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Payload hash
  const payloadHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');

  // Headers to sign (lowercase keys)
  const headersToSign: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  if (body) {
    headersToSign['content-type'] = 'application/json';
  }

  if (sessionToken) {
    headersToSign['x-amz-security-token'] = sessionToken;
  }

  // Merge any custom headers (lowercasing keys and trimming values)
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headersToSign[k.toLowerCase()] = v.trim();
    }
  }

  // Sorted header keys
  const sortedHeaderKeys = Object.keys(headersToSign).sort();

  // Canonical headers string: each header followed by \n
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headersToSign[k]}\n`)
    .join('');

  // Signed headers string (semicolon-separated)
  const signedHeaders = sortedHeaderKeys.join(';');

  // Canonical URI: each path segment RFC 3986 encoded
  const canonicalUri =
    url.pathname
      .split('/')
      .map((segment) => rfc3986Encode(decodeURIComponent(segment)))
      .join('/') || '/';

  // Canonical query string
  const queryEntries: string[] = [];
  url.searchParams.forEach((val, key) => {
    queryEntries.push(`${rfc3986Encode(key)}=${rfc3986Encode(val)}`);
  });
  queryEntries.sort();
  const canonicalQueryString = queryEntries.join('&');

  // Step 1: Create Canonical Request
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Step 2: Create String to Sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = crypto
    .createHash('sha256')
    .update(canonicalRequest, 'utf8')
    .digest('hex');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // Step 3: Calculate signature using 4-tier HMAC-SHA256 key derivation
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp, 'utf8').digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region, 'utf8').digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service, 'utf8').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request', 'utf8').digest();

  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  // Step 4: Build Authorization header
  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headersToSign,
    authorization: authorizationHeader,
  };
}

export interface BedrockContentBlock {
  text?: string;
  toolUse?: {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
  };
  toolResult?: {
    toolUseId: string;
    content: Array<{ text?: string; json?: Record<string, unknown> }>;
    status?: 'success' | 'error';
  };
}

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: BedrockContentBlock[];
}

export interface BedrockConversePayload {
  messages: BedrockMessage[];
  system?: Array<{ text: string }>;
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: number;
  };
  toolConfig?: {
    tools: Array<{
      toolSpec: {
        name: string;
        description: string;
        inputSchema: {
          json: Record<string, unknown>;
        };
      };
    }>;
  };
}

/**
 * Formats chat messages and options into Bedrock Converse API request payload.
 * Enforces Bedrock's strict alternating user/assistant message order and non-empty content constraints.
 */
export function formatBedrockPayload(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  options?: ChatOptions,
): BedrockConversePayload {
  const systemPrompts: string[] = [];
  const rawTurns: BedrockMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content && m.content.trim().length > 0) {
        systemPrompts.push(m.content.trim());
      }
      continue;
    }

    if (m.role === 'tool') {
      let contentBlocks: Array<{ text?: string; json?: Record<string, unknown> }>;
      let parsedJson: Record<string, unknown> | null = null;
      try {
        if (m.content && (m.content.startsWith('{') || m.content.startsWith('['))) {
          parsedJson = JSON.parse(m.content);
        }
      } catch {
        parsedJson = null;
      }

      if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        contentBlocks = [{ json: parsedJson }];
      } else {
        contentBlocks = [{ text: m.content || ' ' }];
      }

      rawTurns.push({
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: m.tool_call_id || 'tool_call',
              content: contentBlocks,
              status: 'success',
            },
          },
        ],
      });
      continue;
    }

    if (m.role === 'assistant') {
      const contentBlocks: BedrockContentBlock[] = [];
      if (m.content && m.content.length > 0) {
        contentBlocks.push({ text: m.content });
      }
      if (m.tool_calls && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput =
              typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments || {};
          } catch {
            parsedInput = {};
          }
          contentBlocks.push({
            toolUse: {
              toolUseId: tc.id,
              name: tc.function.name,
              input: parsedInput,
            },
          });
        }
      }
      if (contentBlocks.length === 0) {
        contentBlocks.push({ text: ' ' });
      }
      rawTurns.push({ role: 'assistant', content: contentBlocks });
      continue;
    }

    // Role is user
    rawTurns.push({
      role: 'user',
      content: [{ text: m.content || ' ' }],
    });
  }

  // Merge consecutive turns of the same role (Bedrock requires strict alternation)
  const sanitizedMessages: BedrockMessage[] = [];
  for (const turn of rawTurns) {
    if (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role === turn.role) {
      sanitizedMessages[sanitizedMessages.length - 1].content.push(...turn.content);
    } else {
      sanitizedMessages.push(turn);
    }
  }

  // Bedrock requires the conversation to end with a user message
  if (sanitizedMessages.length === 0) {
    sanitizedMessages.push({ role: 'user', content: [{ text: 'Hello' }] });
  } else if (sanitizedMessages[sanitizedMessages.length - 1].role !== 'user') {
    sanitizedMessages.push({ role: 'user', content: [{ text: 'Continue' }] });
  }

  const payload: BedrockConversePayload = {
    messages: sanitizedMessages,
    inferenceConfig: {
      maxTokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.2,
    },
  };

  if (systemPrompts.length > 0) {
    payload.system = systemPrompts.map((text) => ({ text }));
  }

  if (tools && tools.length > 0) {
    payload.toolConfig = {
      tools: tools.map((t) => ({
        toolSpec: {
          name: t.name,
          description: t.description || t.name || 'Tool execution',
          inputSchema: {
            json: (t.parameters as Record<string, unknown>) || { type: 'object', properties: {} },
          },
        },
      })),
    };
  }

  return payload;
}

interface BedrockConverseApiResponse {
  output?: {
    message?: {
      role?: string;
      content?: Array<{
        text?: string;
        toolUse?: {
          toolUseId: string;
          name: string;
          input: Record<string, unknown>;
        };
      }>;
    };
  };
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export class BedrockProvider implements ILLMProvider {
  readonly providerType = 'AWS_BEDROCK' as const;
  private readonly config: AIConfig;
  private readonly region: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.region = config.credentials.awsRegion?.trim() || process.env.AWS_REGION?.trim() || 'ap-southeast-1';
  }

  private getCredentials(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
    const creds = this.config.credentials;
    const accessKeyId = creds.awsAccessKeyId?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || '';
    const secretAccessKey = creds.awsSecretAccessKey?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || '';
    const sessionToken =
      (creds as Record<string, unknown>).awsSessionToken?.toString().trim() ||
      process.env.AWS_SESSION_TOKEN?.trim() ||
      undefined;

    return { accessKeyId, secretAccessKey, sessionToken };
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const model =
      this.config.modelFast ||
      this.config.modelPrimary ||
      'anthropic.claude-3-5-haiku-20241022-v1:0';
    const start = Date.now();

    const { accessKeyId, secretAccessKey, sessionToken } = this.getCredentials();

    if (!accessKeyId || !secretAccessKey) {
      return {
        success: false,
        latencyMs: 0,
        message: 'AWS credentials (awsAccessKeyId / awsSecretAccessKey) not configured for Bedrock.',
        modelId: model,
      };
    }

    try {
      const payloadObj = {
        messages: [
          {
            role: 'user',
            content: [{ text: 'ping' }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1,
          temperature: 0,
        },
      };
      const body = JSON.stringify(payloadObj);
      const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;

      const headers = signAwsRequest({
        method: 'POST',
        url: endpoint,
        region: this.region,
        service: 'bedrock',
        accessKeyId,
        secretAccessKey,
        sessionToken,
        body,
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          message?: string;
          messageDetail?: string;
          __type?: string;
        };
        const errMsg =
          errJson.message ||
          errJson.messageDetail ||
          `Bedrock returned HTTP ${res.status} ${res.statusText}`;
        return {
          success: false,
          latencyMs,
          message: errMsg,
          modelId: model,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `Amazon Bedrock connected successfully in ${this.region} (${model})`,
        modelId: model,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        message: `Bedrock connection failed: ${message}`,
        modelId: model,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const model =
      options?.model ||
      this.config.modelPrimary ||
      'anthropic.claude-3-5-sonnet-20241022-v2:0';

    const { accessKeyId, secretAccessKey, sessionToken } = this.getCredentials();

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS Bedrock credentials (awsAccessKeyId / awsSecretAccessKey) are not configured');
    }

    const payloadObj = formatBedrockPayload(messages, tools, options);
    const body = JSON.stringify(payloadObj);
    const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;

    const headers = signAwsRequest({
      method: 'POST',
      url: endpoint,
      region: this.region,
      service: 'bedrock',
      accessKeyId,
      secretAccessKey,
      sessionToken,
      body,
    });

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`AWS Bedrock network error: ${msg}`);
    }

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as {
        message?: string;
        messageDetail?: string;
        __type?: string;
      };
      const errMsg =
        errJson.message ||
        errJson.messageDetail ||
        `AWS Bedrock request failed: HTTP ${res.status} ${res.statusText}`;
      throw new Error(errMsg);
    }

    const data = (await res.json()) as BedrockConverseApiResponse;
    const contentBlocks = data.output?.message?.content || [];

    let textContent: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of contentBlocks) {
      if (block.text) {
        textContent = (textContent ? `${textContent}\n` : '') + block.text;
      }
      if (block.toolUse) {
        toolCalls.push({
          id: block.toolUse.toolUseId,
          type: 'function',
          function: {
            name: block.toolUse.name,
            arguments: JSON.stringify(block.toolUse.input || {}),
          },
        });
      }
    }

    const usage: LLMUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.inputTokens ?? 0,
          completionTokens: data.usage.outputTokens ?? 0,
          totalTokens:
            data.usage.totalTokens ??
            (data.usage.inputTokens ?? 0) + (data.usage.outputTokens ?? 0),
        }
      : undefined;

    return {
      model,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
