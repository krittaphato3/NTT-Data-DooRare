import { AI_PROVIDERS, type AIConfig, type AICredentials, type MaskedAICredentials } from './byok.types.js';

/**
 * Masks a sensitive secret key (e.g. OpenAI / Anthropic key) so it can safely be
 * displayed in the UI without leaking plain text credentials.
 */
export function maskSecretKey(key?: string): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 8) return '••••';

  if (trimmed.startsWith('sk-')) {
    const tail = trimmed.slice(-4);
    return `sk-...${tail}`;
  }

  const head = trimmed.slice(0, 4);
  const tail = trimmed.slice(-4);
  return `${head}...${tail}`;
}

/**
 * Transforms stored credentials into safe, masked credentials for API responses.
 */
export function maskCredentials(credentials: AICredentials = {}): MaskedAICredentials {
  return {
    hasApiKey: Boolean(credentials.apiKey && credentials.apiKey.trim().length > 0),
    apiKeyMasked: credentials.apiKey ? maskSecretKey(credentials.apiKey) : undefined,
    awsRegion: credentials.awsRegion,
    awsAccessKeyIdMasked: credentials.awsAccessKeyId ? maskSecretKey(credentials.awsAccessKeyId) : undefined,
    hasAwsSecretKey: Boolean(credentials.awsSecretAccessKey && credentials.awsSecretAccessKey.trim().length > 0),
    azureEndpoint: credentials.azureEndpoint,
    azureDeploymentName: credentials.azureDeploymentName,
    customEndpoint: credentials.customEndpoint,
    customApiPath: credentials.customApiPath,
    customHeaders: credentials.customHeaders,
  };
}

/**
 * Validates the structure and constraints of an AI configuration.
 */
export function validateAiConfig(config: AIConfig): void {
  if (!config) {
    throw new Error('AI configuration must be provided');
  }

  if (!AI_PROVIDERS.includes(config.provider)) {
    throw new Error(`Unsupported AI provider: ${config.provider}. Must be one of: ${AI_PROVIDERS.join(', ')}`);
  }

  if (typeof config.monthlyBudgetUsd !== 'number' || isNaN(config.monthlyBudgetUsd) || config.monthlyBudgetUsd < 0) {
    throw new Error('Monthly budget must be a positive number');
  }

  if (!config.modelPrimary || typeof config.modelPrimary !== 'string' || !config.modelPrimary.trim()) {
    throw new Error('Primary model ID must be specified');
  }

  if (!config.modelFast || typeof config.modelFast !== 'string' || !config.modelFast.trim()) {
    throw new Error('Fast model ID must be specified');
  }
}
