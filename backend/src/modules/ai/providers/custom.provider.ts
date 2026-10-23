import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolDefinition,
} from './types.js';

export class CustomProvider implements ILLMProvider {
  readonly providerType = 'CUSTOM' as const;
  private readonly config: AIConfig;
  private readonly endpoint: string;
  private readonly apiPath: string;
  private readonly apiKey?: string;
  private readonly customHeaders: Record<string, string>;

  constructor(config: AIConfig) {
    this.config = config;
    this.endpoint = config.credentials.customEndpoint?.trim() || '';
    this.apiPath = config.credentials.customApiPath?.trim() || '/chat/completions';
    this.apiKey = config.credentials.apiKey?.trim();
    this.customHeaders = config.credentials.customHeaders || {};
  }

  /**
   * Constructs the full URL combining customEndpoint and customApiPath.
   */
  getFullUrl(): string {
    if (!this.endpoint) return '';
    const cleanBase = this.endpoint.replace(/\/+$/, '');
    const cleanPath = this.apiPath.replace(/^\/+/, '');

    // If endpoint already specifies the path, don't duplicate
    if (cleanBase.endsWith(cleanPath)) {
      return cleanBase;
    }

    return `${cleanBase}/${cleanPath}`;
  }

  private getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Performs fetch with automatic Docker-to-host fallback.
   * When the backend runs inside a container, 'localhost' refers to the container itself;
   * this automatically attempts 'host.docker.internal' so host services resolve seamlessly.
   */
  private async fetchWithDockerFallback(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err: unknown) {
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        const dockerHostUrl = url
          .replace('://localhost', '://host.docker.internal')
          .replace('://127.0.0.1', '://host.docker.internal');
        try {
          return await fetch(dockerHostUrl, init);
        } catch {
          // rethrow original
        }
      }
      throw err;
    }
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const model = this.config.modelFast || this.config.modelPrimary || 'custom-model';
    const start = Date.now();

    if (!this.endpoint) {
      return {
        success: false,
        latencyMs: 0,
        message: 'Custom API endpoint URL is required. Please enter an endpoint URL.',
        modelId: model,
      };
    }

    const fullUrl = this.getFullUrl();

    try {
      // Determine request format based on path
      const isResponseEndpoint = this.apiPath.includes('responses') || this.apiPath.includes('generate');
      const body = isResponseEndpoint
        ? {
            model,
            prompt: 'test connection',
            input: 'test connection',
            max_tokens: 5,
          }
        : {
            model,
            messages: [{ role: 'user', content: 'test connection' }],
            max_tokens: 5,
          };

      const res = await this.fetchWithDockerFallback(fullUrl, {
        method: 'POST',
        headers: this.getRequestHeaders(),
        body: JSON.stringify(body),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as any;
        const msg =
          errJson.error?.message ||
          errJson.message ||
          `Custom API returned HTTP ${res.status} ${res.statusText}`;
        return {
          success: false,
          latencyMs,
          message: msg,
          modelId: model,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `Custom API connected successfully at ${this.apiPath} (${model})`,
        modelId: model,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        message: `Error connecting to Custom API (${fullUrl}): ${message}`,
        modelId: model,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.modelPrimary || 'custom-model';
    const fullUrl = this.getFullUrl();

    if (!this.endpoint) {
      throw new Error('Custom API endpoint URL is not configured');
    }

    const isResponseEndpoint = this.apiPath.includes('responses') || this.apiPath.includes('generate');
    let body: Record<string, unknown>;

    if (isResponseEndpoint) {
      const lastUserMsg = messages.filter((m) => m.role === 'user').slice(-1)[0];
      body = {
        model,
        prompt: lastUserMsg?.content || '',
        input: lastUserMsg?.content || '',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.2,
      };
    } else {
      // Standard OpenAI-compatible /chat/completions format
      body = {
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
    }

    const res = await this.fetchWithDockerFallback(fullUrl, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error?.message || err.message || `Custom API request failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;

    // Handle responses endpoint variation
    if (data.response || data.output || data.text) {
      return {
        model,
        content: String(data.response || data.output || data.text),
        usage: data.usage,
      };
    }

    // Standard choices structure
    const choice = data.choices?.[0];
    let content = choice?.message?.content ?? choice?.text ?? null;
    let thought: string | null =
      choice?.message?.reasoning_content ||
      choice?.message?.reasoning ||
      choice?.message?.thought ||
      null;

    // Check if content contains <think> or <thought> tags (e.g. DeepSeek-R1 / Gemini)
    if (content && typeof content === 'string') {
      const thinkMatch = content.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
      if (thinkMatch) {
        thought = (thought ? `${thought}\n` : '') + thinkMatch[2].trim();
        content = content.replace(/<(think|thought)>[\s\S]*?<\/\1>/gi, '').trim();
      }
    }

    return {
      model,
      content,
      thought,
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: typeof tc.function.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments),
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
