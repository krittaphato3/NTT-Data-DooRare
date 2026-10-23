/**
 * Central Admin BYOK (Bring Your Own Key) Type Definitions
 */

export const AI_PROVIDERS = [
  'MOCK',
  'AWS_BEDROCK',
  'OPENAI',
  'ANTHROPIC',
  'AZURE_OPENAI',
  'CUSTOM',
] as const;

export type AIProviderType = (typeof AI_PROVIDERS)[number];

export interface AICredentials {
  apiKey?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  azureEndpoint?: string;
  azureDeploymentName?: string;
  customEndpoint?: string;
  customApiPath?: string;
  customHeaders?: Record<string, string>;
}

export interface AIConfig {
  provider: AIProviderType;
  modelPrimary: string;
  modelFast: string;
  monthlyBudgetUsd: number;
  estimatedSpendUsd: number;
  streamingEnabled?: boolean;
  credentials: AICredentials;
}

export interface MaskedAICredentials {
  hasApiKey: boolean;
  apiKeyMasked?: string;
  awsRegion?: string;
  awsAccessKeyIdMasked?: string;
  hasAwsSecretKey?: boolean;
  azureEndpoint?: string;
  azureDeploymentName?: string;
  customEndpoint?: string;
  customApiPath?: string;
  customHeaders?: Record<string, string>;
}

export interface AIConfigResponse {
  provider: AIProviderType;
  modelPrimary: string;
  modelFast: string;
  monthlyBudgetUsd: number;
  estimatedSpendUsd: number;
  streamingEnabled: boolean;
  credentials: MaskedAICredentials;
  agentEnabled: boolean;
  updatedAt?: string;
}

export interface AIConfigUpdateRequest {
  provider?: AIProviderType;
  modelPrimary?: string;
  modelFast?: string;
  monthlyBudgetUsd?: number;
  streamingEnabled?: boolean;
  credentials?: {
    apiKey?: string;
    awsRegion?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    azureEndpoint?: string;
    azureDeploymentName?: string;
    customEndpoint?: string;
    customApiPath?: string;
    customHeaders?: Record<string, string>;
  };
  reason?: string;
}

export interface TestConnectionRequest {
  provider?: AIProviderType;
  modelId?: string;
  credentials?: AICredentials;
}

export interface TestConnectionResponse {
  ok: boolean;
  success: boolean;
  latencyMs: number;
  provider: AIProviderType;
  modelId: string;
  message: string;
}
