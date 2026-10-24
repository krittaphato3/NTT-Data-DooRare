import crypto from 'node:crypto';
import { z } from 'zod';
import { round } from '../../../../core/formulas/borrow.js';
import { costCheck, transportCost } from '../../../../core/formulas/expiry.js';
import { pool, query } from '../../../../db/client.js';
import { loadExpiryConfig } from '../../../expiry/expiry.config.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import {
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_MOQ,
  isPromptInjection,
  REORDER_URGENCY_CRITICAL_DAYS,
  REORDER_URGENCY_HIGH_DAYS,
  REORDER_URGENCY_MEDIUM_DAYS,
  VAT_RATE,
} from './logistics.utils.js';

// --- SHARED PROCUREMENT HELPERS ---

export interface DrugContractTerms {
  hospitalDrugId: string;
  localCode: string;
  localName: string;
  genericName: string;
  baseUnit: string;
  unitPriceThb: number | null;
  priceMissing: boolean;
  packSizeBaseUnits: number | null;
  leadTimeDays: number;
  leadTimeEstimated: boolean;
  leadTimeAvgDays: number | null;
  leadTimeMaxDays: number | null;
  moq: number;
  moqEstimated: boolean;
  contractStatus: string;
  vendorName: null;
  dataSource: {
    unitPrice: string;
    packSize: string;
    leadTime: string;
    moq: string;
  };
}

/**
 * Loads empirical vendor contract terms and purchase lead time from hospital_drug and incoming_order.
 */
