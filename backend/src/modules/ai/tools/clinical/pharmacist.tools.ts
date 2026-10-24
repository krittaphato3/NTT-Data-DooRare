import { z } from 'zod';
import { query } from '../../../../db/client.js';
import { forecastsService } from '../../../forecasts/forecasts.service.js';
import type { IAgentTool, RequestContext, ToolResult } from '../tool.types.js';

/** BR-F1b-014: controlled drugs (narcotics/psychotropics) never enter the automatic borrow flow. */
export const CONTROLLED_DRUG_BLOCKED_MESSAGE =
  'Blocked (BR-F1b-014): controlled drugs (narcotics/psychotropics) are excluded from automation; use the regulated manual process.';

export async function isControlledDrugMaster(drugMasterId: string): Promise<boolean> {
  const r = await query<{ is_controlled: boolean | null }>(
    'SELECT is_controlled FROM drug_master WHERE id = $1',
    [drugMasterId],
  );
  return Boolean(r.rows[0]?.is_controlled);
}

/**
 * Tool: get_stock_and_alerts
 * Retrieves live usable stock, days of coverage, and active reorder alerts for a hospital drug.
 * Allowed Roles: PHARMACIST, HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const getStockAndAlertsTool: IAgentTool<{
  hospitalDrugId?: string;
  drugCode?: string;
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'ALL';
}> = {
  name: 'get_stock_and_alerts',
  description: 'Retrieves current usable stock, days of coverage, and active reorder alerts for hospital drugs.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().optional().describe('Optional UUID of the hospital drug'),
    drugCode: z.string().optional().describe('Optional local code or name search query for the drug'),
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'ALL']).optional().default('OPEN').describe('Filter by alert status (default OPEN)'),
  }),
  allowedRoles: ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for hospital-scoped stock and alert queries.',
        };
      }

      // If specific hospitalDrugId provided, enforce hospital ownership
      if (args.hospitalDrugId) {
        const hdCheck = await query<{ hospital_id: string }>(
          'SELECT hospital_id FROM hospital_drug WHERE id = $1',
          [args.hospitalDrugId],
        );
        if (hdCheck.rows.length === 0) {
          return { success: false, error: `Hospital drug '${args.hospitalDrugId}' not found.` };
        }
        if (!isSystemAdmin && hdCheck.rows[0].hospital_id !== hospitalId) {
          return {
            success: false,
            error: 'Permission denied: Cannot access drug belonging to another hospital.',
          };
        }
      }

      const params: unknown[] = [];
      const where: string[] = [];

      if (!isSystemAdmin || hospitalId) {
        params.push(hospitalId);
        where.push(`hd.hospital_id = $${params.length}`);
      }

      if (args.hospitalDrugId) {
        params.push(args.hospitalDrugId);
        where.push(`hd.id = $${params.length}`);
      }

      if (args.drugCode && args.drugCode.trim()) {
        params.push(`%${args.drugCode.trim()}%`);
        const pIdx = params.length;
        where.push(`(hd.local_code ILIKE $${pIdx} OR hd.local_name ILIKE $${pIdx} OR dm.generic_name ILIKE $${pIdx})`);
      }

      const alertStatus = args.status || 'OPEN';
      if (alertStatus !== 'ALL') {
        params.push(alertStatus);
        where.push(`a.status = $${params.length}`);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT hd.id AS "hospitalDrugId",
               hd.hospital_id AS "hospitalId",
               hd.local_code AS "localCode",
               hd.local_name AS "localName",
               hd.ved::text AS "ved",
               hd.abc::text AS "abc",
               dm.base_unit AS "baseUnit",
               concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form) AS "genericName",
               a.id AS "alertId",
               a.type::text AS "alertType",
               a.severity::text AS "severity",
               a.status::text AS "alertStatus",
               a.stock_qty::float8 AS "stockQty",
               a.incoming_qty::float8 AS "incomingQty",
               a.days_cover::float8 AS "daysCover",
               a.suggested_borrow_qty::float8 AS "suggestedBorrowQty",
               a.created_at AS "alertCreatedAt"
          FROM hospital_drug hd
          LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
          LEFT JOIN stock_alert a ON a.hospital_drug_id = hd.id AND a.hospital_id = hd.hospital_id
         ${whereClause}
         ORDER BY a.severity DESC NULLS LAST, hd.local_name ASC
         LIMIT 25
      `;

      const res = await query(sql, params);
      return {
        success: true,
        data: {
          count: res.rows.length,
          items: res.rows,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve stock and alerts: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: get_forecast_trends
 * Retrieves F1 quantile demand forecast trends (P50, P90, P95, ROP, method) for a hospital drug.
 * Allowed Roles: PHARMACIST, HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const getForecastTrendsTool: IAgentTool<{
  hospitalDrugId: string;
  granularity?: 'WEEK' | 'MONTH';
}> = {
  name: 'get_forecast_trends',
  description: 'Retrieves F1 quantile demand forecast trends (P50, P90, P95, ROP, method) for a hospital drug.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().describe('UUID of the hospital drug'),
    granularity: z.enum(['WEEK', 'MONTH']).optional().default('WEEK').describe('Forecast granularity (WEEK or MONTH)'),
  }),
  allowedRoles: ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      // Tenant isolation: verify drug belongs to caller's hospital
      const hdCheck = await query<{ hospital_id: string }>(
        'SELECT hospital_id FROM hospital_drug WHERE id = $1',
        [args.hospitalDrugId],
      );
      if (hdCheck.rows.length === 0) {
        return { success: false, error: `Hospital drug '${args.hospitalDrugId}' not found.` };
      }
      if (!isSystemAdmin && hdCheck.rows[0].hospital_id !== hospitalId) {
        return {
          success: false,
          error: 'Permission denied: Cannot access drug belonging to another hospital.',
        };
      }

      const granularity = args.granularity || 'WEEK';
      const detailBundle = await forecastsService.detail(
        args.hospitalDrugId,
        { granularity },
        hospitalId || null,
      );

      return {
        success: true,
        data: detailBundle,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve forecast trends: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: get_ranked_lender_ladder
 * Retrieves candidate lender hospitals scored by distance, available stock, and composite priority score (Si).
 * Allowed Roles: PHARMACIST, SYSTEM_ADMIN
 */
