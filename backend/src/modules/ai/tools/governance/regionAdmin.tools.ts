import { z } from 'zod';
import { pool as db, query } from '../../../../db/client.js';
import { demandCandidates, loadPoolLot, poolLotBlocker, ruleSplit } from '../../../expiry/matching.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import {
  buildEndpoint,
  ensureRegionScope,
  HEATMAP_CRITICAL_DAYS,
  HEATMAP_LOW_DAYS,
  PROPOSAL_ACTION_WHITELIST,
  toNumber,
} from './governance.utils.js';

// --- TOOL 1: get_regional_stock_heatmap ---

export interface StockHeatmapRow {
  hospitalId: string;
  hospitalName: string;
  hospitalDrugId: string;
  drugName: string;
  ved: 'V' | 'E' | 'D';
  usableStock: number;
  daysCover: number | null;
  risk: 'CRITICAL_SHORTAGE' | 'LOW_COVER' | 'ADEQUATE' | 'UNKNOWN';
  daysCoverSource: 'ALERT' | 'USAGE' | 'NONE';
}

/**
 * Tool: get_regional_stock_heatmap
 * Computes a stock coverage heatmap across hospitals in the scoped region for vital (V) and essential (E) medicines.
 * Identifies hospitals with critical or low days of coverage.
 * Allowed Roles: REGION_ADMIN, SYSTEM_ADMIN
 */
