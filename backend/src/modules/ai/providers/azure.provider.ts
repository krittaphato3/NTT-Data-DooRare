import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolDefinition,
} from './types.js';

export class AzureOpenAIProvider implements ILLMProvider {
  readonly providerType = 'AZURE_OPENAI' as const;
  private readonly config: AIConfig;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deploymentName: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.endpoint = config.credentials.azureEndpoint?.trim() || '';
    this.apiKey = config.credentials.apiKey?.trim() || '';
    this.deploymentName =
      config.credentials.azureDeploymentName?.trim() ||
      config.modelPrimary ||
      'gpt-4o';
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const start = Date.now();
    if (!this.endpoint || !this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        message: 'Azure OpenAI endpoint and API key are required.',
        modelId: this.deploymentName,
      };
    }

    try {
      const url = `${this.endpoint.replace(/\/+$/, '')}/openai/deployments/${this.deploymentName}/chat/completions?api-version=2024-02-15-preview`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
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
          message: errJson.error?.message || `Azure OpenAI returned HTTP ${res.status}`,
          modelId: this.deploymentName,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `Azure OpenAI connected successfully (${this.deploymentName})`,
        modelId: this.deploymentName,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        message: `Error connecting to Azure OpenAI: ${message}`,
        modelId: this.deploymentName,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const deployment = options?.model || this.deploymentName;
    const url = `${this.endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error(`Azure OpenAI failed with HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    return {
      model: deployment,
      content: data.choices?.[0]?.message?.content ?? null,
      usage: data.usage,
    };
  }
}
