import { z } from 'zod';
import { query } from '../../../../db/client.js';
import { byokService } from '../../byok/byok.service.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import {
  buildEndpoint,
  PROPOSAL_ACTION_WHITELIST,
  sanitizeErrorMessage,
  toNumber,
} from './governance.utils.js';

// --- TOOL 1: get_llm_health_metrics ---

export interface LlmHealthMetricsData {
  provider: string;
  modelPrimary: string;
  modelFast: string;
  monthlyBudgetUsd: number;
  estimatedSpendUsd: number;
  budgetUsedPercent: number | null;
  streamingEnabled: boolean;
  agentEnabled: boolean;
  updatedAt?: string;
  status: 'HEALTHY' | 'BUDGET_WARNING' | 'DISABLED';
}

/**
 * Tool: get_llm_health_metrics
 * Retrieves operational status, model assignments, and budget metrics for Central AI BYOK.
 * Credentials and API keys are completely stripped and never exposed.
 * Allowed Roles: SYSTEM_ADMIN
 */
export const getLlmHealthMetricsTool: IAgentTool<Record<string, never>> = {
  name: 'get_llm_health_metrics',
  description:
    'Retrieves Central BYOK LLM health, active models, monthly budget consumption, and agent enable flag. Strips all credentials.',
  parameters: z.object({}),
  allowedRoles: ['SYSTEM_ADMIN'],
  execute: async (_args, _context: RequestContext): Promise<ToolResult> => {
    try {
      // Hard security rule: Use byokService.getConfig() only.
      const config = await byokService.getConfig();

      const monthlyBudgetUsd = config.monthlyBudgetUsd;
      const estimatedSpendUsd = config.estimatedSpendUsd;

      let budgetUsedPercent: number | null = null;
      if (monthlyBudgetUsd > 0) {
        budgetUsedPercent = Number(((estimatedSpendUsd / monthlyBudgetUsd) * 100).toFixed(1));
      }

      let status: 'HEALTHY' | 'BUDGET_WARNING' | 'DISABLED' = 'HEALTHY';
      if (!config.agentEnabled) {
        status = 'DISABLED';
      } else if (monthlyBudgetUsd > 0 && estimatedSpendUsd >= monthlyBudgetUsd) {
        status = 'BUDGET_WARNING';
      }

      const data: LlmHealthMetricsData = {
        provider: config.provider,
        modelPrimary: config.modelPrimary,
        modelFast: config.modelFast,
        monthlyBudgetUsd,
        estimatedSpendUsd,
        budgetUsedPercent,
        streamingEnabled: config.streamingEnabled !== false,
        agentEnabled: config.agentEnabled,
        updatedAt: config.updatedAt,
        status,
      };

      return {
        success: true,
        data,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve LLM health metrics: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 2: test_llm_connectivity ---

/**
 * Tool: test_llm_connectivity
 * Executes a round-trip connection test to the currently active Central AI provider.
 * Takes no provider/credential arguments and tests only the stored active configuration.
 * Allowed Roles: SYSTEM_ADMIN
 */
export const testLlmConnectivityTool: IAgentTool<Record<string, never>> = {
  name: 'test_llm_connectivity',
  description:
    'Performs a live round-trip latency and connectivity test against the currently active Central AI provider. Takes no credentials.',
  parameters: z.object({}),
  allowedRoles: ['SYSTEM_ADMIN'],
  execute: async (_args, context: RequestContext): Promise<ToolResult> => {
    try {
      const startTime = Date.now();

      // Synthetic request invoking byokService with empty body to test the currently active provider
      const response = await byokService.testConnection({
        user: { id: context.userId || 'system-admin', role: 'SYSTEM_ADMIN' },
        body: {},
      } as any);

      const latencyMs = response.latencyMs ?? Date.now() - startTime;
      const message = response.message ? sanitizeErrorMessage(response.message) : undefined;

      return {
        success: true,
        data: {
          success: response.success,
          latencyMs,
          provider: response.provider,
          modelId: response.modelId,
          ...(message ? { message } : {}),
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: sanitizeErrorMessage(e.message),
      };
    }
  },
};

// --- TOOL 3: verify_audit_chain_integrity ---

/**
 * Tool: verify_audit_chain_integrity
 * Runs the database cryptographic audit chain verification function (JOB-15 / audit_chain_verify()).
 * Checks the SHA-256 hash continuity of audit_log entries to detect tampering.
 * Allowed Roles: SYSTEM_ADMIN, AUDITOR
 */
export const verifyAuditChainIntegrityTool: IAgentTool<Record<string, never>> = {
  name: 'verify_audit_chain_integrity',
  description:
    'Verifies SHA-256 tamper-evident audit log cryptographic hash chain continuity via audit_chain_verify().',
  parameters: z.object({}),
  allowedRoles: ['SYSTEM_ADMIN', 'AUDITOR'],
  execute: async (_args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const res = await query<{ problems: string }>(`SELECT audit_chain_verify() AS problems`);
      const problems = toNumber(res.rows[0]?.problems, 0);

      return {
        success: true,
        data: {
          intact: problems === 0,
          problems,
          checkedAt: new Date().toISOString(),
          note:
            problems === 0
              ? 'Audit log SHA-256 hash chain is intact with zero integrity discrepancies.'
              : `Integrity breach detected: ${problems} broken or tampered audit log link(s) found.`,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to verify audit chain integrity: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 4: get_system_configuration_status ---

const SENSITIVE_CONFIG_KEY_REGEX = /secret|key|token|password|credential/i;

/**
 * Tool: get_system_configuration_status
 * Inspects global configuration settings and system-wide operational indicators.
 * Strictly redacts all sensitive credential/secret rows.
 * Allowed Roles: SYSTEM_ADMIN
 */
export const getSystemConfigurationStatusTool: IAgentTool<{
  limit?: number;
}> = {
  name: 'get_system_configuration_status',
  description:
    'Retrieves global system configuration settings and active hospital counts. Automatically redacts all secret and credential keys.',
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe('Maximum number of configuration keys to return (default 50)'),
  }),
  allowedRoles: ['SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const limit = args.limit ?? 50;

      // 1. Fetch all global config settings
      const configRes = await query<{
        key: string;
        value: unknown;
        description: string | null;
      }>(
        `SELECT key, value, description
           FROM config_setting
          WHERE scope = 'GLOBAL'
          ORDER BY key ASC`,
      );

      const totalConfigKeys = configRes.rows.length;
      let hiddenKeyCount = 0;
      const safeSettings: Array<{ key: string; value: unknown; description: string | null }> = [];

      for (const row of configRes.rows) {
        if (SENSITIVE_CONFIG_KEY_REGEX.test(row.key)) {
          hiddenKeyCount++;
        } else {
          safeSettings.push({
            key: row.key,
            value: row.value,
            description: row.description,
          });
        }
      }

      // 2. Active hospital count
      const hospitalRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM hospital
          WHERE active = true`,
      );
      const activeHospitalCount = toNumber(hospitalRes.rows[0]?.count, 0);

      return {
        success: true,
        data: {
          activeHospitalCount,
          totalConfigKeys,
          hiddenKeyCount,
          returnedConfigCount: Math.min(safeSettings.length, limit),
          settings: safeSettings.slice(0, limit),
          featureFlags: null,
          featureFlagsNote:
            'No dedicated feature flag convention exists in config_setting; functionality is controlled via standard functional keys (e.g. agent.enabled).',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve system configuration status: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 5: submit_system_admin_proposal (TERMINAL) ---

const UPDATE_AI_CONFIG_STRICT_SCHEMA = z
  .object({
    provider: z.enum(['MOCK', 'OPENAI', 'ANTHROPIC', 'AWS_BEDROCK', 'AZURE_OPENAI', 'CUSTOM']).optional(),
    modelPrimary: z.string().optional(),
    modelFast: z.string().optional(),
    monthlyBudgetUsd: z.number().min(0).optional(),
    streamingEnabled: z.boolean().optional(),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  })
  .strict();

/**
 * Tool: submit_system_admin_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for high-privilege System Admin actions:
 * - TOGGLE_KILL_SWITCH: Proposes toggling agent.enabled kill switch.
 * - UPDATE_AI_CONFIG: Proposes updating non-secret AI provider parameters, budget, or model assignments.
 * - UPDATE_SYSTEM_CONFIG: Proposes updating a non-sensitive system configuration key.
 * Allowed Roles: SYSTEM_ADMIN
 */
export const submitSystemAdminProposalTool: IAgentTool<{
  action: 'TOGGLE_KILL_SWITCH' | 'UPDATE_AI_CONFIG' | 'UPDATE_SYSTEM_CONFIG';
  enabled?: boolean;
  provider?: 'MOCK' | 'OPENAI' | 'ANTHROPIC' | 'AWS_BEDROCK' | 'AZURE_OPENAI' | 'CUSTOM';
  modelPrimary?: string;
  modelFast?: string;
  monthlyBudgetUsd?: number;
  streamingEnabled?: boolean;
  key?: string;
  value?: unknown;
  reason?: string;
}> = {
  name: 'submit_system_admin_proposal',
  description:
    'Terminal proposal tool creating human-in-the-loop action proposals for toggling the AI kill switch, updating AI provider config, or updating system settings. Prohibits all secret entry.',
  parameters: z.object({
    action: z
      .enum(['TOGGLE_KILL_SWITCH', 'UPDATE_AI_CONFIG', 'UPDATE_SYSTEM_CONFIG'])
      .describe('System admin executive action to propose'),
    enabled: z
      .boolean()
      .optional()
      .describe('Required for TOGGLE_KILL_SWITCH: true to enable agent, false to trigger kill switch'),
    provider: z
      .enum(['MOCK', 'OPENAI', 'ANTHROPIC', 'AWS_BEDROCK', 'AZURE_OPENAI', 'CUSTOM'])
      .optional()
      .describe('Optional provider update for UPDATE_AI_CONFIG'),
    modelPrimary: z.string().optional().describe('Optional primary model ID for UPDATE_AI_CONFIG'),
    modelFast: z.string().optional().describe('Optional fast model ID for UPDATE_AI_CONFIG'),
    monthlyBudgetUsd: z.number().min(0).optional().describe('Optional monthly budget USD for UPDATE_AI_CONFIG'),
    streamingEnabled: z.boolean().optional().describe('Optional streaming enabled flag for UPDATE_AI_CONFIG'),
    key: z
      .string()
      .optional()
      .describe('Configuration key for UPDATE_SYSTEM_CONFIG (must not be a secret key)'),
    value: z.unknown().optional().describe('JSON configuration value for UPDATE_SYSTEM_CONFIG'),
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .optional()
      .describe('Mandatory audit justification (minimum 10 characters)'),
  }),
  allowedRoles: ['SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      if (args.action === 'TOGGLE_KILL_SWITCH') {
        if (typeof args.enabled !== 'boolean') {
          return {
            success: false,
            error: 'enabled (boolean) is required for TOGGLE_KILL_SWITCH.',
          };
        }
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for TOGGLE_KILL_SWITCH.',
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.SYSTEM_ADMIN.TOGGLE_KILL_SWITCH;
        const endpoint = actionDef.endpointTemplate;

        const actionPayload = {
          enabled: args.enabled,
          reason: args.reason.trim(),
        };

        const summary: Record<string, unknown> = {
          action: 'TOGGLE_KILL_SWITCH',
          targetSwitch: 'agent.enabled',
          targetState: args.enabled ? 'ENABLED' : 'KILL_SWITCH_ENGAGED',
          reason: args.reason.trim(),
        };

        const proposal: ToolProposalPayload = {
          type: 'TOGGLE_KILL_SWITCH',
          title: `Proposal: ${args.enabled ? 'Enable' : 'Disable'} Agent Runtime (${args.enabled ? 'Turn OFF Kill Switch' : 'Trigger Kill Switch'})`,
          description: `Propose ${args.enabled ? 'enabling' : 'disabling'} agent runtime via global kill switch (agent.enabled = ${args.enabled}). Justification: ${args.reason.trim()}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: actionPayload,
          },
        };

        return {
          success: true,
          data: {
            ...summary,
            requiresHumanApproval: true,
          },
          proposal,
        };
      }

      if (args.action === 'UPDATE_AI_CONFIG') {
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for UPDATE_AI_CONFIG.',
          };
        }

        // Check against raw arguments for unauthorized credentials injection
        const rawArgs = args as Record<string, unknown>;
        if (
          'credentials' in rawArgs ||
          'apiKey' in rawArgs ||
          'awsAccessKeyId' in rawArgs ||
          'awsSecretAccessKey' in rawArgs
        ) {
          return {
            success: false,
            error:
              'Security violation: Credentials and API keys cannot be proposed via AI tools. Credentials must be entered manually by an administrator in the admin console.',
          };
        }

        // Validate strictly using the non-credential schema
        const strictCheck = UPDATE_AI_CONFIG_STRICT_SCHEMA.safeParse({
          provider: args.provider,
          modelPrimary: args.modelPrimary,
          modelFast: args.modelFast,
          monthlyBudgetUsd: args.monthlyBudgetUsd,
          streamingEnabled: args.streamingEnabled,
          reason: args.reason.trim(),
        });

        if (!strictCheck.success) {
          return {
            success: false,
            error: `Invalid AI configuration proposal: ${strictCheck.error.message}`,
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.SYSTEM_ADMIN.UPDATE_AI_CONFIG;
        const endpoint = actionDef.endpointTemplate;

        const actionPayload: Record<string, unknown> = {
          reason: args.reason.trim(),
          ...(args.provider ? { provider: args.provider } : {}),
          ...(args.modelPrimary ? { modelPrimary: args.modelPrimary } : {}),
          ...(args.modelFast ? { modelFast: args.modelFast } : {}),
          ...(typeof args.monthlyBudgetUsd === 'number' ? { monthlyBudgetUsd: args.monthlyBudgetUsd } : {}),
          ...(typeof args.streamingEnabled === 'boolean' ? { streamingEnabled: args.streamingEnabled } : {}),
        };

        const summary: Record<string, unknown> = {
          action: 'UPDATE_AI_CONFIG',
          ...actionPayload,
          note: 'Credentials are excluded from proposals and must be updated directly by human admins.',
        };

        const proposal: ToolProposalPayload = {
          type: 'UPDATE_AI_CONFIG',
          title: `Proposal: Update Central AI Configuration (${args.provider || 'Provider Settings'})`,
          description: `Propose updating Central AI configuration. Justification: ${args.reason.trim()}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: actionPayload,
          },
        };

        return {
          success: true,
          data: {
            ...summary,
            requiresHumanApproval: true,
          },
          proposal,
        };
      }

      if (args.action === 'UPDATE_SYSTEM_CONFIG') {
        if (!args.key || !args.key.trim()) {
          return {
            success: false,
            error: 'key is required for UPDATE_SYSTEM_CONFIG.',
          };
        }
        if (args.value === undefined) {
          return {
            success: false,
            error: 'value is required for UPDATE_SYSTEM_CONFIG.',
          };
        }
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for UPDATE_SYSTEM_CONFIG.',
          };
        }

        const cleanKey = args.key.trim();

        // Reject if key contains sensitive tokens
        if (SENSITIVE_CONFIG_KEY_REGEX.test(cleanKey)) {
          return {
            success: false,
            error: `Security violation: Cannot propose updates to sensitive key '${cleanKey}'.`,
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.SYSTEM_ADMIN.UPDATE_SYSTEM_CONFIG;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { key: cleanKey });

        const actionPayload = {
          value: args.value,
          reason: args.reason.trim(),
        };

        const summary: Record<string, unknown> = {
          action: 'UPDATE_SYSTEM_CONFIG',
          key: cleanKey,
          value: args.value,
          reason: args.reason.trim(),
        };

        const proposal: ToolProposalPayload = {
          type: 'UPDATE_SYSTEM_CONFIG',
          title: `Proposal: Update Configuration Setting '${cleanKey}'`,
          description: `Propose updating configuration key '${cleanKey}'. Justification: ${args.reason.trim()}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: actionPayload,
          },
        };

        return {
          success: true,
          data: {
            ...summary,
            requiresHumanApproval: true,
          },
          proposal,
        };
      }

      return {
        success: false,
        error: `Unsupported action: ${(args as any).action}`,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to submit system admin proposal: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

/**
 * All 5 System Admin domain tools.
 */
export const systemAdminTools = [
  getLlmHealthMetricsTool,
  testLlmConnectivityTool,
  verifyAuditChainIntegrityTool,
  getSystemConfigurationStatusTool,
  submitSystemAdminProposalTool,
];
