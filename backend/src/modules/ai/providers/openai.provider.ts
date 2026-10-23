import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolDefinition,
} from './types.js';

export class OpenAIProvider implements ILLMProvider {
  readonly providerType = 'OPENAI' as const;
  private readonly config: AIConfig;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.apiKey = config.credentials.apiKey?.trim() || '';
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const model = this.config.modelFast || this.config.modelPrimary || 'gpt-4o-mini';
    if (!this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        message: 'OpenAI API key is missing. Please configure an API key in the admin console.',
        modelId: model,
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'test connection' }],
          max_tokens: 5,
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          latencyMs,
          message: errJson.error?.message || `OpenAI returned status ${res.status} ${res.statusText}`,
          modelId: model,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `OpenAI connected successfully (${model})`,
        modelId: model,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        message: `Network error connecting to OpenAI: ${message}`,
        modelId: model,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.modelPrimary || 'gpt-4o';
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls,
      })),
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || `OpenAI request failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: {
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }[];
        };
      }[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    return {
      model,
      content: choice?.message.content ?? null,
      toolCalls: choice?.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