export async function loadDrugContractTerms(hospitalDrugId: string, hospitalId: string | null): Promise<DrugContractTerms | null> {
  const params: unknown[] = [hospitalDrugId];
  let where = 'hd.id = $1';
  if (hospitalId) {
    params.push(hospitalId);
    where += ` AND hd.hospital_id = $${params.length}`;
  }

  const hdRes = await query<{
    id: string;
    local_code: string;
    local_name: string;
    unit_price_thb: string | number | null;
    generic_name: string;
    base_unit: string;
  }>(
    `SELECT hd.id, hd.local_code, hd.local_name, hd.unit_price_thb, dm.generic_name, dm.base_unit
       FROM hospital_drug hd
       JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE ${where}`,
    params,
  );

  if (hdRes.rows.length === 0) return null;
  const hd = hdRes.rows[0];

  const unitPriceThb = hd.unit_price_thb !== null ? Number(hd.unit_price_thb) : null;

  // Most recent pack size from stock_lot
  const packRes = await query<{ pack_size_base_units: string | number | null }>(
    `SELECT pack_size_base_units
       FROM stock_lot
      WHERE hospital_drug_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [hospitalDrugId],
  );
  const packSizeBaseUnits =
    packRes.rows.length > 0 && packRes.rows[0].pack_size_base_units !== null
      ? Number(packRes.rows[0].pack_size_base_units)
      : null;

  // Lead times from the last 10 incoming orders
  const leadRes = await query<{ lead_time_days: number | null }>(
    `SELECT lead_time_days
       FROM incoming_order
      WHERE hospital_drug_id = $1 AND status != 'CANCELLED' AND lead_time_days IS NOT NULL
      ORDER BY expected_date DESC
      LIMIT 10`,
    [hospitalDrugId],
  );

  let leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
  let leadTimeEstimated = true;
  let leadTimeAvgDays: number | null = null;
  let leadTimeMaxDays: number | null = null;
  let leadTimeSource = 'DEFAULT_ESTIMATE';

  if (leadRes.rows.length > 0) {
    const validDays = leadRes.rows.map((r) => Number(r.lead_time_days)).filter((d) => d > 0);
    if (validDays.length > 0) {
      const sum = validDays.reduce((a, b) => a + b, 0);
      leadTimeAvgDays = Math.round((sum / validDays.length) * 10) / 10;
      leadTimeMaxDays = Math.max(...validDays);
      leadTimeDays = Math.ceil(leadTimeAvgDays);
      leadTimeEstimated = false;
      leadTimeSource = 'incoming_order.lead_time_days';
    }
  }

  return {
    hospitalDrugId: hd.id,
    localCode: hd.local_code,
    localName: hd.local_name,
    genericName: hd.generic_name,
    baseUnit: hd.base_unit,
    unitPriceThb,
    priceMissing: unitPriceThb === null,
    packSizeBaseUnits,
    leadTimeDays,
    leadTimeEstimated,
    leadTimeAvgDays,
    leadTimeMaxDays,
    moq: DEFAULT_MOQ,
    moqEstimated: true,
    contractStatus: 'NO_CONTRACT_DATA',
    vendorName: null,
    dataSource: {
      unitPrice: unitPriceThb !== null ? 'hospital_drug.unit_price_thb' : 'MISSING',
      packSize: packSizeBaseUnits !== null ? 'stock_lot.pack_size_base_units' : 'MISSING',
      leadTime: leadTimeSource,
      moq: 'DEFAULT_ESTIMATE',
    },
  };
}

// --- TOOL 1: get_reorder_recommendation_list ---

export const getReorderRecommendationListTool: IAgentTool<{
  hospitalDrugId?: string;
  vedFilter?: Array<'V' | 'E' | 'D'>;
  maxDaysCover?: number;
  limit?: number;
}> = {
  name: 'get_reorder_recommendation_list',
  description:
    'Evaluates inventory reorder points (ROP) and order-up-to target levels against live usable stock and open orders to generate prioritised replenishment recommendations.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().optional().describe('Optional hospital drug UUID to narrow evaluation'),
    vedFilter: z.array(z.enum(['V', 'E', 'D'])).optional().describe('Filter by VED criticality classes'),
    maxDaysCover: z.number().positive().optional().describe('Only include items with days of coverage below this threshold'),
    limit: z.number().int().min(1).max(200).optional().default(50).describe('Maximum items to return (default 50, max 200)'),
  }),
  allowedRoles: ['PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for reorder recommendations.',
        };
      }

      const params: unknown[] = [];
      const where: string[] = ['hd.active = true'];

      if (!isSystemAdmin && hospitalId) {
        params.push(hospitalId);
        where.push(`hd.hospital_id = $${params.length}`);
      }

      if (args.hospitalDrugId) {
        params.push(args.hospitalDrugId);
        where.push(`hd.id = $${params.length}`);
      }

      if (args.vedFilter && args.vedFilter.length > 0) {
        params.push(args.vedFilter);
        where.push(`hd.ved = ANY($${params.length}::ved_class[])`);
      }

      const limit = args.limit ?? 50;

      // Query active hospital drugs with live stock, incoming orders, latest forecast, and open alerts
      const sql = `
        SELECT hd.id AS "hospitalDrugId",
               hd.local_code AS "localCode",
               hd.local_name AS "localName",
               hd.unit_price_thb::float8 AS "unitPriceThb",
               hd.ved::text AS "ved",
               hd.abc::text AS "abc",
               dm.generic_name AS "genericName",
               dm.base_unit AS "baseUnit",
               COALESCE((
                 SELECT SUM(sl.qty_on_hand - sl.qty_held)
                   FROM stock_lot sl
                  WHERE sl.hospital_drug_id = hd.id
                    AND sl.expiry_date >= CURRENT_DATE
                    AND sl.qty_on_hand > 0
               ), 0)::float8 AS "usableStock",
               COALESCE((
                 SELECT SUM(io.qty)
                   FROM incoming_order io
                  WHERE io.hospital_drug_id = hd.id
                    AND io.status = 'OPEN'
               ), 0)::float8 AS "incomingOpen",
               fc.p50::float8 AS "monthlyP50",
               fc.rop::float8 AS "rop",
               fc.total_target::float8 AS "totalTarget",
               sa.id AS "alertId",
               sa.type::text AS "alertType",
               sa.severity::text AS "alertSeverity",
               sa.days_cover::float8 AS "alertDaysCover"
          FROM hospital_drug hd
          JOIN drug_master dm ON dm.id = hd.drug_master_id
          LEFT JOIN LATERAL (
            SELECT f.p50, f.rop, f.total_target
              FROM forecast_result f
             WHERE f.hospital_drug_id = hd.id
               AND f.granularity = 'MONTH'
             ORDER BY f.computed_at DESC
             LIMIT 1
          ) fc ON true
          LEFT JOIN LATERAL (
            SELECT a.id, a.type, a.severity, a.days_cover
              FROM stock_alert a
             WHERE a.hospital_drug_id = hd.id
               AND a.status = 'OPEN'
             ORDER BY a.created_at DESC
             LIMIT 1
          ) sa ON true
         WHERE ${where.join(' AND ')}
      `;

      const res = await query(sql, params);
      const rows = res.rows as Array<{
        hospitalDrugId: string;
        localCode: string;
        localName: string;
        unitPriceThb: number | null;
        ved: 'V' | 'E' | 'D';
        abc: 'A' | 'B' | 'C' | null;
        genericName: string;
        baseUnit: string;
        usableStock: number;
        incomingOpen: number;
        monthlyP50: number | null;
        rop: number | null;
        totalTarget: number | null;
        alertId: string | null;
        alertType: string | null;
        alertSeverity: string | null;
        alertDaysCover: number | null;
      }>;

      const recommendations = [];

      for (const r of rows) {
        const usableStock = Math.max(0, Number(r.usableStock));
        const incomingOpen = Math.max(0, Number(r.incomingOpen));
        const monthlyP50 = r.monthlyP50 !== null ? Number(r.monthlyP50) : null;
        const rop = r.rop !== null ? Number(r.rop) : null;
        const totalTarget = r.totalTarget !== null ? Number(r.totalTarget) : null;

        // Daily demand derived from monthly P50
        const dailyDemand = monthlyP50 !== null && monthlyP50 > 0 ? monthlyP50 / 30 : null;

        let daysCover: number | null = null;
        let forecastMissing = false;

        if (dailyDemand !== null && dailyDemand > 0) {
          daysCover = round(usableStock / dailyDemand, 2);
        } else if (r.alertDaysCover !== null) {
          daysCover = round(Number(r.alertDaysCover), 2);
          forecastMissing = true;
        } else {
          forecastMissing = true;
        }

        // Apply maxDaysCover filter if requested
        if (args.maxDaysCover !== undefined && daysCover !== null && daysCover > args.maxDaysCover) {
          continue;
        }

        /**
         * Reorder Rule:
         * - needsReorder: triggered when (usableStock + incomingOpen) <= rop.
         *   If rop is unavailable, triggered if an open stock alert exists or daysCover <= 14.
         * - recommendedQty: max(0, totalTarget - usableStock - incomingOpen) when totalTarget exists.
         *   totalTarget is the order-up-to stock objective (F-06). If missing, recommendedQty is null with isEstimated true.
         */
        const effectivePosition = usableStock + incomingOpen;
        let needsReorder = false;
        let recommendedQty: number | null = null;
        let recommendedQtyEstimated = false;

        if (rop !== null) {
          needsReorder = effectivePosition <= rop;
        } else if (r.alertId !== null) {
          needsReorder = true;
        } else if (daysCover !== null && daysCover <= REORDER_URGENCY_MEDIUM_DAYS) {
          needsReorder = true;
        }

        if (totalTarget !== null) {
          recommendedQty = Math.max(0, round(totalTarget - effectivePosition, 2));
        } else if (monthlyP50 !== null) {
          // If totalTarget is not populated, estimate 1 month buffer based on P50
          recommendedQty = Math.max(0, round(monthlyP50 - effectivePosition, 2));
          recommendedQtyEstimated = true;
        } else {
          recommendedQtyEstimated = true;
        }

        // Urgency calculation
        let urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        if (r.ved === 'V' && daysCover !== null && daysCover <= REORDER_URGENCY_CRITICAL_DAYS) {
          urgency = 'CRITICAL';
        } else if (daysCover !== null && daysCover <= REORDER_URGENCY_HIGH_DAYS) {
          urgency = 'HIGH';
        } else if (daysCover !== null && daysCover <= REORDER_URGENCY_MEDIUM_DAYS) {
          urgency = 'MEDIUM';
        }

        recommendations.push({
          hospitalDrugId: r.hospitalDrugId,
          drugCode: r.localCode,
          drugName: r.localName || r.genericName,
          baseUnit: r.baseUnit,
          unitPriceThb: r.unitPriceThb,
          ved: r.ved,
          abc: r.abc,
          usableStock,
          incomingOpen,
          effectivePosition,
          monthlyP50,
          rop,
          totalTarget,
          daysCover,
          forecastMissing,
          needsReorder,
          recommendedQty,
          recommendedQtyEstimated,
          urgency,
          openAlert: r.alertId
            ? {
                alertId: r.alertId,
                type: r.alertType,
                severity: r.alertSeverity,
                daysCover: r.alertDaysCover,
              }
            : null,
        });
      }

      // Sort: urgency (CRITICAL -> HIGH -> MEDIUM -> LOW), VED (V -> E -> D), daysCover ascending
      const urgencyRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const vedRank: Record<string, number> = { V: 0, E: 1, D: 2 };

      recommendations.sort((a, b) => {
        const uDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
        if (uDiff !== 0) return uDiff;
        const vDiff = vedRank[a.ved] - vedRank[b.ved];
        if (vDiff !== 0) return vDiff;
        const da = a.daysCover ?? Infinity;
        const db = b.daysCover ?? Infinity;
        return da - db;
      });

      const sliced = recommendations.slice(0, limit);

      return {
        success: true,
        data: {
          totalCount: recommendations.length,
          returnedCount: sliced.length,
          filters: {
            hospitalDrugId: args.hospitalDrugId ?? null,
            vedFilter: args.vedFilter ?? null,
            maxDaysCover: args.maxDaysCover ?? null,
          },
          items: sliced,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve reorder recommendation list: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: get_vendor_contract_terms ---

export const getVendorContractTermsTool: IAgentTool<{
  hospitalDrugId?: string;
  drugCode?: string;
  vendorId?: string;
}> = {
  name: 'get_vendor_contract_terms',
  description:
    'Retrieves unit prices, pack sizes, empirical vendor lead times, and contract baseline parameters for a hospital drug.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().optional().describe('UUID of the hospital drug'),
    drugCode: z.string().optional().describe('Local drug code (hospital_drug.local_code)'),
    vendorId: z.string().optional().describe('Optional vendor UUID (informational; vendor catalog not stored in schema)'),
  }),
  allowedRoles: ['PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for vendor contract terms queries.',
        };
      }

      if (!args.hospitalDrugId && (!args.drugCode || !args.drugCode.trim())) {
        return {
          success: false,
          error: 'Either hospitalDrugId or drugCode must be provided.',
        };
      }

      // Resolve hospitalDrugId if only drugCode is provided
      let targetDrugId = args.hospitalDrugId;
      if (!targetDrugId && args.drugCode) {
        const params: unknown[] = [args.drugCode.trim()];
        let where = 'local_code = $1';
        if (!isSystemAdmin && hospitalId) {
          params.push(hospitalId);
          where += ` AND hospital_id = $${params.length}`;
        }
        const findRes = await query<{ id: string }>(
          `SELECT id FROM hospital_drug WHERE ${where} LIMIT 1`,
          params,
        );
        if (findRes.rows.length === 0) {
          return { success: false, error: `Hospital drug with code '${args.drugCode}' not found.` };
        }
        targetDrugId = findRes.rows[0].id;
      }

      const terms = await loadDrugContractTerms(targetDrugId!, isSystemAdmin ? null : (hospitalId ?? null));
      if (!terms) {
        return { success: false, error: 'Hospital drug not found or not permitted.' };
      }

      const notes: string[] = [];
      if (args.vendorId) {
        notes.push('Vendor master catalog is not stored in the database; vendorId parameter was ignored.');
      }
      if (terms.priceMissing) {
        notes.push('Unit price is missing in hospital_drug table; pricing needs confirmation with finance.');
      }
      if (terms.leadTimeEstimated) {
        notes.push(`No incoming order history found for this drug. Lead time defaulted to ${DEFAULT_LEAD_TIME_DAYS} days.`);
      }

      return {
        success: true,
        data: {
          ...terms,
          notes,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve vendor contract terms: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: analyze_borrow_vs_purchase_cost ---

export const analyzeBorrowVsPurchaseCostTool: IAgentTool<{
  hospitalDrugId: string;
  quantity: number;
  lenderHospitalId?: string;
  distanceKm?: number;
  isColdChain?: boolean;
}> = {
  name: 'analyze_borrow_vs_purchase_cost',
  description:
    'Compares inter-hospital emergency borrowing costs (F-23) against commercial wholesale purchasing, incorporating repeat expiry risks (F-25) and transport economics.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().describe('UUID of the hospital drug to procure or borrow'),
    quantity: z.number().positive().describe('Required drug quantity in base units'),
    lenderHospitalId: z.string().uuid().optional().describe('UUID of candidate peer lending hospital in same network'),
    distanceKm: z.number().min(0).optional().describe('Direct highway distance in kilometers'),
    isColdChain: z.boolean().optional().describe('Explicit cold-chain requirement override'),
  }),
  allowedRoles: ['PROCUREMENT_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to analyze borrow vs purchase costs.',
        };
      }

      // Check hospital drug existence and tenant isolation
      const drugRes = await query<{
        id: string;
        hospital_id: string;
        drug_master_id: string;
        local_code: string;
        local_name: string;
        unit_price_thb: string | number | null;
        generic_name: string;
        is_cold_chain: boolean | null;
      }>(
        `SELECT hd.id, hd.hospital_id, hd.drug_master_id, hd.local_code, hd.local_name, hd.unit_price_thb,
                dm.generic_name, dm.is_cold_chain
           FROM hospital_drug hd
           JOIN drug_master dm ON dm.id = hd.drug_master_id
          WHERE hd.id = $1`,
        [args.hospitalDrugId],
      );

      if (drugRes.rows.length === 0) {
        return { success: false, error: 'Hospital drug not found or not permitted.' };
      }

      const drug = drugRes.rows[0];
      const callerHospId = hospitalId || drug.hospital_id;

      if (!isSystemAdmin && drug.hospital_id !== hospitalId) {
        return { success: false, error: 'Hospital drug not found or not permitted.' };
      }

      const unitPrice = drug.unit_price_thb !== null ? Number(drug.unit_price_thb) : 0;
      const isColdChain = args.isColdChain ?? Boolean(drug.is_cold_chain);

      // Distance & Transit time resolution
      let distanceKm: number | null = null;
      let transitHours: number | null = null;
      let lenderHospitalName: string | null = null;

      if (args.distanceKm !== undefined) {
        distanceKm = args.distanceKm;
        transitHours = round(distanceKm / 60, 2); // reasonable baseline transit estimate (1 hr per 60 km)
      } else if (args.lenderHospitalId) {
        // Enforce same-network constraint
        const netCheck = await query<{
          caller_net: string | null;
          lender_net: string | null;
          lender_name: string;
        }>(
          `SELECT c.network_id AS caller_net, l.network_id AS lender_net, l.name_th AS lender_name
             FROM hospital c
             JOIN hospital l ON l.id = $2
            WHERE c.id = $1`,
          [callerHospId, args.lenderHospitalId],
        );

        if (netCheck.rows.length === 0) {
          return { success: false, error: 'Lender hospital not found.' };
        }

        const net = netCheck.rows[0];
        lenderHospitalName = net.lender_name;

        if (net.caller_net !== net.lender_net || !net.caller_net) {
          return {
            success: false,
            error: 'Lender hospital is not in the caller\'s hospital network.',
          };
        }

        // Query distance matrix
        const distRes = await query<{
          distance_km: string | number;
          travel_minutes: string | number | null;
        }>(
          `SELECT distance_km, COALESCE(travel_minutes_override, travel_minutes) AS travel_minutes
             FROM hospital_distance
            WHERE (from_hospital_id = $1 AND to_hospital_id = $2)
               OR (from_hospital_id = $2 AND to_hospital_id = $1)
            LIMIT 1`,
          [callerHospId, args.lenderHospitalId],
        );

        if (distRes.rows.length === 0) {
          return {
            success: false,
            error: 'No distance matrix record exists between caller and lender hospital.',
          };
        }

        distanceKm = Number(distRes.rows[0].distance_km);
        const mins = distRes.rows[0].travel_minutes !== null ? Number(distRes.rows[0].travel_minutes) : distanceKm;
        transitHours = round(mins / 60, 2);
      } else {
        return {
          success: false,
          error: 'Either distanceKm or lenderHospitalId must be provided to evaluate borrowing costs.',
        };
      }

      // Load cost model from expiry configuration (F-23)
      const expiryConfig = await loadExpiryConfig(pool, callerHospId);
      const costModel = expiryConfig.cost;

      // F-23 Transport Cost & Economics
      const goodsValue = round(args.quantity * unitPrice, 2);
      const transportCostThb = transportCost(distanceKm, isColdChain, costModel);
      const costCheckResult = costCheck(transportCostThb, goodsValue, costModel.ratioMax);

      // Commercial purchase cost + 7% VAT
      const purchaseSubtotalThb = goodsValue;
      const vatThb = round(purchaseSubtotalThb * VAT_RATE, 2);
      const totalPurchaseWithVatThb = round(purchaseSubtotalThb + vatThb, 2);

      // Load vendor lead time
      const terms = await loadDrugContractTerms(args.hospitalDrugId, callerHospId);
      const purchaseLeadTimeDays = terms ? terms.leadTimeDays : DEFAULT_LEAD_TIME_DAYS;

      // F-25: Check for repeat expiry history
      const repeatRes = await query<{
        level: string;
        lots_12m: number;
        value_12m_thb: string | number;
        suggestion: Record<string, unknown> | null;
      }>(
        `SELECT level, lots_12m, value_12m_thb, suggestion
           FROM repeat_expiry_flag
          WHERE hospital_id = $1
            AND drug_master_id = $2
            AND (dismissed_until IS NULL OR dismissed_until < CURRENT_DATE)
          LIMIT 1`,
        [callerHospId, drug.drug_master_id],
      );

      const repeatExpiry = repeatRes.rows.length > 0 ? repeatRes.rows[0] : null;

      // Deterministic Recommendation Rule
      let recommendation: 'RECOMMEND_BORROW' | 'RECOMMEND_PURCHASE' | 'RECOMMEND_HYBRID' = 'RECOMMEND_PURCHASE';
      const reasoning: string[] = [];

      const purchaseLeadTimeHours = purchaseLeadTimeDays * 24;
      const isUrgentNeed = transitHours !== null && purchaseLeadTimeHours > transitHours + 24;

      if (repeatExpiry && args.quantity > 50) {
        recommendation = 'RECOMMEND_HYBRID';
        reasoning.push(
          `Repeat expiry flag active (${repeatExpiry.level}). Borrowing urgent buffer and reducing purchase quantity prevents future lot expiration waste.`,
        );
      } else if (!costCheckResult.uneconomical && isUrgentNeed) {
        recommendation = 'RECOMMEND_BORROW';
        reasoning.push(
          `Commercial procurement lead time (${purchaseLeadTimeDays} days) significantly exceeds transit duration (${transitHours} hours). Borrowing is economically viable (${round((costCheckResult.ratio || 0) * 100, 1)}% cost ratio < ${costModel.ratioMax * 100}% max).`,
        );
      } else {
        recommendation = 'RECOMMEND_PURCHASE';
        if (costCheckResult.uneconomical) {
          reasoning.push(
            `Transport cost (${transportCostThb} THB) exceeds ${costModel.ratioMax * 100}% of goods value (${goodsValue} THB), making inter-hospital borrowing uneconomical.`,
          );
        } else {
          reasoning.push('Commercial purchase is recommended under current stock coverage and lead times.');
        }
      }

      return {
        success: true,
        data: {
          hospitalDrugId: args.hospitalDrugId,
          drugName: drug.local_name || drug.generic_name,
          quantity: args.quantity,
          unitPriceThb: unitPrice,
          isColdChain,
          borrowOption: {
            lenderHospitalId: args.lenderHospitalId ?? null,
            lenderHospitalName,
            distanceKm,
            transitHours,
            transitHoursNote: 'Transit hours reflect transport travel time only and exclude mutual administrative approval delays.',
            transportCostThb,
            costRatio: costCheckResult.ratio,
            uneconomical: costCheckResult.uneconomical,
            ratioMax: costModel.ratioMax,
            obligationNote: 'Goods borrowed under DooRare must be repaid in kind (same drug, matching strength and form) within the agreed return window.',
          },
          purchaseOption: {
            unitPriceThb: unitPrice,
            subtotalThb: purchaseSubtotalThb,
            vatRate: VAT_RATE,
            vatThb,
            totalPurchaseWithVatThb,
            leadTimeDays: purchaseLeadTimeDays,
            leadTimeEstimated: terms?.leadTimeEstimated ?? true,
            moq: terms?.moq ?? DEFAULT_MOQ,
          },
          repeatExpiryWarning: repeatExpiry
            ? {
                level: repeatExpiry.level,
                lots12m: repeatExpiry.lots_12m,
                value12mThb: Number(repeatExpiry.value_12m_thb),
                storedSuggestion: repeatExpiry.suggestion,
                warning: 'Warning: Drug has repeated expiry losses in the trailing 12 months. Avoid ordering large batches.',
                reductionPlanNote: 'reductionPlan was not recomputed because order cycle days are not tracked in the schema. The stored suggestion is provided above.',
              }
            : null,
          recommendation,
          reasoning,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to analyze borrow vs purchase cost: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: draft_rfq_purchase_order ---

export const draftRfqPurchaseOrderTool: IAgentTool<{
  items: Array<{
    hospitalDrugId: string;
    quantity: number;
    targetUnitPrice?: number;
  }>;
  vendorName?: string;
  justification: string;
}> = {
  name: 'draft_rfq_purchase_order',
  description:
    'Drafts formal bilingual Request For Quotation (RFQ) or Purchase Requisition (PR) text with line-item VAT calculations and justification.',
  parameters: z.object({
    items: z
      .array(
        z.object({
          hospitalDrugId: z.string().uuid().describe('UUID of the hospital drug'),
          quantity: z.number().positive().describe('Requested procurement quantity'),
          targetUnitPrice: z.number().min(0).optional().describe('Target price per unit in THB'),
        }),
      )
      .min(1)
      .max(20)
      .describe('Line items to procure (max 20 items)'),
    vendorName: z.string().max(120).optional().describe('Optional preferred vendor name'),
    justification: z.string().min(1).max(1000).describe('Clinical and stock justification for requisition'),
  }),
  allowedRoles: ['PROCUREMENT_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to draft purchase requisitions.',
        };
      }

      // Check prompt injection on justification and vendorName
      const injectionSuspected =
        isPromptInjection(args.justification) || (args.vendorName ? isPromptInjection(args.vendorName) : false);

      const flags: string[] = [];
      if (injectionSuspected) {
        flags.push('PROMPT_INJECTION_SUSPECTED');
      }

      const sanitizedJustification = injectionSuspected
        ? '[REDACTED_SUSPECTED_INJECTION]'
        : args.justification.trim();

      const sanitizedVendorName =
        args.vendorName && !injectionSuspected ? args.vendorName.trim() : null;

      // Validate each item belongs to caller and resolve unit price
      const lineItems = [];
      let maxLeadTimeDays = DEFAULT_LEAD_TIME_DAYS;
      let subtotalThb = 0;

      for (const item of args.items) {
        const drugRes = await query<{
          id: string;
          hospital_id: string;
          local_code: string;
          local_name: string;
          unit_price_thb: string | number | null;
          generic_name: string;
          base_unit: string;
        }>(
          `SELECT hd.id, hd.hospital_id, hd.local_code, hd.local_name, hd.unit_price_thb,
                  dm.generic_name, dm.base_unit
             FROM hospital_drug hd
             JOIN drug_master dm ON dm.id = hd.drug_master_id
            WHERE hd.id = $1`,
          [item.hospitalDrugId],
        );

        if (drugRes.rows.length === 0) {
          return { success: false, error: `Hospital drug '${item.hospitalDrugId}' not found.` };
        }

        const d = drugRes.rows[0];
        if (!isSystemAdmin && hospitalId && d.hospital_id !== hospitalId) {
          return { success: false, error: `Permission denied: Drug '${d.local_code}' belongs to another hospital.` };
        }

        let price: number | null = item.targetUnitPrice ?? (d.unit_price_thb !== null ? Number(d.unit_price_thb) : null);
        if (price === null) {
          return {
            success: false,
            error: `Unit price is missing for item '${d.local_code} (${d.local_name})'. Target unit price must be provided.`,
          };
        }

        const lineTotal = round(item.quantity * price, 2);
        subtotalThb = round(subtotalThb + lineTotal, 2);

        // Fetch lead time for delivery estimation
        const terms = await loadDrugContractTerms(item.hospitalDrugId, hospitalId ?? null);
        if (terms && terms.leadTimeDays > maxLeadTimeDays) {
          maxLeadTimeDays = terms.leadTimeDays;
        }

        lineItems.push({
          hospitalDrugId: item.hospitalDrugId,
          drugCode: d.local_code,
          drugName: d.local_name || d.generic_name,
          baseUnit: d.base_unit,
          quantity: item.quantity,
          unitPriceThb: price,
          lineTotalThb: lineTotal,
        });
      }

      const vatThb = round(subtotalThb * VAT_RATE, 2);
      const grandTotalThb = round(subtotalThb + vatThb, 2);

      // Generate reference: DRAFT-PR-YYYYMMDD-<random 4 chars>
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const draftReference = `DRAFT-PR-${datePart}-${randomSuffix}`;

      // Build formal requisition draft text
      const requisitionDraft = `
================================================================================
                    ใบขออนุมัติจัดซื้อยาและเวชภัณฑ์ (ร่าง)
                 PURCHASE REQUISITION DRAFT (PRE-APPROVAL)
================================================================================
เลขที่อ้างอิง (Reference): ${draftReference}
วันที่ (Date): ${new Date().toISOString().slice(0, 10)}
ผู้จัดจำหน่ายที่เสนอ (Vendor): ${sanitizedVendorName || 'ไม่ระบุ / ตามสัญญาคลัง'}

รายการเวชภัณฑ์ (Line Items):
${lineItems.map((li, idx) => `${idx + 1}. [${li.drugCode}] ${li.drugName} | จำนวน: ${li.quantity} ${li.baseUnit} @ ${li.unitPriceThb.toFixed(2)} บาท = ${li.lineTotalThb.toFixed(2)} บาท`).join('\n')}

สรุปมูลค่า (Financial Summary):
- มูลค่ารวมก่อนภาษี (Subtotal): ${subtotalThb.toFixed(2)} THB
- ภาษีมูลค่าเพิ่ม (VAT 7%): ${vatThb.toFixed(2)} THB
- มูลค่ารวมทั้งสิ้น (Grand Total): ${grandTotalThb.toFixed(2)} THB

ประมาณการระยะเวลาส่งมอบ (Estimated Delivery): ${maxLeadTimeDays} วัน (ประมาณการ)
เหตุผลความจำเป็น (Justification):
${sanitizedJustification}

หมายเหตุ (Note):
เอกสารนี้เป็นร่างคำขอจัดซื้อเพื่อการตรวจสอบภายใน ยังไม่ได้ขึ้นทะเบียนเป็นใบสั่งซื้อจริงในระบบ ERP
(This is an offline procurement draft generated for review; no backend ERP purchase order exists).
================================================================================
      `.trim();

      return {
        success: true,
        data: {
          draftReference,
          vendorName: sanitizedVendorName,
          justification: sanitizedJustification,
          items: lineItems,
          financials: {
            subtotalThb,
            vatRate: VAT_RATE,
            vatThb,
            grandTotalThb,
          },
          estimatedDeliveryDays: maxLeadTimeDays,
          isDeliveryEstimated: true,
          requisitionDraft,
          injectionSuspected,
          flags,
          statusNote: 'Draft generated for manual procurement review. No backend purchase requisition route exists.',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to draft purchase requisition: ${e.message}`,
      };
    }
  },
};

