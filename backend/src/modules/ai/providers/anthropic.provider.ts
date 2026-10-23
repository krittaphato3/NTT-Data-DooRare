import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolDefinition,
} from './types.js';

export class AnthropicProvider implements ILLMProvider {
  readonly providerType = 'ANTHROPIC' as const;
  private readonly config: AIConfig;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.apiKey = config.credentials.apiKey?.trim() || '';
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const model = this.config.modelFast || this.config.modelPrimary || 'claude-3-5-haiku-20241022';
    if (!this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        message: 'Anthropic API key is missing. Please configure an API key in the admin console.',
        modelId: model,
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test connection' }],
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          latencyMs,
          message: errJson.error?.message || `Anthropic returned HTTP ${res.status} ${res.statusText}`,
          modelId: model,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `Anthropic connected successfully (${model})`,
        modelId: model,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        message: `Network error connecting to Anthropic: ${message}`,
        modelId: model,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.modelPrimary || 'claude-3-5-sonnet-20241022';
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not configured');
    }

    let systemPrompt: string | undefined;
    const anthropicMessages: { role: 'user' | 'assistant'; content: any }[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt = m.content || undefined;
      } else if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content,
            },
          ],
        });
      } else {
        anthropicMessages.push({
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
        });
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.2,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Anthropic request failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    let textContent: string | null = null;
    const toolCalls: LLMResponse['toolCalls'] = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        textContent = (textContent ? textContent + '\n' : '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      model,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }
}
