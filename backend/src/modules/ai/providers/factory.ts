import type { AIConfig } from '../byok/byok.types.js';
import type { ILLMProvider } from './types.js';
import { MockProvider } from './mock.provider.js';
import { OpenAIProvider } from './openai.provider.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { BedrockProvider } from './bedrock.provider.js';
import { AzureOpenAIProvider } from './azure.provider.js';
import { CustomProvider } from './custom.provider.js';

interface ProviderCacheEntry {
  provider: ILLMProvider;
  cacheKey: string;
  expiresAt: number;
}

export class LLMProviderFactory {
  private cache: ProviderCacheEntry | null = null;
  private readonly defaultTtlMs = 5 * 60 * 1000; // 5 minutes TTL

  /**
   * Generates a deterministic cache key for the active configuration.
   */
  private generateCacheKey(config: AIConfig): string {
    return JSON.stringify({
      provider: config.provider,
      modelPrimary: config.modelPrimary,
      modelFast: config.modelFast,
      credentials: config.credentials,
    });
  }

  /**
   * Clears the in-memory cached provider.
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Returns an initialized LLM Provider according to current BYOK configuration.
   * Throws if the system kill switch (`agent.enabled`) is inactive.
   */
  getProvider(options: { config: AIConfig; agentEnabled: boolean }): ILLMProvider {
    const { config, agentEnabled } = options;

    if (!agentEnabled) {
      throw new Error(
        'AI Agent execution is currently blocked by System Administrator kill switch (agent.enabled = false).',
      );
    }

    const now = Date.now();
    const cacheKey = this.generateCacheKey(config);

    if (this.cache && this.cache.cacheKey === cacheKey && this.cache.expiresAt > now) {
      return this.cache.provider;
    }

    let provider: ILLMProvider;

    switch (config.provider) {
      case 'MOCK':
        provider = new MockProvider(config);
        break;
      case 'OPENAI':
        provider = new OpenAIProvider(config);
        break;
      case 'ANTHROPIC':
        provider = new AnthropicProvider(config);
        break;
      case 'AWS_BEDROCK':
        provider = new BedrockProvider(config);
        break;
      case 'AZURE_OPENAI':
        provider = new AzureOpenAIProvider(config);
        break;
      case 'CUSTOM':
        provider = new CustomProvider(config);
        break;
      default:
        throw new Error(`Unsupported AI Provider: ${config.provider}`);
    }

    this.cache = {
      provider,
      cacheKey,
      expiresAt: now + this.defaultTtlMs,
    };

    return provider;
  }
}

export const providerFactory = new LLMProviderFactory();