// --- TOOL 5: submit_procurement_proposal (TERMINAL) ---

export const submitProcurementProposalTool: IAgentTool<{
  actionType: 'ACKNOWLEDGE_REORDER_ALERT' | 'CREATE_PURCHASE_REQUISITION' | 'ESCALATE_PROCUREMENT_DIRECTOR';
  title: string;
  description: string;
  summary: Record<string, unknown>;
  targetId?: string;
  payload?: Record<string, unknown>;
}> = {
  name: 'submit_procurement_proposal',
  description:
    'Terminal tool submitting human-in-the-loop action proposals for acknowledging stock reorder alerts, drafting purchase requisitions, or director escalations.',
  parameters: z.object({
    actionType: z
      .enum(['ACKNOWLEDGE_REORDER_ALERT', 'CREATE_PURCHASE_REQUISITION', 'ESCALATE_PROCUREMENT_DIRECTOR'])
      .describe('Whitelisted procurement action type'),
    title: z.string().describe('Title of the proposed action'),
    description: z.string().describe('Detailed procurement rationale'),
    summary: z.record(z.string(), z.unknown()).describe('Key-value summary of proposed metrics'),
    targetId: z.string().uuid().optional().describe('Target UUID (required for ACKNOWLEDGE_REORDER_ALERT: stock_alert ID)'),
    payload: z.record(z.string(), z.unknown()).optional().default({}).describe('Action-specific payload parameters'),
  }),
  allowedRoles: ['PROCUREMENT_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to submit procurement proposals.',
        };
      }

      // G-09 injection check on title and description
      const injectionSuspected = isPromptInjection(args.title) || isPromptInjection(args.description);
      const title = injectionSuspected ? '[REDACTED_SUSPECTED_INJECTION]' : args.title;
      let description = injectionSuspected ? '[REDACTED_SUSPECTED_INJECTION]' : args.description;

      // Handle draft-only actions
      if (args.actionType === 'CREATE_PURCHASE_REQUISITION' || args.actionType === 'ESCALATE_PROCUREMENT_DIRECTOR') {
        return {
          success: true,
          data: {
            status: 'DRAFT_ONLY',
            executable: false,
            actionType: args.actionType,
            note: 'No backend ERP/PO purchasing or escalation endpoint exists in DooRare. Drafted for offline/manual approval.',
          },
        };
      }

      if (args.actionType === 'ACKNOWLEDGE_REORDER_ALERT') {
        if (!args.targetId) {
          return {
            success: false,
            error: 'targetId (stock_alert ID) is required for ACKNOWLEDGE_REORDER_ALERT.',
          };
        }

        // Verify alert exists, belongs to caller hospital, and is OPEN
        const alertRes = await query<{
          id: string;
          hospital_id: string;
          status: string;
          version: number;
        }>(
          'SELECT id, hospital_id, status::text AS status, version FROM stock_alert WHERE id = $1',
          [args.targetId],
        );

        if (alertRes.rows.length === 0) {
          return { success: false, error: `Stock alert '${args.targetId}' not found or not permitted.` };
        }

        const alert = alertRes.rows[0];

        if (!isSystemAdmin && hospitalId && alert.hospital_id !== hospitalId) {
          return { success: false, error: `Stock alert '${args.targetId}' not found or not permitted.` };
        }

        if (alert.status !== 'OPEN') {
          return {
            success: false,
            error: `Cannot acknowledge stock alert: alert status is ${alert.status} (only OPEN alerts may be acknowledged).`,
          };
        }

        const rawPayload = args.payload || {};
        const version = typeof rawPayload.version === 'number' ? rawPayload.version : alert.version;

        // Mandated description notice regarding PHARMACIST role check
        description = `${description}\n\nNote: /api/v1/alerts/:id/ack currently enforces a PHARMACIST role check on the backend route. A pure PROCUREMENT_OFFICER user may be denied (403) when approving unless the route's role list is extended by the backend owner.`.trim();

        const proposal: ToolProposalPayload = {
          type: args.actionType,
          title,
          description,
          summary: {
            ...args.summary,
            requestedBy: context.userId || 'current-user',
            hospitalId: hospitalId || 'global',
          },
          actionApi: {
            endpoint: `/api/v1/alerts/${args.targetId}/ack`,
            method: 'POST',
            payload: {
              version,
            },
          },
        };

        return {
          success: true,
          proposal,
        };
      }

      return {
        success: false,
        error: `Unknown procurement actionType '${args.actionType}'.`,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to submit procurement proposal: ${e.message}`,
      };
    }
  },
};

export const procurementTools = [
  getReorderRecommendationListTool,
  getVendorContractTermsTool,
  analyzeBorrowVsPurchaseCostTool,
  draftRfqPurchaseOrderTool,
  submitProcurementProposalTool,
] as const;
