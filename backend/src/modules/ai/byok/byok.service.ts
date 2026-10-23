import type { Request } from 'express';
import { query } from '../../../db/client.js';
import { withTransaction } from '../../../db/tx.js';
import { auditContext, writeAudit } from '../../../core/audit.js';
import { HttpError } from '../../../middleware/httpError.js';
import type {
  AIConfig,
  AIConfigResponse,
  AIConfigUpdateRequest,
  TestConnectionRequest,
  TestConnectionResponse,
} from './byok.types.js';
import { maskCredentials, validateAiConfig } from './byok.utils.js';
import { providerFactory } from '../providers/factory.js';
import { MockProvider } from '../providers/mock.provider.js';
import { OpenAIProvider } from '../providers/openai.provider.js';
import { AnthropicProvider } from '../providers/anthropic.provider.js';
import { BedrockProvider } from '../providers/bedrock.provider.js';
import { AzureOpenAIProvider } from '../providers/azure.provider.js';
import { CustomProvider } from '../providers/custom.provider.js';
import type { ILLMProvider } from '../providers/types.js';

const CONFIG_KEY = 'agent.byok';
const KILL_SWITCH_KEY = 'agent.enabled';

export class ByokService {
  /**
   * Default baseline configuration when no database overrides exist.
   */
  getDefaultConfig(): AIConfig {
    return {
      provider: (process.env.DEFAULT_AI_PROVIDER as any) || 'MOCK',
      modelPrimary:
        process.env.DEFAULT_AI_MODEL_PRIMARY ||
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
      modelFast:
        process.env.DEFAULT_AI_MODEL_FAST ||
        'anthropic.claude-3-5-haiku-20241022-v1:0',
      monthlyBudgetUsd: Number(process.env.DEFAULT_AI_MONTHLY_BUDGET || 100),
      estimatedSpendUsd: 0,
      credentials: {
        apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
        awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
        azureDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '',
        customEndpoint: process.env.CUSTOM_AI_ENDPOINT || '',
        customApiPath: process.env.CUSTOM_AI_PATH || '/chat/completions',
        customHeaders: {},
      },
    };
  }

  /**
   * Retrieves active raw AI configuration from database or env defaults.
   */
  async getRawConfig(): Promise<{ config: AIConfig; agentEnabled: boolean; updatedAt?: string }> {
    const rows = await query<{ key: string; value: any; updated_at: Date }>(
      `SELECT key, value, updated_at FROM config_setting WHERE key IN ($1, $2) AND scope = 'GLOBAL'`,
      [CONFIG_KEY, KILL_SWITCH_KEY],
    );

    let config = this.getDefaultConfig();
    let agentEnabled = true;
    let updatedAt: string | undefined;

    for (const r of rows.rows) {
      if (r.key === CONFIG_KEY && r.value) {
        config = {
          ...config,
          ...r.value,
          credentials: {
            ...config.credentials,
            ...(r.value.credentials || {}),
          },
        };
        updatedAt = new Date(r.updated_at).toISOString();
      } else if (r.key === KILL_SWITCH_KEY) {
        agentEnabled = Boolean(r.value);
      }
    }

    return { config, agentEnabled, updatedAt };
  }

  /**
   * Fetches the sanitized AI configuration with masked credentials for the System Admin UI.
   */
  async getConfig(): Promise<AIConfigResponse> {
    const { config, agentEnabled, updatedAt } = await this.getRawConfig();

    return {
      provider: config.provider,
      modelPrimary: config.modelPrimary,
      modelFast: config.modelFast,
      monthlyBudgetUsd: config.monthlyBudgetUsd,
      estimatedSpendUsd: config.estimatedSpendUsd,
      credentials: maskCredentials(config.credentials),
      agentEnabled,
      updatedAt,
    };
  }

