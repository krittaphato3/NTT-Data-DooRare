import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolCall,
  ToolDefinition,
} from './types.js';

/** Default Bedrock model: Amazon Nova Lite (cheap, works through Converse without extra model access in most accounts). */
const DEFAULT_MODEL = 'amazon.nova-lite-v1:0';
const REQUEST_TIMEOUT_MS = 60_000;

/** Claude 5.x goes through the Anthropic Messages (Mantle) endpoint; every other model (Nova, Haiku 4.5, ...) uses Converse. */
export function usesMantle(model: string): boolean {
  return /anthropic\.claude-[a-z]+-5-\d/.test(model);
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}

function parseArgs(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Maps the provider-neutral chat history to the Messages API shape (system split out, tool turns as blocks). */
export function toBedrockRequest(messages: ChatMessage[]): { system?: string; messages: BedrockMessage[] } {
  const system: string[] = [];
  const out: BedrockMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) system.push(m.content);
    } else if (m.role === 'tool') {
      out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content ?? '' }] });
    } else if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.tool_calls) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      // The API rejects empty text, so a blank assistant turn gets a placeholder.
      out.push({ role: m.role, content: m.content || (m.role === 'assistant' ? '(no response)' : '') });
    }
  }
  return { system: system.length ? system.join('\n\n') : undefined, messages: out };
}

type ConverseMessages = NonNullable<ConverseCommandInput['messages']>;
type ConverseContent = NonNullable<ConverseMessages[number]['content']>;

/** Maps the neutral chat history to Converse (system split out; same-role turns merged, since Converse needs alternation). */
export function toConverseRequest(messages: ChatMessage[]): { system?: { text: string }[]; messages: ConverseMessages } {
  const system: { text: string }[] = [];
  const out: ConverseMessages = [];
  const push = (role: 'user' | 'assistant', content: ConverseContent): void => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = [...(last.content ?? []), ...content];
    else out.push({ role, content });
  };
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) system.push({ text: m.content });
    } else if (m.role === 'tool') {
      push('user', [{ toolResult: { toolUseId: m.tool_call_id ?? '', content: [{ text: m.content || '(empty)' }] } }]);
    } else if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks: ConverseContent = [];
      if (m.content) blocks.push({ text: m.content });
      for (const call of m.tool_calls) {
        blocks.push({ toolUse: { toolUseId: call.id, name: call.function.name, input: parseArgs(call.function.arguments) as never } });
      }
      push('assistant', blocks);
    } else {
      push(m.role === 'assistant' ? 'assistant' : 'user', [{ text: m.content || (m.role === 'assistant' ? '(no response)' : '(empty)') }]);
    }
  }
  return { system: system.length ? system : undefined, messages: out };
}

/** The slice of the Converse client we use (lets tests inject a stub). */
export interface ConverseSender {
  send(command: ConverseCommand): Promise<{
    output?: { message?: { content?: Array<{ text?: string; toolUse?: { toolUseId?: string; name?: string; input?: unknown } }> } };
    usage?: { inputTokens?: number; outputTokens?: number };
    stopReason?: string;
  }>;
}

/**
 * Amazon Bedrock. Claude 5.x uses the Anthropic Messages (Mantle) endpoint; other models (Amazon Nova, Haiku 4.5, ...) use Converse.
 *
 * Auth: Access Key + Secret (+ AWS_SESSION_TOKEN when the key is the env key) from BYOK when both are set, otherwise the default
 * AWS chain (env keys, `AWS_BEARER_TOKEN_BEDROCK`, EC2 role). Haiku 5.5 rejects non-default sampling parameters, so the Mantle
 * path never sends `temperature`; `effort: low` keeps short JSON tasks cheap (thinking tokens are billed as output).
 */
export class BedrockProvider implements ILLMProvider {
  readonly providerType = 'AWS_BEDROCK' as const;
  private readonly config: AIConfig;
  private readonly region: string;
  private client: AnthropicBedrockMantle | null;
  private converse: ConverseSender | null;

  constructor(config: AIConfig, client?: AnthropicBedrockMantle, converse?: ConverseSender) {
    this.config = config;
    this.region = config.credentials.awsRegion || process.env.AWS_REGION || 'ap-southeast-1';
    this.client = client ?? null;
    this.converse = converse ?? null;
  }

