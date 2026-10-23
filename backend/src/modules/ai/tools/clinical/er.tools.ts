import { z } from 'zod';
import { query } from '../../../../db/client.js';
import { needs } from '../../../../core/formulas/emergency.js';
import type { Counts, Rule, Triage } from '../../../../core/formulas/emergency.js';
import type { IAgentTool, RequestContext, ToolResult } from '../tool.types.js';

/**
 * Tool: get_antidote_locator
 * 60-minute radius availability check for acute poisonings, toxic exposures, and rare antidotes.
 * Privacy & Security: Returns only public logistics metadata (hospital name, travel time, available quantity).
 * Never leaks internal lot numbers, acquisition costs, or sensitive hospital data.
 * Allowed Roles: ER_STAFF, PHARMACIST, SYSTEM_ADMIN
 */
export const getAntidoteLocatorTool: IAgentTool<{
  antidoteQuery: string;
  radiusMinutes?: number;
  requiredQuantity?: number;
}> = {
  name: 'get_antidote_locator',
  description:
    'Locates candidate hospitals holding available stock of critical antidotes or toxidrome countermeasures within a travel-time radius (default 60 minutes).',
  parameters: z.object({
    antidoteQuery: z
      .string()
      .describe(
        'Generic drug name, antidote keyword, or toxidrome (e.g. botulinum, diphtheria, antivenom, cyanide, atropine)',
      ),
    radiusMinutes: z
      .number()
      .positive()
      .optional()
      .default(60)
      .describe('Maximum travel time radius in minutes (default 60)'),
    requiredQuantity: z
      .number()
      .positive()
      .optional()
      .describe('Optional required quantity to evaluate availability'),
  }),
  allowedRoles: ['ER_STAFF', 'PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to locate nearest antidotes relative to current emergency.',
        };
      }

      // If no hospitalId in context (system admin testing), pick default active hospital as origin
      const originHospitalId =
        hospitalId ||
        (await query<{ id: string }>('SELECT id FROM hospital WHERE active = true LIMIT 1')).rows[0]?.id;

      if (!originHospitalId) {
        return { success: false, error: 'Origin hospital could not be determined.' };
      }

      const radius = args.radiusMinutes || 60;
      const requiredQty = args.requiredQuantity || null;
      const searchQuery = `%${args.antidoteQuery.trim()}%`;

      const sql = `
        SELECT COALESCE(h.name_th, h.name_en) AS "hospitalName",
               COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS "travelMinutes",
               concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form) AS "antidoteName",
               dm.base_unit AS "unit",
               dm.is_cold_chain AS "requiresColdChain",
               h.has_cold_chain AS "hasColdChainStorage",
               COALESCE(sum(sl.qty_on_hand - sl.qty_held), 0)::float8 AS "availableQuantity"
          FROM hospital h
          LEFT JOIN hospital_distance d ON d.from_hospital_id = h.id AND d.to_hospital_id = $1
          JOIN hospital_drug hd ON hd.hospital_id = h.id
          JOIN drug_master dm ON dm.id = hd.drug_master_id
          JOIN stock_lot sl ON sl.hospital_drug_id = hd.id AND sl.hospital_id = h.id
         WHERE h.id <> $1
           AND h.active = true
           AND sl.expiry_date > current_date
           AND (dm.generic_name ILIKE $2 OR hd.local_name ILIKE $2)
           AND COALESCE(d.travel_minutes_override, d.travel_minutes) <= $3
         GROUP BY h.id, h.name_th, h.name_en, d.travel_minutes_override, d.travel_minutes,
                  dm.generic_name, dm.strength, dm.dosage_form, dm.base_unit, dm.is_cold_chain, h.has_cold_chain
        HAVING sum(sl.qty_on_hand - sl.qty_held) > 0
         ORDER BY "travelMinutes" ASC, "availableQuantity" DESC
         LIMIT 10
      `;

      const res = await query(sql, [originHospitalId, searchQuery, radius]);

      const formattedResults = res.rows.map((r) => ({
        hospitalName: r.hospitalName,
        travelMinutes: r.travelMinutes,
        antidoteName: r.antidoteName,
        unit: r.unit,
        availableQuantity: r.availableQuantity,
        meetsRequirement: requiredQty !== null ? r.availableQuantity >= requiredQty : true,
      }));

      return {
        success: true,
        data: {
          query: args.antidoteQuery,
          radiusMinutes: radius,
          foundHospitalsCount: formattedResults.length,
          hospitals: formattedResults,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to locate antidote: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: get_incident_kit_recommendations
 * Maps triage casualties (Red, Yellow, Green) to preset emergency medical kit requirements using institutional kit recipe rules.
 * Allowed Roles: ER_STAFF, PHARMACIST, SYSTEM_ADMIN
 */
export const getIncidentKitRecommendationsTool: IAgentTool<{
  redCasualties: number;
  yellowCasualties: number;
  greenCasualties: number;
  incidentType?: string;
}> = {
  name: 'get_incident_kit_recommendations',
  description:
    'Calculates recommended emergency kit quantities based on Red, Yellow, and Green casualty triage counts using standard institutional recipe rules.',
  parameters: z.object({
    redCasualties: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Immediate / critical casualties (Red priority)'),
    yellowCasualties: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Delayed / urgent casualties (Yellow priority)'),
    greenCasualties: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Minor / non-urgent casualties (Green priority)'),
    incidentType: z
      .string()
      .optional()
      .describe('Optional incident type or mechanism (e.g. MASS_CASUALTY, CHEMICAL_SPILL, TRAUMA)'),
  }),
  allowedRoles: ['ER_STAFF', 'PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args): Promise<ToolResult> => {
    try {
      const counts: Counts = {
        RED: args.redCasualties || 0,
        YELLOW: args.yellowCasualties || 0,
        GREEN: args.greenCasualties || 0,
      };

      const totalCasualties = counts.RED + counts.YELLOW + counts.GREEN;

      // Query kit recipes from database
      const recipeRows = await query<{
        code: string;
        name: string;
        triage: Triage;
        qty_per_patient: number;
        is_critical_min: boolean;
      }>(`
        SELECT kt.code, kt.name, kr.triage::text AS triage, kr.qty_per_patient::float8 AS qty_per_patient, kr.is_critical_min
          FROM kit_recipe kr
          JOIN kit_type kt ON kt.id = kr.kit_type_id
         WHERE kt.active = true
         ORDER BY kt.code, kr.triage
      `);

      const rules: Rule[] = recipeRows.rows.map((r) => ({
        key: r.code,
        triage: r.triage,
        perPatient: r.qty_per_patient,
        critical: r.is_critical_min,
      }));

      // Calculate needed kits using standard emergency formula
      const calculatedNeeds = needs(counts, rules);

      const kitNameMap = new Map<string, string>();
      for (const r of recipeRows.rows) {
        kitNameMap.set(r.code, r.name);
      }

      const kitRecommendations = calculatedNeeds.map((item) => ({
        kitCode: item.key,
        kitName: kitNameMap.get(item.key) || item.key,
        estimatedQuantity: item.est,
        criticalMinimum: item.crit,
      }));

      return {
        success: true,
        data: {
          triageSummary: {
            red: counts.RED,
            yellow: counts.YELLOW,
            green: counts.GREEN,
            total: totalCasualties,
            incidentType: args.incidentType || 'MASS_CASUALTY',
          },
          recommendationCount: kitRecommendations.length,
          recommendedKits: kitRecommendations,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to calculate incident kit recommendations: ${e.message}`,
      };
    }
  },
};