export const getRegionalStockHeatmapTool: IAgentTool<{
  regionId?: string;
  limit?: number;
}> = {
  name: 'get_regional_stock_heatmap',
  description:
    'Retrieves regional stock coverage heatmap for vital (V) and essential (E) drugs, flagging critical shortage and low coverage risks.',
  parameters: z.object({
    regionId: z
      .string()
      .uuid()
      .optional()
      .describe('Region UUID (optional for REGION_ADMIN; required for SYSTEM_ADMIN if not in context)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe('Maximum number of drug rows to return (default 50)'),
  }),
  allowedRoles: ['REGION_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureRegionScope(context, args.regionId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const regionId = scope.regionId;
      if (!regionId) {
        return {
          success: false,
          error: 'Region ID is required. Please specify regionId in arguments or request context.',
        };
      }

      const limit = args.limit ?? 50;

      // Query active hospitals, their V/E drugs, usable stock, latest active stock_alert, and 30-day usage
      const sql = `
        WITH stock AS (
          SELECT sl.hospital_drug_id,
                 COALESCE(SUM(sl.qty_on_hand - sl.qty_held), 0) AS usable_stock
            FROM stock_lot sl
           GROUP BY sl.hospital_drug_id
        ),
        usage AS (
          SELECT ud.hospital_drug_id,
                 AVG(ud.qty_used) AS avg_daily_usage
            FROM usage_daily ud
           WHERE ud.usage_date >= CURRENT_DATE - INTERVAL '30 days'
           GROUP BY ud.hospital_drug_id
        ),
        alerts AS (
          SELECT DISTINCT ON (sa.hospital_drug_id)
                 sa.hospital_drug_id,
                 sa.days_cover
            FROM stock_alert sa
           WHERE sa.status IN ('OPEN', 'ACKNOWLEDGED', 'LINKED_TO_REQUEST', 'SNOOZED')
             AND sa.days_cover IS NOT NULL
           ORDER BY sa.hospital_drug_id, sa.created_at DESC
        )
        SELECT h.id AS hospital_id,
               h.name_th AS hospital_name,
               hd.id AS hospital_drug_id,
               hd.ved::text AS ved,
               COALESCE(dm.generic_name, hd.local_name) AS drug_name,
               COALESCE(s.usable_stock, 0)::text AS usable_stock,
               a.days_cover::text AS alert_days_cover,
               u.avg_daily_usage::text AS avg_daily_usage
          FROM hospital_drug hd
          JOIN hospital h ON h.id = hd.hospital_id
          LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
          LEFT JOIN stock s ON s.hospital_drug_id = hd.id
          LEFT JOIN alerts a ON a.hospital_drug_id = hd.id
          LEFT JOIN usage u ON u.hospital_drug_id = hd.id
         WHERE h.region_id = $1
           AND h.active = true
           AND hd.active = true
           AND hd.ved IN ('V', 'E')
      `;

      const res = await query<{
        hospital_id: string;
        hospital_name: string;
        hospital_drug_id: string;
        ved: string;
        drug_name: string;
        usable_stock: string;
        alert_days_cover: string | null;
        avg_daily_usage: string | null;
      }>(sql, [regionId]);

      const rows: StockHeatmapRow[] = [];
      const summary = {
        CRITICAL_SHORTAGE: 0,
        LOW_COVER: 0,
        ADEQUATE: 0,
        UNKNOWN: 0,
        totalEvaluated: res.rows.length,
      };

      for (const r of res.rows) {
        const usableStock = toNumber(r.usable_stock, 0);
        let daysCover: number | null = null;
        let daysCoverSource: 'ALERT' | 'USAGE' | 'NONE' = 'NONE';
        let risk: 'CRITICAL_SHORTAGE' | 'LOW_COVER' | 'ADEQUATE' | 'UNKNOWN' = 'UNKNOWN';

        if (r.alert_days_cover !== null && r.alert_days_cover !== undefined) {
          daysCover = toNumber(r.alert_days_cover, 0);
          daysCoverSource = 'ALERT';
        } else if (r.avg_daily_usage !== null && r.avg_daily_usage !== undefined) {
          const avgUsage = toNumber(r.avg_daily_usage, 0);
          if (avgUsage > 0) {
            daysCover = Number((usableStock / avgUsage).toFixed(2));
            daysCoverSource = 'USAGE';
          }
        }

        if (daysCover !== null) {
          if (daysCover <= HEATMAP_CRITICAL_DAYS) {
            risk = 'CRITICAL_SHORTAGE';
          } else if (daysCover <= HEATMAP_LOW_DAYS) {
            risk = 'LOW_COVER';
          } else {
            risk = 'ADEQUATE';
          }
        } else {
          risk = 'UNKNOWN';
        }

        summary[risk]++;

        rows.push({
          hospitalId: r.hospital_id,
          hospitalName: r.hospital_name,
          hospitalDrugId: r.hospital_drug_id,
          drugName: r.drug_name,
          ved: r.ved as 'V' | 'E' | 'D',
          usableStock,
          daysCover,
          risk,
          daysCoverSource,
        });
      }

      // Sort worst-first: CRITICAL_SHORTAGE, then LOW_COVER, then UNKNOWN, then ADEQUATE
      const riskRank: Record<string, number> = {
        CRITICAL_SHORTAGE: 0,
        LOW_COVER: 1,
        UNKNOWN: 2,
        ADEQUATE: 3,
      };

      rows.sort((a, b) => {
        const rankDiff = riskRank[a.risk] - riskRank[b.risk];
        if (rankDiff !== 0) return rankDiff;
        if (a.daysCover !== null && b.daysCover !== null) {
          return a.daysCover - b.daysCover;
        }
        if (a.daysCover === null && b.daysCover !== null) return -1;
        if (a.daysCover !== null && b.daysCover === null) return 1;
        return a.hospitalName.localeCompare(b.hospitalName);
      });

      return {
        success: true,
        data: {
          regionId,
          summary,
          items: rows.slice(0, limit),
          returnedCount: Math.min(rows.length, limit),
          assumptions: {
            heatmapCriticalDays: HEATMAP_CRITICAL_DAYS,
            heatmapLowDays: HEATMAP_LOW_DAYS,
            usageWindowDays: 30,
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve regional stock heatmap: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: get_regional_surge_signals ---

/**
 * Tool: get_regional_surge_signals
 * Retrieves epidemiological, seasonal, and demand surge signals for the scoped region from context_signal.
 * Allowed Roles: REGION_ADMIN, SYSTEM_ADMIN
 */
export const getRegionalSurgeSignalsTool: IAgentTool<{
  regionId?: string;
  includeExpired?: boolean;
}> = {
  name: 'get_regional_surge_signals',
  description:
    'Retrieves external context signals (disease outbreaks, seasonal peaks, events, and abnormal demand) for the region.',
  parameters: z.object({
    regionId: z
      .string()
      .uuid()
      .optional()
      .describe('Region UUID (optional for REGION_ADMIN; required for SYSTEM_ADMIN if not in context)'),
    includeExpired: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to include expired historical signals (default false)'),
  }),
  allowedRoles: ['REGION_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureRegionScope(context, args.regionId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const regionId = scope.regionId;
      if (!regionId) {
        return {
          success: false,
          error: 'Region ID is required. Please specify regionId in arguments or request context.',
        };
      }

      const includeExpired = args.includeExpired ?? false;

      let dateFilter = '';
      const params: unknown[] = [regionId];

      if (!includeExpired) {
        dateFilter = 'AND cs.valid_from <= CURRENT_DATE AND (cs.valid_to IS NULL OR cs.valid_to >= CURRENT_DATE)';
      }

      const sql = `
        SELECT cs.id,
               cs.region_id,
               cs.signal_type,
               cs.payload,
               cs.valid_from::text AS valid_from,
               cs.valid_to::text AS valid_to,
               cs.source,
               (cs.approved_by IS NOT NULL) AS is_approved,
               cs.created_at::text AS created_at
          FROM context_signal cs
         WHERE (cs.region_id = $1 OR cs.region_id IS NULL)
               ${dateFilter}
         ORDER BY cs.valid_from DESC, cs.created_at DESC
      `;

      const res = await query<{
        id: string;
        region_id: string | null;
        signal_type: string;
        payload: Record<string, unknown>;
        valid_from: string;
        valid_to: string | null;
        source: string;
        is_approved: boolean;
        created_at: string;
      }>(sql, params);

      return {
        success: true,
        data: {
          regionId,
          includeExpired,
          count: res.rows.length,
          signals: res.rows,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve regional surge signals: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: simulate_pool_allocation ---

export interface PoolAllocationCandidate {
  hospitalId: string;
  hospitalName: string;
  distanceKm: number | null;
  travelMinutes: number | null;
  demandQty: number;
  allocatedQty: number;
  daysOfStock: number;
  transportCostThb: number;
}

/**
 * Tool: simulate_pool_allocation
 * Simulates the F-22 split of a near-expiry pool lot with the code the allocation plans use (expiry/matching.ts):
 * receivers with a verified mapping that can use it before expiry, fewest days of stock first. No mutations are performed.
 * Allowed Roles: REGION_ADMIN, SYSTEM_ADMIN
 */
export const simulatePoolAllocationTool: IAgentTool<{
  poolEntryId: string;
  maxCandidates?: number;
}> = {
  name: 'simulate_pool_allocation',
  description:
    'Simulates the F-22 split of a near-expiry pool entry (the same rule allocation plans are checked against): region hospitals with a verified mapping that can use it before expiry, fewest days of stock first.',
  parameters: z.object({
    poolEntryId: z.string().uuid().describe('UUID of the pool_entry to simulate allocation for'),
    maxCandidates: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe('Maximum candidate hospitals to consider (default 5)'),
  }),
  allowedRoles: ['REGION_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureRegionScope(context);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const scopedRegionId = scope.regionId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const maxCandidates = args.maxCandidates ?? 5;

      // Read pool entry details
      const peRes = await query<{
        id: string;
        region_id: string;
        qty_available: string;
        source_hospital_id: string;
        source_hospital_name: string;
        drug_master_id: string;
        generic_name: string;
        is_controlled: boolean;
        lot_no: string;
        expiry_date: string;
        days_left: number;
        value_thb: string;
      }>(
        `SELECT pe.id,
                pe.region_id,
                pe.qty_available::text AS qty_available,
                ne.hospital_id AS source_hospital_id,
                h_src.name_th AS source_hospital_name,
                dm.id AS drug_master_id,
                dm.generic_name,
                COALESCE(dm.is_controlled, false) AS is_controlled,
                sl.lot_no,
                sl.expiry_date::text AS expiry_date,
                ne.days_left,
                ne.value_thb::text AS value_thb
           FROM pool_entry pe
           JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
           JOIN hospital h_src ON h_src.id = ne.hospital_id
           JOIN stock_lot sl ON sl.id = ne.lot_id
           JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
           JOIN drug_master dm ON dm.id = hd.drug_master_id
          WHERE pe.id = $1`,
        [args.poolEntryId],
      );

      if (peRes.rows.length === 0) {
        return {
          success: false,
          error: `Pool entry '${args.poolEntryId}' not found.`,
        };
      }

      const pe = peRes.rows[0];

      // Region tenant isolation check
      if (!isSystemAdmin && scopedRegionId && pe.region_id !== scopedRegionId) {
        return {
          success: false,
          error: 'Permission denied: Pool entry belongs to another region.',
        };
      }

      // BR-F1b-014: Controlled substances are never automated or pooled
      if (pe.is_controlled) {
        return {
          success: false,
          error: 'Cannot allocate pool entry: controlled substances are never auto-allocated (BR-F1b-014).',
        };
      }

      const initialAvailable = toNumber(pe.qty_available, 0);
      if (initialAvailable <= 0) {
        return {
          success: true,
          data: {
            poolEntryId: pe.id,
            drugName: pe.generic_name,
            initialAvailable: 0,
            totalAllocated: 0,
            remainingAvailable: 0,
            allocations: [],
            simulationOnly: true,
            note: 'Pool entry has zero quantity available for allocation.',
          },
        };
      }

      // The same candidates and split the allocation agent and a hand-made plan are checked against (F-22 / BR-F2a-025:
      // verified mapping, can use it before expiry, fewest days of stock first), so the simulation shows the plan the system
      // would actually accept.
      const lot = await loadPoolLot(db, pe.id);
      if (!lot) return { success: false, error: `Pool entry '${args.poolEntryId}' not found.` };
      const { life, candidates } = await demandCandidates(db, lot);
      const considered = candidates.slice(0, maxCandidates);
      const split = ruleSplit(lot, life, considered);

      let remaining = initialAvailable;
      const allocations: PoolAllocationCandidate[] = split.map((line) => {
        const c = considered.find((x) => x.hospitalId === line.receiverHospitalId)!;
        remaining = Number((remaining - line.qty).toFixed(3));
        return {
          hospitalId: c.hospitalId,
          hospitalName: c.name,
          distanceKm: c.km,
          travelMinutes: Math.round(c.transitDays * 1440),
          demandQty: c.cap?.deficit ?? 0,
          allocatedQty: line.qty,
          daysOfStock: Math.round((c.stock / c.usePerDay) * 10) / 10,
          transportCostThb: c.transportCostThb,
        };
      });

      const totalAllocated = Number((initialAvailable - remaining).toFixed(3));

      return {
        success: true,
        data: {
          poolEntryId: pe.id,
          regionId: pe.region_id,
          drugName: pe.generic_name,
          lotNo: pe.lot_no,
          daysLeft: pe.days_left,
          sourceHospitalId: pe.source_hospital_id,
          sourceHospitalName: pe.source_hospital_name,
          initialAvailable,
          totalAllocated,
          remainingAvailable: remaining,
          candidateCount: considered.length,
          allocations,
          method: 'F-22 greedy (fewest days of stock first, then shorter transit)',
          /** Why the owner could not turn this lot into a plan right now (null = it can). */
          blocker: poolLotBlocker(lot),
          simulationOnly: true,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to simulate pool allocation: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: get_regional_directives ---

const SENSITIVE_KEY_PATTERN = /secret|key|token|password|credential|byok|auth/i;

/**
 * Tool: get_regional_directives
 * Merges active context signals and regional policy configurations into a unified directives briefing.
 * Redacts any sensitive keys.
 * Allowed Roles: REGION_ADMIN, SYSTEM_ADMIN
 */
export const getRegionalDirectivesTool: IAgentTool<{
  regionId?: string;
}> = {
  name: 'get_regional_directives',
  description:
    'Retrieves regional operational directives by combining active context signals with regional policy configurations.',
  parameters: z.object({
    regionId: z
      .string()
      .uuid()
      .optional()
      .describe('Region UUID (optional for REGION_ADMIN; required for SYSTEM_ADMIN if not in context)'),
  }),
  allowedRoles: ['REGION_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureRegionScope(context, args.regionId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const regionId = scope.regionId;
      if (!regionId) {
        return {
          success: false,
          error: 'Region ID is required. Please specify regionId in arguments or request context.',
        };
      }

      // 1. Active context signals for this region
      const signalRes = await query<{
        id: string;
        signal_type: string;
        payload: Record<string, unknown>;
        valid_from: string;
        valid_to: string | null;
        source: string;
      }>(
        `SELECT cs.id,
                cs.signal_type,
                cs.payload,
                cs.valid_from::text AS valid_from,
                cs.valid_to::text AS valid_to,
                cs.source
           FROM context_signal cs
          WHERE (cs.region_id = $1 OR cs.region_id IS NULL)
            AND cs.valid_from <= CURRENT_DATE
            AND (cs.valid_to IS NULL OR cs.valid_to >= CURRENT_DATE)
          ORDER BY cs.valid_from DESC`,
        [regionId],
      );

      // 2. Region-specific and justifiable global config policies
      const configRes = await query<{
        key: string;
        scope: string;
        value: unknown;
        description: string | null;
      }>(
        `SELECT key, scope, value, description
           FROM config_setting
          WHERE scope = 'REGION:' || $1
             OR (scope = 'GLOBAL' AND (
                  key LIKE 'agent.%' OR
                  key LIKE 'expiry.%' OR
                  key LIKE 'borrow.%' OR
                  key LIKE 'emergency.%'
                ))
          ORDER BY scope DESC, key ASC`,
        [regionId],
      );

      // Redact any config keys containing sensitive tokens
      const policies = configRes.rows
        .filter((row) => !SENSITIVE_KEY_PATTERN.test(row.key))
        .map((row) => ({
          key: row.key,
          scope: row.scope,
          value: row.value,
          description: row.description,
        }));

      return {
        success: true,
        data: {
          regionId,
          signals: signalRes.rows,
          policies,
          sources: ['context_signal', 'config_setting'],
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve regional directives: ${e.message}`,
      };
    }
  },
};

// --- TOOL 5: submit_region_admin_proposal (TERMINAL) ---

/**
 * Tool: submit_region_admin_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for regional administrative decisions:
 * - CREATE_CONTEXT_SIGNAL: Proposes a new regional outbreak, seasonality, or surge context signal.
 * - RESOLVE_ALLOCATION_OPTION: Proposes choosing an operational option for an uneconomical near-expiry allocation plan.
 * Allowed Roles: REGION_ADMIN, SYSTEM_ADMIN
 */
export const submitRegionAdminProposalTool: IAgentTool<{
  action: 'CREATE_CONTEXT_SIGNAL' | 'RESOLVE_ALLOCATION_OPTION';
  signalType?: string;
  payload?: Record<string, unknown>;
  validFrom?: string;
  validTo?: string;
  allocationPlanId?: string;
  optionId?: 'MERGE_SHIPMENTS' | 'RAISE_VALUE' | 'DONATE_OR_DISCARD' | 'HOLD';
  note?: string;
  regionId?: string;
}> = {
  name: 'submit_region_admin_proposal',
  description:
    'Terminal proposal tool creating human-in-the-loop action proposals for creating context signals or resolving uneconomical allocation plans.',
  parameters: z.object({
    action: z
      .enum(['CREATE_CONTEXT_SIGNAL', 'RESOLVE_ALLOCATION_OPTION'])
      .describe('Regional executive action to propose'),
    signalType: z
      .string()
      .optional()
      .describe('Signal type for CREATE_CONTEXT_SIGNAL (e.g. OUTBREAK, SEASON, EVENT, ABNORMAL_DEMAND)'),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Structured payload data for CREATE_CONTEXT_SIGNAL'),
    validFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'validFrom must be YYYY-MM-DD')
      .optional()
      .describe('Effective start date (YYYY-MM-DD) for CREATE_CONTEXT_SIGNAL'),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'validTo must be YYYY-MM-DD')
      .optional()
      .describe('Optional expiration date (YYYY-MM-DD) for CREATE_CONTEXT_SIGNAL'),
    allocationPlanId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of allocation_plan for RESOLVE_ALLOCATION_OPTION'),
    optionId: z
      .enum(['MERGE_SHIPMENTS', 'RAISE_VALUE', 'DONATE_OR_DISCARD', 'HOLD'])
      .optional()
      .describe('Chosen resolution option for uneconomical allocation plan'),
    note: z
      .string()
      .optional()
      .describe('Optional rationale or justification note for the proposal'),
    regionId: z
      .string()
      .uuid()
      .optional()
      .describe('Region UUID (SYSTEM_ADMIN only; REGION_ADMIN uses scoped region)'),
  }),
  allowedRoles: ['REGION_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureRegionScope(context, args.regionId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const targetRegionId = scope.regionId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (args.action === 'CREATE_CONTEXT_SIGNAL') {
        if (!targetRegionId) {
          return {
            success: false,
            error: 'Region ID is required to propose a regional context signal.',
          };
        }
        if (!args.signalType || !args.signalType.trim()) {
          return {
            success: false,
            error: 'signalType is required for CREATE_CONTEXT_SIGNAL.',
          };
        }
        if (!args.payload || typeof args.payload !== 'object' || Array.isArray(args.payload)) {
          return {
            success: false,
            error: 'payload (object) is required for CREATE_CONTEXT_SIGNAL.',
          };
        }
        if (!args.validFrom) {
          return {
            success: false,
            error: 'validFrom (YYYY-MM-DD) is required for CREATE_CONTEXT_SIGNAL.',
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.REGION_ADMIN.CREATE_CONTEXT_SIGNAL;
        const endpoint = actionDef.endpointTemplate;

        const actionPayload: Record<string, unknown> = {
          regionId: targetRegionId,
          signalType: args.signalType.trim(),
          payload: args.payload,
          validFrom: args.validFrom,
          source: context.role || 'REGION_ADMIN',
          ...(args.validTo ? { validTo: args.validTo } : {}),
          ...(args.note ? { note: args.note.trim() } : {}),
        };

        const summary: Record<string, unknown> = {
          action: 'CREATE_CONTEXT_SIGNAL',
          regionId: targetRegionId,
          signalType: args.signalType.trim(),
          validFrom: args.validFrom,
          validTo: args.validTo ?? null,
          note: args.note?.trim() ?? null,
        };

        const proposal: ToolProposalPayload = {
          type: 'CREATE_CONTEXT_SIGNAL',
          title: `Proposal: Create Regional Context Signal (${args.signalType.trim()})`,
          description: `Propose creating regional context signal '${args.signalType.trim()}' for region ${targetRegionId} active from ${args.validFrom}${args.validTo ? ' to ' + args.validTo : ''}.${args.note ? ' Note: ' + args.note.trim() : ''}`,
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

      if (args.action === 'RESOLVE_ALLOCATION_OPTION') {
        if (!args.allocationPlanId) {
          return {
            success: false,
            error: 'allocationPlanId is required for RESOLVE_ALLOCATION_OPTION.',
          };
        }
        if (!args.optionId) {
          return {
            success: false,
            error: 'optionId (MERGE_SHIPMENTS, RAISE_VALUE, DONATE_OR_DISCARD, HOLD) is required for RESOLVE_ALLOCATION_OPTION.',
          };
        }

        const planRes = await query<{
          id: string;
          plan_no: string;
          region_id: string;
          status: string;
          economical: boolean | null;
          option_chosen: string | null;
          version: number;
        }>(
          `SELECT id, plan_no, region_id, status::text AS status, economical, option_chosen, version
             FROM allocation_plan
            WHERE id = $1`,
          [args.allocationPlanId],
        );

        if (planRes.rows.length === 0) {
          return {
            success: false,
            error: `Allocation plan '${args.allocationPlanId}' not found.`,
          };
        }

        const plan = planRes.rows[0];

        // Region isolation check
        if (!isSystemAdmin && targetRegionId && plan.region_id !== targetRegionId) {
          return {
            success: false,
            error: 'Permission denied: Allocation plan belongs to another region.',
          };
        }

        if (plan.option_chosen) {
          return {
            success: false,
            error: `Cannot resolve allocation option: option has already been chosen ('${plan.option_chosen}').`,
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.REGION_ADMIN.RESOLVE_ALLOCATION_OPTION;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: plan.id });

        const actionPayload: Record<string, unknown> = {
          option: args.optionId,
          version: plan.version,
          ...(args.note ? { reason: args.note.trim() } : {}),
        };

        const summary: Record<string, unknown> = {
          action: 'RESOLVE_ALLOCATION_OPTION',
          allocationPlanId: plan.id,
          planNo: plan.plan_no,
          optionChosen: args.optionId,
          version: plan.version,
          reason: args.note?.trim() ?? null,
        };

        const proposal: ToolProposalPayload = {
          type: 'RESOLVE_ALLOCATION_OPTION',
          title: `Proposal: Resolve Allocation Plan Option for ${plan.plan_no}`,
          description: `Propose resolving uneconomical allocation plan ${plan.plan_no} with option '${args.optionId}'.${args.note ? ' Justification: ' + args.note.trim() : ''}`,
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
        error: `Failed to submit region admin proposal: ${e.message}`,
      };
    }
  },
};

/**
 * All 5 Region Admin domain tools.
 */
export const regionAdminTools = [
  getRegionalStockHeatmapTool,
  getRegionalSurgeSignalsTool,
  simulatePoolAllocationTool,
  getRegionalDirectivesTool,
  submitRegionAdminProposalTool,
];