  /** Explicit BYOK keys, with the session token when they are the temporary env keys. */
  private explicitCredentials(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | null {
    const key = this.config.credentials.awsAccessKeyId?.trim();
    const secret = this.config.credentials.awsSecretAccessKey?.trim();
    if (!key || !secret) return null;
    const sessionToken = key === process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_SESSION_TOKEN?.trim() : undefined;
    return { accessKeyId: key, secretAccessKey: secret, ...(sessionToken ? { sessionToken } : {}) };
  }

  private getClient(): AnthropicBedrockMantle {
    if (!this.client) {
      const creds = this.explicitCredentials();
      this.client = new AnthropicBedrockMantle({
        awsRegion: this.region,
        timeout: REQUEST_TIMEOUT_MS,
        ...(creds
          ? {
              awsAccessKey: creds.accessKeyId,
              awsSecretAccessKey: creds.secretAccessKey,
              ...(creds.sessionToken ? { awsSessionToken: creds.sessionToken } : {}),
            }
          : {}),
      });
    }
    return this.client;
  }

  private getConverse(): ConverseSender {
    if (!this.converse) {
      const creds = this.explicitCredentials();
      this.converse = new BedrockRuntimeClient({
        region: this.region,
        requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
        ...(creds ? { credentials: creds } : {}),
      }) as unknown as ConverseSender;
    }
    return this.converse;
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const model = this.config.modelFast || this.config.modelPrimary || DEFAULT_MODEL;
    const start = Date.now();
    try {
      await this.chat([{ role: 'user', content: 'ping' }], [], { model, maxTokens: 16 });
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Amazon Bedrock connected in ${this.region} (${model})`,
        modelId: model,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Bedrock connection failed (${this.region}, ${model}): ${message}`,
        modelId: model,
      };
    }
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[], options?: ChatOptions): Promise<LLMResponse> {
    const model = options?.model || this.config.modelPrimary || DEFAULT_MODEL;
    return usesMantle(model) ? this.chatMantle(model, messages, tools, options) : this.chatConverse(model, messages, tools, options);
  }

  private async chatConverse(model: string, messages: ChatMessage[], tools?: ToolDefinition[], options?: ChatOptions): Promise<LLMResponse> {
    const request = toConverseRequest(messages);
    const command = new ConverseCommand({
      modelId: model,
      messages: request.messages,
      ...(request.system ? { system: request.system } : {}),
      inferenceConfig: {
        maxTokens: options?.maxTokens ?? 1024,
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
      ...(tools && tools.length > 0
        ? {
            toolConfig: {
              tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.parameters as never } } })),
            },
          }
        : {}),
    });
    const res = await this.getConverse().send(command);

    let text: string | null = null;
    const toolCalls: ToolCall[] = [];
    for (const block of res.output?.message?.content ?? []) {
      if (block.text) {
        text = (text ? `${text}\n` : '') + block.text;
      } else if (block.toolUse) {
        toolCalls.push({
          id: block.toolUse.toolUseId ?? '',
          type: 'function',
          function: { name: block.toolUse.name ?? '', arguments: JSON.stringify(block.toolUse.input ?? {}) },
        });
      }
    }
    const input = res.usage?.inputTokens ?? 0;
    const output = res.usage?.outputTokens ?? 0;
    return {
      model,
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { promptTokens: input, completionTokens: output, totalTokens: input + output },
    };
  }

  private async chatMantle(model: string, messages: ChatMessage[], tools?: ToolDefinition[], options?: ChatOptions): Promise<LLMResponse> {
    const request = toBedrockRequest(messages);

    const res = await this.getClient().messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      output_config: { effort: 'low' },
      messages: request.messages,
      ...(request.system ? { system: request.system } : {}),
      ...(tools && tools.length > 0
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
        : {}),
    });

    if (res.stop_reason === 'refusal') {
      throw new Error(`Bedrock model refused the request (${res.model})`);
    }

    let text: string | null = null;
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === 'text') {
        text = (text ? `${text}\n` : '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } });
      }
    }

    return {
      model: res.model || model,
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: res.usage.input_tokens,
        completionTokens: res.usage.output_tokens,
        totalTokens: res.usage.input_tokens + res.usage.output_tokens,
      },
    };
  }
}
