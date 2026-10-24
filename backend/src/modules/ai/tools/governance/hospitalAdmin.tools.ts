import { z } from 'zod';
import { query } from '../../../../db/client.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import {
  ANOMALY_EMERGENCY_BORROW_THRESHOLD,
  ANOMALY_EXPIRY_VALUE_THRESHOLD_THB,
  ANOMALY_LOOKBACK_DAYS_DEFAULT,
  ANOMALY_OVERDUE_RETURNS_THRESHOLD,
  ANOMALY_STOCKOUT_COUNT_THRESHOLD,
  buildEndpoint,
  ensureHospitalScope,
  PROPOSAL_ACTION_WHITELIST,
  toNumber,
  WAIVER_HIGH_VALUE_THRESHOLD_THB,
  WAIVER_MEDIUM_VALUE_THRESHOLD_THB,
} from './governance.utils.js';

// --- TOOL 1: get_hospital_kpi_dashboard ---

/**
 * Tool: get_hospital_kpi_dashboard
 * Aggregates high-level hospital KPIs: active stockouts, active borrow requests, pending return obligations,
 * expiring inventory value, and 30-day fulfillment rate.
 * Allowed Roles: HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const getHospitalKpiDashboardTool: IAgentTool<{
  hospitalId?: string;
}> = {
  name: 'get_hospital_kpi_dashboard',
  description:
    'Retrieves high-level executive KPIs for a hospital: active stockouts, active borrow requests, pending returns, near-expiry value, and 30-day fulfillment rate.',
  parameters: z.object({
    hospitalId: z
      .string()
      .uuid()
      .optional()
      .describe('Hospital UUID (optional for HOSPITAL_ADMIN; required for SYSTEM_ADMIN if not in context)'),
  }),
  allowedRoles: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureHospitalScope(context, args.hospitalId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const hospitalId = scope.hospitalId;
      if (!hospitalId) {
        return {
          success: false,
          error: 'Hospital ID is required. Please specify hospitalId in arguments or request context.',
        };
      }

      // 1. Active stockouts count
      const stockoutRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM stock_alert
          WHERE hospital_id = $1
            AND status IN ('OPEN', 'ACKNOWLEDGED', 'LINKED_TO_REQUEST', 'SNOOZED')`,
        [hospitalId],
      );

      // 2. Active borrow requests count
      const borrowRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM borrow_request
          WHERE borrower_hospital_id = $1
            AND status IN ('PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED')`,
        [hospitalId],
      );

      // 3. Pending return obligations count
      const returnRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM return_obligation
          WHERE debtor_hospital_id = $1
            AND status IN ('OPEN', 'REMINDED', 'OVERDUE')`,
        [hospitalId],
      );

      // 4. Expiring inventory value (THB)
      const expiryRes = await query<{ total_value: string }>(
        `SELECT COALESCE(SUM(value_thb), 0)::text AS total_value
           FROM near_expiry_item
          WHERE hospital_id = $1
            AND status IN ('DETECTED', 'RELEASED_TO_POOL')`,
        [hospitalId],
      );

      // 5. 30-day borrow fulfillment rate
      const fulfillmentRes = await query<{ total: string; fulfilled: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'FULFILLED')::text AS fulfilled
           FROM borrow_request
          WHERE borrower_hospital_id = $1
            AND status <> 'DRAFT'
            AND created_at >= NOW() - INTERVAL '30 days'`,
        [hospitalId],
      );

      const totalRequests = toNumber(fulfillmentRes.rows[0]?.total, 0);
      const fulfilledRequests = toNumber(fulfillmentRes.rows[0]?.fulfilled, 0);

      const fulfillment30d =
        totalRequests === 0
          ? {
              totalRequests: 0,
              fulfilledRequests: 0,
              fulfillmentRate: null,
              ratePercentage: 0,
              hasData: false,
            }
          : {
              totalRequests,
              fulfilledRequests,
              fulfillmentRate: Number((fulfilledRequests / totalRequests).toFixed(4)),
              ratePercentage: Number(((fulfilledRequests / totalRequests) * 100).toFixed(1)),
              hasData: true,
            };

      return {
        success: true,
        data: {
          hospitalId,
          activeStockouts: toNumber(stockoutRes.rows[0]?.count, 0),
          activeBorrowRequests: toNumber(borrowRes.rows[0]?.count, 0),
          pendingReturnObligations: toNumber(returnRes.rows[0]?.count, 0),
          expiringInventoryValueThb: toNumber(expiryRes.rows[0]?.total_value, 0),
          fulfillment30d,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve hospital KPI dashboard: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: get_waiver_impact_analysis ---

/**
 * Tool: get_waiver_impact_analysis
 * Analyzes the financial and clinical impact of waiving a return obligation between debtor and creditor hospitals.
 * Allowed Roles: HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const getWaiverImpactAnalysisTool: IAgentTool<{
  obligationId: string;
}> = {
  name: 'get_waiver_impact_analysis',
  description:
    'Evaluates the financial loss, controlled drug risk, and clinical severity of waiving an outstanding return obligation.',
  parameters: z.object({
    obligationId: z.string().uuid().describe('UUID of the return obligation to analyze'),
  }),
  allowedRoles: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const myHospitalId = context.hospitalId;

      const res = await query<{
        id: string;
        debtor_hospital_id: string;
        debtor_hospital_name: string;
        creditor_hospital_id: string;
        creditor_hospital_name: string;
        drug_master_id: string | null;
        drug_name: string | null;
        is_controlled: boolean | null;
        qty: string;
        qty_returned: string;
        status: string;
        due_date: string;
        unit_price_thb: string | null;
      }>(
        `SELECT ro.id,
                ro.debtor_hospital_id,
                dh.name_th AS debtor_hospital_name,
                ro.creditor_hospital_id,
                ch.name_th AS creditor_hospital_name,
                ro.drug_master_id,
                dm.generic_name AS drug_name,
                COALESCE(dm.is_controlled, false) AS is_controlled,
                ro.qty::text AS qty,
                ro.qty_returned::text AS qty_returned,
                ro.status::text AS status,
                ro.due_date::text AS due_date,
                hd.unit_price_thb::text AS unit_price_thb
           FROM return_obligation ro
           JOIN hospital dh ON dh.id = ro.debtor_hospital_id
           JOIN hospital ch ON ch.id = ro.creditor_hospital_id
           LEFT JOIN drug_master dm ON dm.id = ro.drug_master_id
           LEFT JOIN hospital_drug hd ON hd.drug_master_id = dm.id AND hd.hospital_id = ro.creditor_hospital_id
          WHERE ro.id = $1`,
        [args.obligationId],
      );

      if (res.rows.length === 0) {
        return {
          success: false,
          error: `Return obligation '${args.obligationId}' not found.`,
        };
      }

      const row = res.rows[0];

      // Tenant check: Non-SYSTEM_ADMIN callers may only inspect obligations where their hospital is debtor or creditor
      if (!isSystemAdmin) {
        if (!myHospitalId || (row.debtor_hospital_id !== myHospitalId && row.creditor_hospital_id !== myHospitalId)) {
          return {
            success: false,
            error: 'Permission denied: Caller hospital is neither debtor nor creditor of this obligation.',
          };
        }
      }

      const qty = toNumber(row.qty, 0);
      const qtyReturned = toNumber(row.qty_returned, 0);
      const outstandingQty = Math.max(0, qty - qtyReturned);
      const unitPriceThb = toNumber(row.unit_price_thb, 0);
      const estimatedLossThb = Number((outstandingQty * unitPriceThb).toFixed(2));
      const isControlled = Boolean(row.is_controlled);

      let severity: 'HIGH' | 'MEDIUM' | 'LOW';
      if (isControlled || estimatedLossThb >= WAIVER_HIGH_VALUE_THRESHOLD_THB) {
        severity = 'HIGH';
      } else if (estimatedLossThb >= WAIVER_MEDIUM_VALUE_THRESHOLD_THB) {
        severity = 'MEDIUM';
      } else {
        severity = 'LOW';
      }

      const alreadyClosed = row.status === 'WAIVED' || row.status === 'RETURNED';

      return {
        success: true,
        data: {
          obligationId: row.id,
          debtorHospitalId: row.debtor_hospital_id,
          debtorHospitalName: row.debtor_hospital_name,
          creditorHospitalId: row.creditor_hospital_id,
          creditorHospitalName: row.creditor_hospital_name,
          drugName: row.drug_name ?? 'Unknown Drug',
          outstandingQty,
          unitPriceThb,
          estimatedLossThb,
          severity,
          isControlled,
          status: row.status,
          dueDate: row.due_date,
          ...(alreadyClosed ? { alreadyClosed: true } : {}),
          assumptions: {
            waiverHighValueThresholdThb: WAIVER_HIGH_VALUE_THRESHOLD_THB,
            waiverMediumValueThresholdThb: WAIVER_MEDIUM_VALUE_THRESHOLD_THB,
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to analyze waiver impact: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: audit_hospital_anomalies ---

export interface HospitalAnomalyItem {
  code:
    | 'STOCKOUT_FREQUENCY_SPIKE'
    | 'FREQUENT_EMERGENCY_BORROWING'
    | 'EXPIRY_FINANCIAL_RISK'
    | 'DELINQUENT_RETURNS';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  observed: number;
  threshold: number;
  detail: string;
}

/**
 * Tool: audit_hospital_anomalies
 * Detects operational anomalies across stockout spikes, repeated emergency borrowing, near-expiry financial risk,
 * and delinquent return obligations.
 * Allowed Roles: HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const auditHospitalAnomaliesTool: IAgentTool<{
  hospitalId?: string;
  lookbackDays?: number;
}> = {
  name: 'audit_hospital_anomalies',
  description:
    'Audits hospital operational health and flags anomalies: stockout frequency spikes, excessive emergency borrowing, expiry value exposure, and overdue returns.',
  parameters: z.object({
    hospitalId: z
      .string()
      .uuid()
      .optional()
      .describe('Hospital UUID (optional for HOSPITAL_ADMIN; required for SYSTEM_ADMIN if not in context)'),
    lookbackDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .default(ANOMALY_LOOKBACK_DAYS_DEFAULT)
      .describe(`Lookback window in days (default ${ANOMALY_LOOKBACK_DAYS_DEFAULT})`),
  }),
  allowedRoles: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const scope = ensureHospitalScope(context, args.hospitalId);
      if (!scope.ok) {
        return { success: false, error: scope.error };
      }

      const hospitalId = scope.hospitalId;
      if (!hospitalId) {
        return {
          success: false,
          error: 'Hospital ID is required. Please specify hospitalId in arguments or request context.',
        };
      }

      const lookback = args.lookbackDays ?? ANOMALY_LOOKBACK_DAYS_DEFAULT;
      const anomalies: HospitalAnomalyItem[] = [];

      // 1. Stockout frequency spike
      const stockoutRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM stock_alert
          WHERE hospital_id = $1
            AND created_at >= NOW() - ($2 || ' days')::interval`,
        [hospitalId, lookback],
      );
      const stockoutCount = toNumber(stockoutRes.rows[0]?.count, 0);
      if (stockoutCount >= ANOMALY_STOCKOUT_COUNT_THRESHOLD) {
        anomalies.push({
          code: 'STOCKOUT_FREQUENCY_SPIKE',
          severity: 'HIGH',
          observed: stockoutCount,
          threshold: ANOMALY_STOCKOUT_COUNT_THRESHOLD,
          detail: `Recorded ${stockoutCount} stock alerts in the last ${lookback} days (threshold: >= ${ANOMALY_STOCKOUT_COUNT_THRESHOLD}).`,
        });
      }

      // 2. Frequent emergency borrowing (VERY_URGENT)
      const emergencyRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM borrow_request
          WHERE borrower_hospital_id = $1
            AND urgency = 'VERY_URGENT'
            AND created_at >= NOW() - ($2 || ' days')::interval`,
        [hospitalId, lookback],
      );
      const emergencyCount = toNumber(emergencyRes.rows[0]?.count, 0);
      if (emergencyCount >= ANOMALY_EMERGENCY_BORROW_THRESHOLD) {
        anomalies.push({
          code: 'FREQUENT_EMERGENCY_BORROWING',
          severity: 'HIGH',
          observed: emergencyCount,
          threshold: ANOMALY_EMERGENCY_BORROW_THRESHOLD,
          detail: `Triggered ${emergencyCount} VERY_URGENT borrow requests in the last ${lookback} days (threshold: >= ${ANOMALY_EMERGENCY_BORROW_THRESHOLD}).`,
        });
      }

      // 3. Expiry financial risk (<= 30 days left)
      const expiryRes = await query<{ total_value: string }>(
        `SELECT COALESCE(SUM(value_thb), 0)::text AS total_value
           FROM near_expiry_item
          WHERE hospital_id = $1
            AND status IN ('DETECTED', 'RELEASED_TO_POOL')
            AND days_left <= 30`,
        [hospitalId],
      );
      const expiryValue = toNumber(expiryRes.rows[0]?.total_value, 0);
      if (expiryValue >= ANOMALY_EXPIRY_VALUE_THRESHOLD_THB) {
        anomalies.push({
          code: 'EXPIRY_FINANCIAL_RISK',
          severity: 'MEDIUM',
          observed: expiryValue,
          threshold: ANOMALY_EXPIRY_VALUE_THRESHOLD_THB,
          detail: `Near-expiry inventory (<= 30 days remaining) value is ${expiryValue.toLocaleString()} THB (threshold: >= ${ANOMALY_EXPIRY_VALUE_THRESHOLD_THB.toLocaleString()} THB).`,
        });
      }

      // 4. Delinquent overdue returns
      const overdueRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM return_obligation
          WHERE debtor_hospital_id = $1
            AND status = 'OVERDUE'`,
        [hospitalId],
      );
      const overdueCount = toNumber(overdueRes.rows[0]?.count, 0);
      if (overdueCount >= ANOMALY_OVERDUE_RETURNS_THRESHOLD) {
        anomalies.push({
          code: 'DELINQUENT_RETURNS',
          severity: 'HIGH',
          observed: overdueCount,
          threshold: ANOMALY_OVERDUE_RETURNS_THRESHOLD,
          detail: `Hospital has ${overdueCount} overdue return obligations (threshold: >= ${ANOMALY_OVERDUE_RETURNS_THRESHOLD}).`,
        });
      }

      return {
        success: true,
        data: {
          hospitalId,
          lookbackDays: lookback,
          healthy: anomalies.length === 0,
          anomalies,
          assumptions: {
            stockoutCountThreshold: ANOMALY_STOCKOUT_COUNT_THRESHOLD,
            emergencyBorrowThreshold: ANOMALY_EMERGENCY_BORROW_THRESHOLD,
            expiryFinancialRiskThresholdThb: ANOMALY_EXPIRY_VALUE_THRESHOLD_THB,
            overdueReturnsThreshold: ANOMALY_OVERDUE_RETURNS_THRESHOLD,
            lookbackDaysDefault: ANOMALY_LOOKBACK_DAYS_DEFAULT,
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to audit hospital anomalies: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: submit_hospital_admin_proposal (TERMINAL) ---

/**
 * Tool: submit_hospital_admin_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for executive Hospital Admin actions:
 * - WAIVE_RETURN_OBLIGATION: Waives an outstanding return obligation with documented rationale.
 * - APPROVE_INCIDENT_PLAN: Formally approves an emergency incident inventory allocation plan.
 * - ESCALATE_BORROW_MANUAL: Manually escalates a borrow request to off-ladder lenders.
 * Allowed Roles: HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const submitHospitalAdminProposalTool: IAgentTool<{
  action: 'WAIVE_RETURN_OBLIGATION' | 'APPROVE_INCIDENT_PLAN' | 'ESCALATE_BORROW_MANUAL';
  obligationId?: string;
  incidentId?: string;
  borrowRequestId?: string;
  reason?: string;
  note?: string;
}> = {
  name: 'submit_hospital_admin_proposal',
  description:
    'Terminal proposal tool creating human-in-the-loop action proposals for waiving return obligations, approving incident plans, or manually escalating borrow requests.',
  parameters: z.object({
    action: z
      .enum(['WAIVE_RETURN_OBLIGATION', 'APPROVE_INCIDENT_PLAN', 'ESCALATE_BORROW_MANUAL'])
      .describe('Executive hospital admin action to propose'),
    obligationId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of return obligation (required for WAIVE_RETURN_OBLIGATION)'),
    incidentId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of emergency incident (required for APPROVE_INCIDENT_PLAN)'),
    borrowRequestId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of borrow request (required for ESCALATE_BORROW_MANUAL)'),
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .optional()
      .describe('Justification for waiver or manual escalation (minimum 10 characters)'),
    note: z
      .string()
      .optional()
      .describe('Optional executive approval note for incident plan'),
  }),
  allowedRoles: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const myHospitalId = context.hospitalId;

      if (args.action === 'WAIVE_RETURN_OBLIGATION') {
        if (!args.obligationId) {
          return {
            success: false,
            error: 'obligationId is required for action WAIVE_RETURN_OBLIGATION.',
          };
        }
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for action WAIVE_RETURN_OBLIGATION.',
          };
        }

        const obRes = await query<{
          id: string;
          debtor_hospital_id: string;
          creditor_hospital_id: string;
          status: string;
          qty: string;
          qty_returned: string;
          generic_name: string | null;
        }>(
          `SELECT ro.id,
                  ro.debtor_hospital_id,
                  ro.creditor_hospital_id,
                  ro.status::text AS status,
                  ro.qty::text AS qty,
                  ro.qty_returned::text AS qty_returned,
                  dm.generic_name
             FROM return_obligation ro
             LEFT JOIN drug_master dm ON dm.id = ro.drug_master_id
            WHERE ro.id = $1`,
          [args.obligationId],
        );

        if (obRes.rows.length === 0) {
          return {
            success: false,
            error: `Return obligation '${args.obligationId}' not found.`,
          };
        }

        const ob = obRes.rows[0];

        // Tenant ownership check: caller hospital must be debtor or creditor (exempt for SYSTEM_ADMIN)
        if (!isSystemAdmin) {
          if (!myHospitalId || (ob.debtor_hospital_id !== myHospitalId && ob.creditor_hospital_id !== myHospitalId)) {
            return {
              success: false,
              error: 'Permission denied: Caller hospital is neither debtor nor creditor of this obligation.',
            };
          }
        }

        if (ob.status === 'WAIVED' || ob.status === 'RETURNED') {
          return {
            success: false,
            error: `Cannot waive return obligation: obligation is already in status '${ob.status}'.`,
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.HOSPITAL_ADMIN.WAIVE_RETURN_OBLIGATION;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: ob.id });
        const remainingQty = Math.max(0, toNumber(ob.qty) - toNumber(ob.qty_returned));

        const summary: Record<string, unknown> = {
          action: 'WAIVE_RETURN_OBLIGATION',
          obligationId: ob.id,
          drugName: ob.generic_name ?? 'Unknown Drug',
          remainingQty,
          reason: args.reason.trim(),
        };

        const proposal: ToolProposalPayload = {
          type: 'WAIVE_RETURN_OBLIGATION',
          title: `Proposal: Waive Return Obligation for ${ob.generic_name ?? 'Drug'}`,
          description: `Propose executive waiver of return obligation (${ob.id}) with remaining quantity ${remainingQty}. Justification: ${args.reason.trim()}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: {
              reason: args.reason.trim(),
            },
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

      if (args.action === 'APPROVE_INCIDENT_PLAN') {
        if (!args.incidentId) {
          return {
            success: false,
            error: 'incidentId is required for action APPROVE_INCIDENT_PLAN.',
          };
        }

        const incRes = await query<{
          id: string;
          hospital_id: string;
          incident_no: string;
          incident_type: string;
          status: string;
        }>(
          `SELECT id, hospital_id, incident_no, incident_type, status::text AS status
             FROM incident
            WHERE id = $1`,
          [args.incidentId],
        );

        if (incRes.rows.length === 0) {
          return {
            success: false,
            error: `Incident '${args.incidentId}' not found.`,
          };
        }

        const inc = incRes.rows[0];

        // Tenant ownership check
        if (!isSystemAdmin && myHospitalId && inc.hospital_id !== myHospitalId) {
          return {
            success: false,
            error: 'Permission denied: Incident belongs to another hospital.',
          };
        }

        // Check if there is an active emergency plan ready for approval
        const planRes = await query<{
          id: string;
          revision: number;
          status: string;
        }>(
          `SELECT id, revision, status::text AS status
             FROM emergency_plan
            WHERE incident_id = $1 AND status = 'READY_FOR_APPROVAL'
            ORDER BY revision DESC
            LIMIT 1`,
          [args.incidentId],
        );

        const plan = planRes.rows[0] as { id: string; revision: number; status: string } | undefined;
        if (!plan) {
          return {
            success: false,
            error: `No emergency plan with status 'READY_FOR_APPROVAL' found for incident '${args.incidentId}'.`,
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.HOSPITAL_ADMIN.APPROVE_INCIDENT_PLAN;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: inc.id });

        const payload: Record<string, unknown> = {
          planId: plan.id,
        };
        if (args.note && args.note.trim()) {
          payload.note = args.note.trim();
        }

        const summary: Record<string, unknown> = {
          action: 'APPROVE_INCIDENT_PLAN',
          incidentId: inc.id,
          incidentNo: inc.incident_no,
          incidentType: inc.incident_type,
          planId: plan.id,
          revision: plan.revision,
          note: args.note?.trim() ?? null,
        };

        const proposal: ToolProposalPayload = {
          type: 'APPROVE_INCIDENT_PLAN',
          title: `Proposal: Approve Emergency Incident Plan for ${inc.incident_no}`,
          description: `Propose executive approval for emergency incident plan (Incident: ${inc.incident_no} [${inc.incident_type}], Revision ${plan.revision}).${args.note ? ` Note: ${args.note.trim()}` : ''}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload,
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

      if (args.action === 'ESCALATE_BORROW_MANUAL') {
        if (!args.borrowRequestId) {
          return {
            success: false,
            error: 'borrowRequestId is required for action ESCALATE_BORROW_MANUAL.',
          };
        }
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for action ESCALATE_BORROW_MANUAL.',
          };
        }

        const reqRes = await query<{
          id: string;
          borrower_hospital_id: string;
          request_no: string;
          status: string;
          urgency: string;
        }>(
          `SELECT id, borrower_hospital_id, request_no, status::text AS status, urgency::text AS urgency
             FROM borrow_request
            WHERE id = $1`,
          [args.borrowRequestId],
        );

        if (reqRes.rows.length === 0) {
          return {
            success: false,
            error: `Borrow request '${args.borrowRequestId}' not found.`,
          };
        }

        const req = reqRes.rows[0];

        // Tenant ownership check
        if (!isSystemAdmin && myHospitalId && req.borrower_hospital_id !== myHospitalId) {
          return {
            success: false,
            error: 'Permission denied: Borrow request belongs to another hospital.',
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.HOSPITAL_ADMIN.ESCALATE_BORROW_MANUAL;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: req.id });

        const summary: Record<string, unknown> = {
          action: 'ESCALATE_BORROW_MANUAL',
          borrowRequestId: req.id,
          requestNo: req.request_no,
          urgency: req.urgency,
          reason: args.reason.trim(),
        };

        const proposal: ToolProposalPayload = {
          type: 'ESCALATE_BORROW_MANUAL',
          title: `Proposal: Manual Escalation for Borrow Request ${req.request_no}`,
          description: `Propose manual off-ladder escalation for request ${req.request_no}. Justification: ${args.reason.trim()}`,
          summary,
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: {
              reason: args.reason.trim(),
            },
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
        error: `Failed to submit hospital admin proposal: ${e.message}`,
      };
    }
  },
};

/**
 * All 4 Hospital Admin domain tools.
 */
export const hospitalAdminTools = [
  getHospitalKpiDashboardTool,
  getWaiverImpactAnalysisTool,
  auditHospitalAnomaliesTool,
  submitHospitalAdminProposalTool,
];
