import type { RequestContext } from '../tool.types.js';

/**
 * Result of hospital scoping validation.
 */
export type HospitalScopeResult =
  | { ok: true; hospitalId: string | null }
  | { ok: false; error: string; hospitalId?: never };

/**
 * Result of regional scoping validation.
 */
export type RegionScopeResult =
  | { ok: true; regionId: string | null }
  | { ok: false; error: string; regionId?: never };

/**
 * Validates tenant hospital scope for the calling context.
 * - SYSTEM_ADMIN is global: may target any hospital; falls back to context.hospitalId if no target specified.
 * - Other roles: context.hospitalId is required. If a target is provided and differs from context, access is denied.
 */
export function ensureHospitalScope(
  context: RequestContext,
  targetHospitalId?: string | null,
): HospitalScopeResult {
  const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
  if (isSystemAdmin) {
    const resolved = targetHospitalId || context.hospitalId || null;
    return { ok: true, hospitalId: resolved };
  }

  const ctxHospitalId = context.hospitalId;
  if (!ctxHospitalId) {
    return {
      ok: false,
      error: 'Context hospitalId is required for hospital-scoped operations.',
    };
  }

  if (targetHospitalId && targetHospitalId !== ctxHospitalId) {
    return {
      ok: false,
      error: 'Permission denied: Cannot access hospital outside your authorized scope.',
    };
  }

  return { ok: true, hospitalId: ctxHospitalId };
}

/**
 * Validates tenant regional scope for the calling context.
 * - SYSTEM_ADMIN is global: may target any region; falls back to context.regionId if no target specified.
 * - Other roles: context.regionId is required. If a target is provided and differs from context, access is denied.
 */
export function ensureRegionScope(
  context: RequestContext,
  targetRegionId?: string | null,
): RegionScopeResult {
  const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
  if (isSystemAdmin) {
    const resolved = targetRegionId || context.regionId || null;
    return { ok: true, regionId: resolved };
  }

  const ctxRegionId = context.regionId;
  if (!ctxRegionId) {
    return {
      ok: false,
      error: 'Context regionId is required for region-scoped operations.',
    };
  }

  if (targetRegionId && targetRegionId !== ctxRegionId) {
    return {
      ok: false,
      error: 'Permission denied: Cannot access region outside your authorized scope.',
    };
  }

  return { ok: true, regionId: ctxRegionId };
}

/**
 * Safely converts Postgres numeric strings or unknown values to numbers.
 * Returns fallback for null, undefined, empty string, or NaN.
 */
export function toNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  const parsed = Number(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Regex pattern identifying sensitive secrets, API keys, AWS credentials, and Bearer tokens.
 */
export const SECRET_KEY_PATTERN =
  /(sk-[a-zA-Z0-9_-]{8,}|AKIA[0-9A-Z]{16}|Bearer\s+[a-zA-Z0-9._-]+)/gi;

/**
 * Sanitizes error messages by redacting API keys, AWS credentials, and Bearer tokens.
 * Handles non-string input safely.
 */
export function sanitizeErrorMessage(msg: unknown): string {
  if (typeof msg !== 'string') {
    if (msg === null || msg === undefined) return '';
    try {
      return String(msg).replace(SECRET_KEY_PATTERN, '[REDACTED]');
    } catch {
      return '';
    }
  }
  return msg.replace(SECRET_KEY_PATTERN, '[REDACTED]');
}

export interface ProposalActionDef {
  endpointTemplate: string;
  method: 'POST' | 'PUT' | 'PATCH';
}

/**
 * Whitelist of permissible action endpoints for human-in-the-loop proposals across governance roles.
 * Principle AGT-GEN-001: Mutations are returned only as proposals targeting whitelisted action API endpoints.
 */
export const PROPOSAL_ACTION_WHITELIST = {
  HOSPITAL_ADMIN: {
    WAIVE_RETURN_OBLIGATION: {
      endpointTemplate: '/api/v1/return-obligations/:id/waive',
      method: 'POST',
    },
    APPROVE_INCIDENT_PLAN: {
      endpointTemplate: '/api/v1/incidents/:id/plan/approve',
      method: 'POST',
    },
    ESCALATE_BORROW_MANUAL: {
      endpointTemplate: '/api/v1/borrow-requests/:id/escalate-manual',
      method: 'POST',
    },
  },
  REGION_ADMIN: {
    CREATE_CONTEXT_SIGNAL: {
      endpointTemplate: '/api/v1/context-signals',
      method: 'POST',
    },
    RESOLVE_ALLOCATION_OPTION: {
      endpointTemplate: '/api/v1/allocation-plans/:id/option',
      method: 'POST',
    },
  },
  SYSTEM_ADMIN: {
    TOGGLE_KILL_SWITCH: {
      endpointTemplate: '/api/v1/agent/kill-switch',
      method: 'POST',
    },
    UPDATE_AI_CONFIG: {
      endpointTemplate: '/api/v1/admin/ai-config',
      method: 'PUT',
    },
    UPDATE_SYSTEM_CONFIG: {
      endpointTemplate: '/api/v1/config/:key',
      method: 'PUT',
    },
  },
  DATA_ADMIN: {
    VERIFY_DRUG_MAPPING: {
      endpointTemplate: '/api/v1/mappings/:id/verify',
      method: 'POST',
    },
    REJECT_DRUG_MAPPING: {
      endpointTemplate: '/api/v1/mappings/:id/reject',
      method: 'POST',
    },
    UPDATE_CENTRAL_ITEM: {
      endpointTemplate: '/api/v1/central-items',
      method: 'POST',
    },
  },
  AUDITOR: {} as Record<string, ProposalActionDef>,
} as const;

/**
 * Substitutes `:id` / `:key` placeholders in an endpoint template.
 * Parameter values are URL-encoded.
 */
export function buildEndpoint(template: string, params: Record<string, string>): string {
  return template.replace(/:([a-zA-Z0-9_]+)/g, (match, key) => {
    return key in params ? encodeURIComponent(params[key]) : match;
  });
}

/**
 * Threshold constants for governance and audit operations.
 */
export const WAIVER_HIGH_VALUE_THRESHOLD_THB = 50000;
export const WAIVER_MEDIUM_VALUE_THRESHOLD_THB = 10000;
export const ANOMALY_STOCKOUT_COUNT_THRESHOLD = 5;
export const ANOMALY_EMERGENCY_BORROW_THRESHOLD = 3;
export const ANOMALY_EXPIRY_VALUE_THRESHOLD_THB = 100000;
export const ANOMALY_OVERDUE_RETURNS_THRESHOLD = 1;
export const HEATMAP_CRITICAL_DAYS = 3;
export const HEATMAP_LOW_DAYS = 7;
export const ANOMALY_LOOKBACK_DAYS_DEFAULT = 30;
export const HIGH_COST_VED_REVIEW_THRESHOLD_THB = 10000;