export const getRankedLenderLadderTool: IAgentTool<{
  requestId?: string;
  drugMasterId?: string;
  quantityNeeded?: number;
  urgency?: 'NORMAL' | 'URGENT' | 'VERY_URGENT';
}> = {
  name: 'get_ranked_lender_ladder',
  description: 'Scores and retrieves candidate lender hospitals ranked by composite score (Si), distance, and stock safety for a borrow request.',
  parameters: z.object({
    requestId: z.string().uuid().optional().describe('UUID of an existing borrow request to fetch its calculated ladder'),
    drugMasterId: z.string().uuid().optional().describe('UUID of canonical drug if calculating ladder on demand'),
    quantityNeeded: z.number().positive().optional().describe('Quantity needed if calculating ladder on demand'),
    urgency: z.enum(['NORMAL', 'URGENT', 'VERY_URGENT']).optional().default('URGENT').describe('Borrow urgency level (default URGENT)'),
  }),
  allowedRoles: ['PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for lender ladder calculation.',
        };
      }

      // Case 1: Inspect existing borrow request
      if (args.requestId) {
        const reqRes = await query<{
          id: string;
          request_no: string;
          borrower_hospital_id: string;
          status: string;
          urgency: string;
          ladder: any;
          first_round_qty: number;
          stop_threshold: number;
        }>(
          `SELECT id, request_no, borrower_hospital_id, status::text AS status, urgency::text AS urgency,
                  ladder, first_round_qty::float8 AS first_round_qty, stop_threshold::float8 AS stop_threshold
             FROM borrow_request
            WHERE id = $1`,
          [args.requestId],
        );

        if (reqRes.rows.length === 0) {
          return { success: false, error: `Borrow request '${args.requestId}' not found.` };
        }

        const req = reqRes.rows[0];
        if (!isSystemAdmin && req.borrower_hospital_id !== hospitalId) {
          return {
            success: false,
            error: 'Permission denied: Cannot access borrow request belonging to another hospital.',
          };
        }

        const ctrl = await query(
          `SELECT 1 FROM borrow_request_item bri
             JOIN drug_master dm ON dm.id = bri.drug_master_id AND dm.is_controlled = true
            WHERE bri.request_id = $1 LIMIT 1`,
          [args.requestId],
        );
        if (ctrl.rows.length > 0) {
          return { success: false, error: CONTROLLED_DRUG_BLOCKED_MESSAGE };
        }

        return {
          success: true,
          data: {
            requestId: req.id,
            requestNo: req.request_no,
            status: req.status,
            urgency: req.urgency,
            firstRoundQty: req.first_round_qty,
            stopThreshold: req.stop_threshold,
            ladder: req.ladder,
          },
        };
      }

      // Case 2: On-demand candidate ranking
      const requesterHospId = hospitalId || (
        await query<{ id: string }>('SELECT id FROM hospital WHERE active = true LIMIT 1')
      ).rows[0]?.id;

      if (!requesterHospId) {
        return { success: false, error: 'Requester hospital ID could not be identified.' };
      }

      const params: unknown[] = [requesterHospId];
      let drugJoin = '';
      if (args.drugMasterId) {
        if (await isControlledDrugMaster(args.drugMasterId)) {
          return { success: false, error: CONTROLLED_DRUG_BLOCKED_MESSAGE };
        }
        params.push(args.drugMasterId);
        drugJoin = `
          LEFT JOIN hospital_drug hd ON hd.hospital_id = h.id AND hd.drug_master_id = $${params.length}
          LEFT JOIN stock_lot sl ON sl.hospital_drug_id = hd.id AND sl.hospital_id = h.id AND sl.expiry_date > current_date
        `;
      } else {
        drugJoin = `
          LEFT JOIN hospital_drug hd ON hd.hospital_id = h.id
          LEFT JOIN drug_master dmc ON dmc.id = hd.drug_master_id
          LEFT JOIN stock_lot sl ON sl.hospital_drug_id = hd.id AND sl.hospital_id = h.id AND sl.expiry_date > current_date
            AND COALESCE(dmc.is_controlled, false) = false
        `;
      }

      const sql = `
        SELECT h.id AS "hospitalId",
               h.code,
               COALESCE(h.name_th, h.name_en) AS "name",
               h.active,
               h.has_cold_chain AS "hasColdChain",
               COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS "transitMinutes",
               COALESCE(sum(sl.qty_on_hand - sl.qty_held), 0)::float8 AS "usableStock"
          FROM hospital h
          LEFT JOIN hospital_distance d ON d.from_hospital_id = h.id AND d.to_hospital_id = $1
          ${drugJoin}
         WHERE h.id <> $1 AND h.active = true
         GROUP BY h.id, h.code, h.name_th, h.name_en, h.active, h.has_cold_chain, d.travel_minutes_override, d.travel_minutes
         ORDER BY d.travel_minutes ASC NULLS LAST, "usableStock" DESC
         LIMIT 10
      `;

      const res = await query(sql, params);
      const candidates = res.rows.map((row, idx) => {
        const transit = row.transitMinutes ?? 999;
        const stock = row.usableStock ?? 0;
        // Simple composite scoring Si for presentation: higher usable stock, lower transit
        const score = Math.max(0, Math.round(((stock * 10) / (transit + 10)) * 100) / 100);
        return {
          rank: idx + 1,
          hospitalId: row.hospitalId,
          hospitalCode: row.code,
          hospitalName: row.name,
          transitMinutes: transit,
          hasColdChain: row.hasColdChain,
          usableStock: stock,
          scoreSi: score,
        };
      });

      return {
        success: true,
        data: {
          requesterHospitalId: requesterHospId,
          urgency: args.urgency || 'URGENT',
          quantityNeeded: args.quantityNeeded || null,
          candidateCount: candidates.length,
          candidates,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to calculate ranked lender ladder: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: get_near_expiry_pool_status
 * Retrieves near-expiry stock items, regional pool entries, days to expiry, and salvage benefits.
 * Allowed Roles: PHARMACIST, HOSPITAL_ADMIN, SYSTEM_ADMIN
 */
export const getNearExpiryPoolStatusTool: IAgentTool<{
  hospitalId?: string;
  status?: 'DETECTED' | 'IN_POOL' | 'ALL';
  limit?: number;
}> = {
  name: 'get_near_expiry_pool_status',
  description: 'Retrieves near-expiry stock items, regional pool entries, days to expiry, and salvage benefits.',
  parameters: z.object({
    hospitalId: z.string().uuid().optional().describe('Optional hospital UUID (defaults to context hospital)'),
    status: z.enum(['DETECTED', 'IN_POOL', 'ALL']).optional().default('ALL').describe('Filter items by status'),
    limit: z.number().int().positive().max(50).optional().default(20).describe('Max results to return (default 20)'),
  }),
  allowedRoles: ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const targetHospitalId = args.hospitalId || context.hospitalId;

      if (!targetHospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to query near-expiry pool status.',
        };
      }

      if (args.hospitalId && !isSystemAdmin && args.hospitalId !== context.hospitalId) {
        return {
          success: false,
          error: 'Permission denied: Cannot access near-expiry pool of another hospital.',
        };
      }

      const params: unknown[] = [];
      const where: string[] = [];

      if (targetHospitalId) {
        params.push(targetHospitalId);
        where.push(`ne.hospital_id = $${params.length}`);
      }

      const filterStatus = args.status || 'ALL';
      if (filterStatus === 'DETECTED') {
        where.push("ne.status = 'DETECTED'");
      } else if (filterStatus === 'IN_POOL') {
        where.push("ne.status = 'RELEASED_TO_POOL'");
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      params.push(args.limit || 20);
      const limitParamIdx = params.length;

      const sql = `
        SELECT ne.id AS "nearExpiryId",
               ne.hospital_id AS "hospitalId",
               ne.status::text AS "nearExpiryStatus",
               ne.days_left AS "daysLeft",
               ne.value_thb::float8 AS "valueThb",
               ne.created_at AS "detectedAt",
               sl.lot_no AS "lotNo",
               sl.expiry_date AS "expiryDate",
               (sl.expiry_date - current_date)::int AS "daysToExpiry",
               sl.qty_on_hand::float8 AS "totalLotQty",
               sl.qty_held::float8 AS "reservedQty",
               (sl.qty_on_hand - sl.qty_held)::float8 AS "freeQty",
               pe.id AS "poolEntryId",
               pe.qty_available::float8 AS "releasedToPoolQty",
               hd.local_code AS "localCode",
               hd.local_name AS "localName",
               hd.unit_price_thb::float8 AS "unitPriceThb",
               concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form) AS "drugName",
               dm.base_unit AS "baseUnit",
               COALESCE(ne.value_thb, (sl.qty_on_hand - sl.qty_held) * COALESCE(hd.unit_price_thb, 0))::float8 AS "estimatedSalvageValueThb"
          FROM near_expiry_item ne
          JOIN stock_lot sl ON sl.id = ne.lot_id
          JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
          LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
          LEFT JOIN pool_entry pe ON pe.near_expiry_item_id = ne.id
         ${whereClause}
         ORDER BY (sl.expiry_date - current_date) ASC, ne.created_at DESC
         LIMIT $${limitParamIdx}
      `;

      const res = await query(sql, params);
      const totalSalvage = res.rows.reduce(
        (acc, r) => acc + (r.estimatedSalvageValueThb || 0),
        0,
      );

      return {
        success: true,
        data: {
          hospitalId: targetHospitalId || null,
          itemCount: res.rows.length,
          totalEstimatedSalvageThb: Math.round(totalSalvage * 100) / 100,
          items: res.rows,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve near-expiry pool status: ${e.message}`,
      };
    }
  },
};

import { draftMessage } from '../../../borrow/borrow.flow.js';

/**
 * English version of borrow request draft.
 */
export function draftMessageEn(input: {
  requester: string;
  drug: string;
  qty: number;
  unit: string;
  urgency: string;
  round: number;
  deadlineMin: number;
}): string {
  const hours =
    input.deadlineMin >= 120
      ? `${Math.round(input.deadlineMin / 60)} hours`
      : `${Math.round(input.deadlineMin)} minutes`;
  const urgencyLabel =
    input.urgency === 'VERY_URGENT'
      ? 'Very Urgent'
      : input.urgency === 'URGENT'
        ? 'Urgent'
        : 'Normal';
  return `${input.requester} requests to borrow ${input.drug} qty: ${input.qty.toLocaleString('en-US')} ${input.unit} (Round ${input.round}). Urgency: ${urgencyLabel}. Please confirm within ${hours}. Return required as identical item and quantity.`;
}

/**
 * Tool: draft_lender_communication
 * Formats formal Thai/English borrow requests using standardized institutional templates.
 * Allowed Roles: PHARMACIST, SYSTEM_ADMIN
 */
export const draftLenderCommunicationTool: IAgentTool<{
  requesterName: string;
  targetHospitalName: string;
  drugName: string;
  quantity: number;
  unit: string;
  urgency?: 'NORMAL' | 'URGENT' | 'VERY_URGENT';
  deadlineMinutes?: number;
  round?: number;
  language?: 'TH' | 'EN';
}> = {
  name: 'draft_lender_communication',
  description: 'Formats formal Thai or English borrow request communication for candidate lender hospitals.',
  parameters: z.object({
    requesterName: z.string().describe('Name of the requesting hospital'),
    targetHospitalName: z.string().describe('Name of the target lender hospital'),
    drugName: z.string().describe('Generic drug name, dosage, and strength'),
    quantity: z.number().positive().describe('Quantity to request'),
    unit: z.string().describe('Unit of measurement (e.g. vials, boxes, kits)'),
    urgency: z.enum(['NORMAL', 'URGENT', 'VERY_URGENT']).optional().default('URGENT').describe('Urgency level'),
    deadlineMinutes: z.number().positive().optional().default(120).describe('Confirmation deadline in minutes'),
    round: z.number().int().positive().optional().default(1).describe('Borrow round number'),
    language: z.enum(['TH', 'EN']).optional().default('TH').describe('Communication language (TH or EN)'),
  }),
  allowedRoles: ['PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args): Promise<ToolResult> => {
    try {
      const language = args.language || 'TH';
      const text =
        language === 'EN'
          ? draftMessageEn({
              requester: args.requesterName,
              drug: args.drugName,
              qty: args.quantity,
              unit: args.unit,
              urgency: args.urgency || 'URGENT',
              round: args.round || 1,
              deadlineMin: args.deadlineMinutes || 120,
            })
          : draftMessage({
              requester: args.requesterName,
              drug: args.drugName,
              qty: args.quantity,
              unit: args.unit,
              urgency: args.urgency || 'URGENT',
              round: args.round || 1,
              deadlineMin: args.deadlineMinutes || 120,
            });

      return {
        success: true,
        data: {
          language,
          targetHospital: args.targetHospitalName,
          urgency: args.urgency || 'URGENT',
          deadlineMinutes: args.deadlineMinutes || 120,
          formattedMessage: text,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to draft lender communication: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: interpret_lender_response
 * Normalizes unstructured free-text responses from lenders into structured decisions (ACCEPT, PARTIAL, REJECT).
 * Allowed Roles: PHARMACIST, SYSTEM_ADMIN
 */
export const interpretLenderResponseTool: IAgentTool<{
  responseText: string;
  askedQuantity: number;
}> = {
  name: 'interpret_lender_response',
  description: 'Normalizes unstructured free-text responses from lender hospitals into structured decisions (ACCEPT, PARTIAL, REJECT).',
  parameters: z.object({
    responseText: z.string().describe('Free-text response message from lender hospital'),
    askedQuantity: z.number().positive().describe('Original quantity asked in the borrow request'),
  }),
  allowedRoles: ['PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args): Promise<ToolResult> => {
    try {
      const rawText = args.responseText;
      const flags: string[] = [];

      // Guardrail G-09: Prompt injection detection
      const injectionPattern =
        /(ignore\s+(all\s+)?previous\s+instructions|system\s*:|override\s+all|you\s+are\s+now|developer\s+mode|as\s+an\s+ai)/i;
      if (injectionPattern.test(rawText)) {
        flags.push('PROMPT_INJECTION_SUSPECTED', 'INJECTION_SUSPECTED');
        // When prompt injection is suspected, never trust or execute instructions
        return {
          success: true,
          data: {
            decision: 'REJECT',
            confirmedQuantity: null,
            askedQuantity: args.askedQuantity,
            confidence: 'LOW',
            notes: rawText,
            flags,
          },
        };
      }

      // Cleaned text for analysis (lowercased)
      const text = rawText.toLowerCase().trim();

      // Look for quantities associated with units or partial phrasing
      const unitQtyRegex = /(\d+(?:\.\d+)?)\s*(?:กล่อง|ขวด|หลอด|เม็ด|ชุด|amp|vial|box|unit|pack|units)/i;
      const partialPrefixRegex =
        /(?:ไม่พอ\s*แต่มี(?:ให้)?|มีแค่|แบ่ง(?:ให้)?ได้|ให้ได้|แต่มีให้|ส่งได้แค่|ส่งให้ได้แค่|only\s*have|have\s*only|can\s*only\s*send|can\s*give)\s*(\d+(?:\.\d+)?)/i;

      let extractedQty: number | null = null;
      const pMatch = rawText.match(partialPrefixRegex);
      if (pMatch && pMatch[1]) {
        extractedQty = parseFloat(pMatch[1]);
      } else {
        const uMatch = rawText.match(unitQtyRegex);
        if (uMatch && uMatch[1]) {
          extractedQty = parseFloat(uMatch[1]);
        }
      }

      // Check for full rejection patterns (note: (?<!ไม่|ยังไม่|ทั้ง)หมด prevents matching ไม่หมด, ยังไม่หมด, ทั้งหมด)
      const rejectPattern =
        /(ปฏิเสธ|ไม่มี(?!.*แต่มี)|ไม่สะดวก|ไม่สามารถ|(?<!ไม่|ยังไม่|ทั้ง)หมด|ติดเคส|ไม่มีสต็อก|ไม่พอ(?!.*แต่มี)|reject|unavailable|no\s*stock|cannot|out\s*of\s*stock|declined)/i;

      // Check for explicit agreement patterns
      const explicitAcceptPattern =
        /(พร้อมส่ง|ได้ครบ|ยินดีให้ยืม|อนุมัติ|ส่งให้ได้|ส่งได้|ตกลง|accept|approved|can\s*provide\s*all|will\s*send|available\s*to\s*lend)/i;

      // Check for availability-only signals (indicates stock exists, but does not explicitly agree to lend)
      const availabilityOnlyPattern =
        /(ไม่หมด|ยังไม่หมด|ยังมีอยู่|พอมี|ยังมีสต็อก|still\s*have|not\s*out\s*of\s*stock)/i;

      let decision: 'ACCEPT' | 'PARTIAL' | 'REJECT' | 'UNCLEAR';
      let confirmedQuantity: number | null = null;
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

      if (extractedQty !== null) {
        if (extractedQty < args.askedQuantity) {
          decision = 'PARTIAL';
          confirmedQuantity = extractedQty;
        } else if (extractedQty > args.askedQuantity) {
          decision = 'ACCEPT';
          confirmedQuantity = args.askedQuantity; // Cap to asked
          flags.push('QUANTITY_EXCEEDS_ASKED', 'EXCEEDS_ASKED_QUANTITY');
        } else {
          decision = 'ACCEPT';
          confirmedQuantity = args.askedQuantity;
        }
      } else if (rejectPattern.test(text) && !explicitAcceptPattern.test(text)) {
        decision = 'REJECT';
        confirmedQuantity = 0;
      } else if (explicitAcceptPattern.test(text) && !rejectPattern.test(text)) {
        decision = 'ACCEPT';
        confirmedQuantity = args.askedQuantity;
      } else if (availabilityOnlyPattern.test(text) && !rejectPattern.test(text)) {
        // Signals availability without explicit agreement or quantity
        decision = 'UNCLEAR';
        confirmedQuantity = null;
        flags.push('NEEDS_CONFIRMATION');
        confidence = 'MEDIUM';
      } else if (rejectPattern.test(text) && explicitAcceptPattern.test(text)) {
        // Ambiguous conflicting signals
        decision = 'REJECT';
        confirmedQuantity = null;
        confidence = 'LOW';
      } else {
        // Unclear response
        decision = 'UNCLEAR';
        confirmedQuantity = null;
        flags.push('NEEDS_CONFIRMATION');
        confidence = 'LOW';
      }

      return {
        success: true,
        data: {
          decision,
          confirmedQuantity,
          askedQuantity: args.askedQuantity,
          confidence,
          notes: rawText,
          flags,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to interpret lender response: ${e.message}`,
      };
    }
  },
};

/**
 * Whitelist map for Pharmacist proposal actions.
 * Every endpoint maps to an existing authenticated route in the backend.
 */
export const PHARMACIST_PROPOSAL_WHITELIST = {
  CREATE_BORROW_REQUEST: {
    buildEndpoint: () => '/api/v1/borrow-requests',
    method: 'POST' as const,
    routeSource: 'backend/src/modules/borrow/borrow.routes.ts:19',
    payloadSchema: z.object({
      stockAlertId: z.string().uuid().optional(),
      reason: z.string().min(1, 'Reason is required'),
      context: z.enum(['STOCK_ALERT', 'MANUAL']).optional(),
      items: z
        .array(
          z.object({
            drugMasterId: z.string().uuid(),
            qtyRequested: z.number().positive(),
            unitPriceThb: z.number().optional(),
          }),
        )
        .min(1, 'At least one item is required'),
    }),
  },
  SNOOZE_ALERT: {
    buildEndpoint: (alertId?: string) => {
      if (!alertId) throw new Error('alertId (targetId) is required for SNOOZE_ALERT');
      return `/api/v1/alerts/${alertId}/snooze`;
    },
    method: 'POST' as const,
    routeSource: 'backend/src/modules/alerts/alerts.routes.ts:18',
    payloadSchema: z.object({
      hours: z.number().int().min(1).max(168).default(24),
      reason: z.string().min(3, 'Snooze reason must be at least 3 characters'),
      version: z.number().int().positive().optional(),
    }),
  },
  RELEASE_NEAR_EXPIRY_POOL: {
    buildEndpoint: (nearExpiryId?: string) => {
      if (!nearExpiryId) throw new Error('nearExpiryId (targetId) is required for RELEASE_NEAR_EXPIRY_POOL');
      return `/api/v1/near-expiry/${nearExpiryId}/release`;
    },
    method: 'POST' as const,
    routeSource: 'backend/src/modules/expiry/expiry.routes.ts:17',
    payloadSchema: z.object({
      qty: z.number().positive('Release quantity must be positive'),
      note: z.string().optional(),
    }),
  },
  /** F2: the allocation agent (AGT-F2-001) proposes a plan for a lot our hospital released; the code checks it (F-22). */
  SEND_POOL_TO_AGENT: {
    buildEndpoint: (poolEntryId?: string) => {
      if (!poolEntryId) throw new Error('poolEntryId (targetId) is required for SEND_POOL_TO_AGENT');
      return `/api/v1/pool/${poolEntryId}/agent-plan`;
    },
    method: 'POST' as const,
    routeSource: 'backend/src/modules/expiry/expiry.routes.ts (POST /pool/:id/agent-plan)',
    payloadSchema: z.object({}),
  },
  /** F2: object to another hospital's allocation plan of our region, with a reason (plan goes to discussion). */
  OBJECT_ALLOCATION_PLAN: {
    buildEndpoint: (planId?: string) => {
      if (!planId) throw new Error('allocation plan id (targetId) is required for OBJECT_ALLOCATION_PLAN');
      return `/api/v1/allocation-plans/${planId}/objection`;
    },
    method: 'POST' as const,
    routeSource: 'backend/src/modules/expiry/expiry.routes.ts (POST /allocation-plans/:id/objection)',
    payloadSchema: z.object({
      reason: z.string().min(3, 'Objection reason must be at least 3 characters').max(1000),
    }),
  },
} as const;

type PharmacistAction = keyof typeof PHARMACIST_PROPOSAL_WHITELIST;

/**
 * Tool: submit_pharmacist_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for pharmacist authorization.
 * Whitelisted actions: CREATE_BORROW_REQUEST, SNOOZE_ALERT, RELEASE_NEAR_EXPIRY_POOL, SEND_POOL_TO_AGENT, OBJECT_ALLOCATION_PLAN
 * Allowed Roles: PHARMACIST, SYSTEM_ADMIN
 */
export const submitPharmacistProposalTool: IAgentTool<{
  actionType: PharmacistAction;
  title: string;
  description: string;
  summary: Record<string, unknown>;
  targetId?: string;
  payload: Record<string, unknown>;
}> = {
  name: 'submit_pharmacist_proposal',
  description:
    'Terminal proposal tool submitting human-in-the-loop action proposals for borrow requests, alert snoozing, near-expiry pool releases, sending an own pool lot to the allocation agent, or objecting to another hospital\'s allocation plan in the region.',
  parameters: z.object({
    actionType: z
      .enum(['CREATE_BORROW_REQUEST', 'SNOOZE_ALERT', 'RELEASE_NEAR_EXPIRY_POOL', 'SEND_POOL_TO_AGENT', 'OBJECT_ALLOCATION_PLAN'])
      .describe('Whitelisted pharmacist action type'),
    title: z.string().describe('Title of the proposed action'),
    description: z.string().describe('Detailed clinical explanation or rationale'),
    summary: z.record(z.string(), z.unknown()).describe('Key-value summary of proposed metrics'),
    targetId: z
      .string()
      .uuid()
      .optional()
      .describe('Target ID: alertId (SNOOZE_ALERT), nearExpiryId (RELEASE_NEAR_EXPIRY_POOL), poolEntryId (SEND_POOL_TO_AGENT) or allocation plan id (OBJECT_ALLOCATION_PLAN)'),
    payload: z.record(z.string(), z.unknown()).describe('Action-specific payload parameters'),
  }),
  allowedRoles: ['PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const hospitalId = context.hospitalId;

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to submit a pharmacist proposal.',
        };
      }

      const actionDef = PHARMACIST_PROPOSAL_WHITELIST[args.actionType];
      if (!actionDef) {
        return {
          success: false,
          error: `Action '${args.actionType}' is not in the whitelisted pharmacist actions.`,
        };
      }

      // Validate targetId and build strict endpoint
      let endpoint: string;
      try {
        endpoint = actionDef.buildEndpoint(args.targetId);
      } catch (err: any) {
        return {
          success: false,
          error: `Invalid targetId for ${args.actionType}: ${err.message}`,
        };
      }

      // If targetId is provided, enforce hospital ownership
      if (args.targetId) {
        if (args.actionType === 'SNOOZE_ALERT') {
          const alert = await query<{ hospital_id: string }>(
            'SELECT hospital_id FROM stock_alert WHERE id = $1',
            [args.targetId],
          );
          if (alert.rows.length === 0) {
            return { success: false, error: `Stock alert '${args.targetId}' not found.` };
          }
          if (!isSystemAdmin && alert.rows[0].hospital_id !== hospitalId) {
            return {
              success: false,
              error: 'Permission denied: Cannot snooze alert belonging to another hospital.',
            };
          }
        } else if (args.actionType === 'RELEASE_NEAR_EXPIRY_POOL') {
          const item = await query<{ hospital_id: string }>(
            'SELECT hospital_id FROM near_expiry_item WHERE id = $1',
            [args.targetId],
          );
          if (item.rows.length === 0) {
            return { success: false, error: `Near expiry item '${args.targetId}' not found.` };
          }
          if (!isSystemAdmin && item.rows[0].hospital_id !== hospitalId) {
            return {
              success: false,
              error: 'Permission denied: Cannot release near-expiry item belonging to another hospital.',
            };
          }
        } else if (args.actionType === 'SEND_POOL_TO_AGENT') {
          // the pool is shared: any pharmacist of the lot's region may send it to the agent (same rule as POST /pool/:id/agent-plan)
          const lot = await query<{ same_region: boolean }>(
            'SELECT pe.region_id = (SELECT region_id FROM hospital WHERE id = $2) AS same_region FROM pool_entry pe WHERE pe.id = $1',
            [args.targetId, hospitalId],
          );
          if (lot.rows.length === 0) return { success: false, error: `Pool entry '${args.targetId}' not found.` };
          if (!isSystemAdmin && !lot.rows[0].same_region) {
            return { success: false, error: 'Permission denied: The pool lot belongs to another region.' };
          }
        } else if (args.actionType === 'OBJECT_ALLOCATION_PLAN') {
          // a hospital of the plan's region that is not in it yet (involved hospitals approve or reject instead)
          const plan = await query<{ same_region: boolean; involved: boolean }>(
            `SELECT ap.region_id = (SELECT region_id FROM hospital WHERE id = $2) AS same_region,
                    EXISTS (SELECT 1 FROM plan_approval pa WHERE pa.plan_id = ap.id AND pa.hospital_id = $2) AS involved
               FROM allocation_plan ap WHERE ap.id = $1`,
            [args.targetId, hospitalId],
          );
          if (plan.rows.length === 0) return { success: false, error: `Allocation plan '${args.targetId}' not found.` };
          if (!isSystemAdmin && !plan.rows[0].same_region) return { success: false, error: 'Permission denied: The allocation plan belongs to another region.' };
          if (plan.rows[0].involved) return { success: false, error: 'Your hospital is already in this plan: approve or reject it instead of objecting.' };
        }
      }

      // Validate payload with the action's strict Zod schema
      const parseRes = actionDef.payloadSchema.safeParse(args.payload);
      if (!parseRes.success) {
        return {
          success: false,
          error: `Invalid proposal payload for ${args.actionType}: ${parseRes.error.message}`,
        };
      }

      // BR-F1b-014: never propose an automated borrow of a controlled drug
      if (args.actionType === 'CREATE_BORROW_REQUEST') {
        const dmId = (parseRes.data as { drugMasterId?: string }).drugMasterId;
        if (dmId && (await isControlledDrugMaster(dmId))) {
          return { success: false, error: CONTROLLED_DRUG_BLOCKED_MESSAGE };
        }
      }

      // Emit HITL proposal
      return {
        success: true,
        proposal: {
          type: args.actionType,
          title: args.title,
          description: args.description,
          summary: {
            ...args.summary,
            requestedBy: context.userId || 'current-user',
            hospitalId: hospitalId || 'global',
          },
          actionApi: {
            endpoint,
            method: actionDef.method,
            payload: parseRes.data as Record<string, unknown>,
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to submit pharmacist proposal: ${e.message}`,
      };
    }
  },
};
