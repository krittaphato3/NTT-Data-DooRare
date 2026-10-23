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

/**
 * Tool: draft_emergency_incident
 * Parses casualty triage counts (Red, Yellow, Green, Black) from free-text verbal emergency descriptions.
 * Guardrails: Never invents missing numbers (returns null if unparsed), treats narrative strictly as passive data (G-09),
 * and never emits medical treatment advice (G-08).
 * Allowed Roles: ER_STAFF, SYSTEM_ADMIN
 */
export const draftEmergencyIncidentTool: IAgentTool<{
  narrative: string;
  incidentType?: string;
  location?: string;
}> = {
  name: 'draft_emergency_incident',
  description:
    'Extracts Red, Yellow, Green, and Black casualty counts from verbal or unstructured triage narratives for emergency incident documentation.',
  parameters: z.object({
    narrative: z.string().describe('Verbal triage description or emergency report text'),
    incidentType: z
      .string()
      .optional()
      .describe('Suspected incident mechanism (e.g. MASS_CASUALTY, CHEMICAL_SPILL, TRAUMA)'),
    location: z.string().optional().describe('Incident or triage location'),
  }),
  allowedRoles: ['ER_STAFF', 'SYSTEM_ADMIN'],
  execute: async (args): Promise<ToolResult> => {
    try {
      const rawText = args.narrative;
      const flags: string[] = [];

      // Prompt injection defense (G-09)
      const injectionPattern =
        /(ignore\s+(all\s+)?previous\s+instructions|system\s*:|override\s+all|you\s+are\s+now|developer\s+mode|as\s+an\s+ai)/i;
      if (injectionPattern.test(rawText)) {
        flags.push('PROMPT_INJECTION_SUSPECTED');
      }

      const text = rawText.toLowerCase();

      // Extract red priority count
      const redRegexes = [
        /(?:แดง|สีแดง)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:ราย|คน)?\s*(?:แดง|สีแดง)/i,
        /(?:red|immediate)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:patients?|cases?)?\s*(?:red|immediate)/i,
      ];
      let redCount: number | null = null;
      for (const r of redRegexes) {
        const m = rawText.match(r);
        if (m && m[1]) {
          redCount = parseInt(m[1], 10);
          break;
        }
      }

      // Extract yellow priority count
      const yellowRegexes = [
        /(?:เหลือง|สีเหลือง)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:ราย|คน)?\s*(?:เหลือง|สีเหลือง)/i,
        /(?:yellow|delayed)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:patients?|cases?)?\s*(?:yellow|delayed)/i,
      ];
      let yellowCount: number | null = null;
      for (const r of yellowRegexes) {
        const m = rawText.match(r);
        if (m && m[1]) {
          yellowCount = parseInt(m[1], 10);
          break;
        }
      }

      // Extract green priority count
      const greenRegexes = [
        /(?:เขียว|สีเขียว)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:ราย|คน)?\s*(?:เขียว|สีเขียว)/i,
        /(?:green|minor|walking)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:patients?|cases?)?\s*(?:green|minor)/i,
      ];
      let greenCount: number | null = null;
      for (const r of greenRegexes) {
        const m = rawText.match(r);
        if (m && m[1]) {
          greenCount = parseInt(m[1], 10);
          break;
        }
      }

      // Extract black priority count (deceased)
      const blackRegexes = [
        /(?:ดำ|สีดำ|เสียชีวิต)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:ราย|คน)?\s*(?:ดำ|สีดำ|เสียชีวิต)/i,
        /(?:black|deceased|dead)\s*[:=]?\s*(\d+)/i,
        /(\d+)\s*(?:patients?|cases?)?\s*(?:black|deceased)/i,
      ];
      let blackCount: number | null = null;
      for (const r of blackRegexes) {
        const m = rawText.match(r);
        if (m && m[1]) {
          blackCount = parseInt(m[1], 10);
          break;
        }
      }

      // Check if any numbers could not be identified
      let needsConfirmation = false;
      if (redCount === null || yellowCount === null || greenCount === null) {
        flags.push('UNPARSED_TRIAGE_COUNTS');
        needsConfirmation = true;
      }

      const parsedTotal =
        (redCount ?? 0) + (yellowCount ?? 0) + (greenCount ?? 0) + (blackCount ?? 0);

      const incidentTitle = args.incidentType
        ? `Emergency Incident: ${args.incidentType}`
        : 'Emergency Incident Triage Intake';

      return {
        success: true,
        data: {
          incidentTitle,
          incidentType: args.incidentType || 'MASS_CASUALTY',
          location: args.location || 'Unknown',
          triageCounts: {
            red: redCount,
            yellow: yellowCount,
            green: greenCount,
            black: blackCount,
            totalConfirmed: parsedTotal,
          },
          needsConfirmation,
          flags,
          rawNarrative: rawText,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to draft emergency incident: ${e.message}`,
      };
    }
  },
};

/**
 * Tool: track_urgent_dispatch_eta
 * Real-time transport status and courier ETA tracker for emergency antidote and kit deliveries.
 * Allowed Roles: ER_STAFF, PHARMACIST, SYSTEM_ADMIN
 */
export const trackUrgentDispatchEtaTool: IAgentTool<{
  taskId?: string;
  taskNo?: string;
}> = {
  name: 'track_urgent_dispatch_eta',
  description:
    'Tracks real-time dispatch progress, transport status, vehicle plate, and arrival ETA for urgent deliveries.',
  parameters: z.object({
    taskId: z.string().uuid().optional().describe('UUID of the transport task'),
    taskNo: z.string().optional().describe('Tracking number of the transport task (e.g. TR-2026-...)'),
  }),
  allowedRoles: ['ER_STAFF', 'PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!args.taskId && !args.taskNo) {
        return {
          success: false,
          error: 'Either taskId or taskNo must be provided.',
        };
      }

      const params: unknown[] = [];
      const where: string[] = [];

      if (args.taskId) {
        params.push(args.taskId);
        where.push(`tt.id = $${params.length}`);
      }

      if (args.taskNo) {
        params.push(args.taskNo.trim());
        where.push(`tt.task_no = $${params.length}`);
      }

      const sql = `
        SELECT tt.id AS "taskId",
               tt.task_no AS "taskNo",
               tt.ref_type AS "refType",
               tt.ref_id AS "refId",
               tt.status::text AS "status",
               tt.from_hospital_id AS "fromHospitalId",
               tt.to_hospital_id AS "toHospitalId",
               tt.eta_at AS "etaAt",
               tt.loaded_at AS "loadedAt",
               tt.departed_at AS "departedAt",
               tt.arrived_at AS "arrivedAt",
               tt.received_at AS "receivedAt",
               v.plate AS "vehiclePlate",
               COALESCE(h_from.name_th, h_from.name_en) AS "originHospitalName",
               COALESCE(h_to.name_th, h_to.name_en) AS "destinationHospitalName"
          FROM transport_task tt
          JOIN hospital h_from ON h_from.id = tt.from_hospital_id
          JOIN hospital h_to ON h_to.id = tt.to_hospital_id
          LEFT JOIN vehicle v ON v.id = tt.vehicle_id
         WHERE ${where.join(' AND ')}
      `;

      const res = await query(sql, params);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: 'Transport task not found.',
        };
      }

      const task = res.rows[0];

      // Multi-tenant authorization check: caller hospital must be either origin or destination
      if (
        !isSystemAdmin &&
        hospitalId &&
        task.fromHospitalId !== hospitalId &&
        task.toHospitalId !== hospitalId
      ) {
        return {
          success: false,
          error: 'Permission denied: Caller hospital is neither the origin nor the destination of this transport task.',
        };
      }

      let remainingMinutes: number | null = null;
      if (task.etaAt) {
        remainingMinutes = Math.max(
          0,
          Math.round((new Date(task.etaAt).getTime() - Date.now()) / 60000),
        );
      }

      return {
        success: true,
        data: {
          taskId: task.taskId,
          taskNo: task.taskNo,
          status: task.status,
          originHospital: task.originHospitalName,
          destinationHospital: task.destinationHospitalName,
          vehiclePlate: task.vehiclePlate || 'Not Assigned',
          etaAt: task.etaAt ? new Date(task.etaAt).toISOString() : null,
          remainingMinutes,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to track transport task: ${e.message}`,
      };
    }
  },
};