  /**
   * Updates AI BYOK settings and writes an audit log entry.
   */
  async updateConfig(req: Request): Promise<AIConfigResponse> {
    const user = req.user;
    if (!user || (user.role !== 'SYSTEM_ADMIN' && !user.allRoles?.includes('SYSTEM_ADMIN'))) {
      throw new HttpError(403, 'FORBIDDEN', 'Only SYSTEM_ADMIN can update Central BYOK configuration');
    }

    const body: AIConfigUpdateRequest = req.body || {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      throw new HttpError(400, 'VALIDATION', 'Must provide a reason for updating AI BYOK configuration');
    }

    return withTransaction(async (client) => {
      const existingRow = (
        await client.query<{ value: any }>(
          `SELECT value FROM config_setting WHERE key = $1 AND scope = 'GLOBAL' FOR UPDATE`,
          [CONFIG_KEY],
        )
      ).rows[0];

      const currentConfig: AIConfig = existingRow?.value || this.getDefaultConfig();

      // Merge new fields
      const newCredentials = { ...currentConfig.credentials };
      if (body.credentials) {
        if (body.credentials.apiKey !== undefined && !body.credentials.apiKey.includes('...')) {
          newCredentials.apiKey = body.credentials.apiKey.trim();
        }
        if (body.credentials.awsRegion !== undefined) {
          newCredentials.awsRegion = body.credentials.awsRegion.trim();
        }
        if (body.credentials.awsAccessKeyId !== undefined && !body.credentials.awsAccessKeyId.includes('...')) {
          newCredentials.awsAccessKeyId = body.credentials.awsAccessKeyId.trim();
        }
        if (body.credentials.awsSecretAccessKey !== undefined && !body.credentials.awsSecretAccessKey.includes('...')) {
          newCredentials.awsSecretAccessKey = body.credentials.awsSecretAccessKey.trim();
        }
        if (body.credentials.azureEndpoint !== undefined) {
          newCredentials.azureEndpoint = body.credentials.azureEndpoint.trim();
        }
        if (body.credentials.azureDeploymentName !== undefined) {
          newCredentials.azureDeploymentName = body.credentials.azureDeploymentName.trim();
        }
        if (body.credentials.customEndpoint !== undefined) {
          newCredentials.customEndpoint = body.credentials.customEndpoint.trim();
        }
        if (body.credentials.customApiPath !== undefined) {
          newCredentials.customApiPath = body.credentials.customApiPath.trim();
        }
        if (body.credentials.customHeaders !== undefined) {
          newCredentials.customHeaders = body.credentials.customHeaders;
        }
      }

      const updatedConfig: AIConfig = {
        provider: body.provider || currentConfig.provider,
        modelPrimary: body.modelPrimary?.trim() || currentConfig.modelPrimary,
        modelFast: body.modelFast?.trim() || currentConfig.modelFast,
        monthlyBudgetUsd:
          typeof body.monthlyBudgetUsd === 'number'
            ? body.monthlyBudgetUsd
            : currentConfig.monthlyBudgetUsd,
        estimatedSpendUsd: currentConfig.estimatedSpendUsd,
        credentials: newCredentials,
      };

      validateAiConfig(updatedConfig);

      const written = (
        await client.query<{ updated_at: Date }>(
          `INSERT INTO config_setting (key, scope, value, description, updated_by, updated_at)
           VALUES ($1, 'GLOBAL', $2::jsonb, 'Central Admin BYOK LLM Configuration', $3, now())
           ON CONFLICT (key, scope) DO UPDATE
              SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING updated_at`,
          [CONFIG_KEY, JSON.stringify(updatedConfig), user.id],
        )
      ).rows[0];

      await writeAudit(client, auditContext(req), {
        action: 'AI_CONFIG_UPDATED',
        entityType: 'config_setting',
        entityId: null,
        before: existingRow ? { provider: currentConfig.provider, modelPrimary: currentConfig.modelPrimary } : null,
        after: { provider: updatedConfig.provider, modelPrimary: updatedConfig.modelPrimary, budget: updatedConfig.monthlyBudgetUsd },
        reason,
      });

      // Invalidate factory provider cache
      providerFactory.invalidateCache();

      const killSwitchRow = (
        await client.query<{ value: boolean }>(
          `SELECT value FROM config_setting WHERE key = $1 AND scope = 'GLOBAL'`,
          [KILL_SWITCH_KEY],
        )
      ).rows[0];
      const agentEnabled = killSwitchRow ? Boolean(killSwitchRow.value) : true;

      return {
        provider: updatedConfig.provider,
        modelPrimary: updatedConfig.modelPrimary,
        modelFast: updatedConfig.modelFast,
        monthlyBudgetUsd: updatedConfig.monthlyBudgetUsd,
        estimatedSpendUsd: updatedConfig.estimatedSpendUsd,
        credentials: maskCredentials(updatedConfig.credentials),
        agentEnabled,
        updatedAt: new Date(written.updated_at).toISOString(),
      };
    });
  }

  /**
   * Tests connectivity to an AI provider (either the saved active provider or an in-flight candidate).
   */
  async testConnection(req: Request): Promise<TestConnectionResponse> {
    const user = req.user;
    if (!user || (user.role !== 'SYSTEM_ADMIN' && !user.allRoles?.includes('SYSTEM_ADMIN'))) {
      throw new HttpError(403, 'FORBIDDEN', 'Only SYSTEM_ADMIN can test AI connections');
    }

    const body: TestConnectionRequest = req.body || {};
    const { config: activeConfig } = await this.getRawConfig();

    // Candidate or fallback to saved credentials
    const candidateConfig: AIConfig = {
      provider: body.provider || activeConfig.provider,
      modelPrimary: body.modelId || activeConfig.modelPrimary,
      modelFast: body.modelId || activeConfig.modelFast,
      monthlyBudgetUsd: activeConfig.monthlyBudgetUsd,
      estimatedSpendUsd: activeConfig.estimatedSpendUsd,
      credentials: {
        ...activeConfig.credentials,
        ...(body.credentials || {}),
      },
    };

    let provider: ILLMProvider;
    switch (candidateConfig.provider) {
      case 'MOCK':
        provider = new MockProvider(candidateConfig);
        break;
      case 'OPENAI':
        provider = new OpenAIProvider(candidateConfig);
        break;
      case 'ANTHROPIC':
        provider = new AnthropicProvider(candidateConfig);
        break;
      case 'AWS_BEDROCK':
        provider = new BedrockProvider(candidateConfig);
        break;
      case 'AZURE_OPENAI':
        provider = new AzureOpenAIProvider(candidateConfig);
        break;
      case 'CUSTOM':
        provider = new CustomProvider(candidateConfig);
        break;
      default:
        throw new HttpError(400, 'VALIDATION', `Unknown provider: ${candidateConfig.provider}`);
    }

    const result = await provider.testConnection();

    return {
      ok: true,
      success: result.success,
      latencyMs: result.latencyMs,
      provider: candidateConfig.provider,
      modelId: result.modelId,
      message: result.message,
    };
  }
}

export const byokService = new ByokService();
