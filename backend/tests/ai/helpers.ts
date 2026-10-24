import assert from 'node:assert/strict';
import { query } from '../../src/db/client.js';
import type { RequestContext, ToolResult } from '../../src/modules/ai/tools/tool.types.js';
import { PROPOSAL_ACTION_WHITELIST } from '../../src/modules/ai/tools/governance/governance.utils.js';

export const FAKE_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Builds a standardized RequestContext for tool execution tests.
 */
export function ctx(role: string, extra: Record<string, unknown> = {}): RequestContext {
  return {
    userId: FAKE_USER_ID,
    role,
    ...extra,
  };
}

/**
 * Retrieves the first N active hospital UUIDs ordered by ID.
 */
export async function getActiveHospitalIds(n = 5): Promise<string[]> {
  const res = await query<{ id: string }>(
    `SELECT id FROM hospital WHERE active = true ORDER BY id LIMIT $1`,
    [n],
  );
  return res.rows.map((r) => r.id);
}

/**
 * Retrieves the first N region UUIDs ordered by ID.
 */
export async function getRegionIds(n = 5): Promise<string[]> {
  const res = await query<{ id: string }>(
    `SELECT id FROM region ORDER BY id LIMIT $1`,
    [n],
  );
  return res.rows.map((r) => r.id);
}

/**
 * Asserts that a tool execution failed with a permission denied error.
 */
export function assertPermissionDenied(result: ToolResult): void {
  assert.equal(result.success, false, 'Expected tool execution to fail with permission denied');
  assert.match(
    result.error ?? '',
    /Permission denied/i,
    `Expected error to match /Permission denied/i, got: ${result.error}`,
  );
}

/**
 * Asserts that a tool execution failed and optionally checks the error message pattern.
 */
export function assertFailed(result: ToolResult, pattern?: RegExp | string): void {
  assert.equal(result.success, false, 'Expected tool execution to fail');
  if (pattern) {
    if (typeof pattern === 'string') {
      assert.ok(
        result.error?.includes(pattern),
        `Expected error to contain '${pattern}', got: ${result.error}`,
      );
    } else {
      assert.match(
        result.error ?? '',
        pattern,
        `Expected error to match ${pattern}, got: ${result.error}`,
      );
    }
  }
}

export const SECRET_LEAK_REGEX =
  /(apiKey|secret|sk-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]+)/i;

/**
 * Asserts that no sensitive secrets or credential tokens are leaked in the output object.
 */
export function assertNoSecrets(value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  assert.equal(
    SECRET_LEAK_REGEX.test(serialized),
    false,
    `Secret leak detected in output: ${serialized.slice(0, 200)}...`,
  );
}

const ALLOWED_TABLES = new Set([
  'hospital',
  'region',
  'config_setting',
  'return_obligation',
  'borrow_request',
  'incident',
  'emergency_plan',
  'context_signal',
  'allocation_plan',
  'drug_mapping',
  'transport_task',
  'audit_log',
  'agent_run',
  'stock_lot',
  'hospital_drug',
  'drug_master',
]);

/**
 * Safe row counter restricted to an explicit table allow-list to prevent SQL injection.
 */
export async function countRows(
  table: string,
  whereClause?: string,
  params: unknown[] = [],
): Promise<number> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table '${table}' is not in the countRows allow-list.`);
  }
  const sql = whereClause
    ? `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereClause}`
    : `SELECT COUNT(*)::int AS count FROM ${table}`;
  const res = await query<{ count: number }>(sql, params);
  return res.rows[0].count;
}

/**
 * Re-export the proposal action whitelist for governance tests.
 */
export const WHITELIST = PROPOSAL_ACTION_WHITELIST;
