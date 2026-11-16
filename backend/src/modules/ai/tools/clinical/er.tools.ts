import { z } from 'zod';
import { query } from '../../../../db/client.js';
import { needs } from '../../../../core/formulas/emergency.js';
import type { Counts, Rule, Triage } from '../../../../core/formulas/emergency.js';
import { resolveKitCode } from '../../../incidents/plan.service.js';
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
           AND COALESCE(dm.is_controlled, false) = false  -- BR-F1b-014: controlled drugs are never offered
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
        BLACK: 0,
        UNKNOWN: 0,
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

/**
 * Whitelist map for ER proposal actions.
 * Every endpoint maps to an existing authenticated route in the backend.
 */
export const ER_PROPOSAL_WHITELIST = {
  DECLARE_INCIDENT: {
    buildEndpoint: () => '/api/v1/incidents',
    method: 'POST' as const,
    routeSource: 'backend/src/modules/incidents/incidents.routes.ts:25',
    payloadSchema: z
      .object({
        title: z.string().optional(),
        incidentType: z.string().optional(),
        eventType: z.string().optional(),
        location: z.string().optional(),
        locationText: z.string().optional(),
        patientCounts: z.record(z.string(), z.number().int().min(0)).optional(),
        counts: z.record(z.string(), z.number().int().min(0)).optional(),
        description: z.string().optional(),
        reportedEtaMin: z.number().int().positive().optional(),
        edits: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  },
  UPDATE_INCIDENT: {
    buildEndpoint: (incidentId?: string) => {
      if (!incidentId) throw new Error('incidentId (targetId) is required for UPDATE_INCIDENT');
      return `/api/v1/incidents/${incidentId}/counts`;
    },
    method: 'PATCH' as const,
    routeSource: 'backend/src/modules/incidents/incidents.routes.ts:30 (PATCH /incidents/:id/counts)',
    payloadSchema: z
      .object({
        counts: z.record(z.string(), z.number().int().min(0)).optional(),
        patientCounts: z.record(z.string(), z.number().int().min(0)).optional(),
        incidentType: z.string().optional(),
        description: z.string().optional(),
        locationText: z.string().optional(),
        note: z.string().optional(),
        reportedEtaMin: z.number().int().positive().optional(),
        edits: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  },
  DISPATCH_EMERGENCY_KITS: {
    buildEndpoint: (incidentId?: string) => {
      if (!incidentId) throw new Error('incidentId (targetId) is required for DISPATCH_EMERGENCY_KITS');
      return `/api/v1/incidents/${incidentId}/plan/approve`;
    },
    method: 'POST' as const,
    routeSource: 'backend/src/modules/incidents/incidents.routes.ts:33',
    payloadSchema: z.object({
      version: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }),
  },
  REQUEST_URGENT_ANTIDOTE: {
    buildEndpoint: (incidentId?: string) => {
      if (incidentId) {
        return `/api/v1/incidents/${incidentId}/emergency-borrow`;
      }
      return '/api/v1/borrow-requests';
    },
    method: 'POST' as const,
    routeSource:
      'backend/src/modules/incidents/incidents.routes.ts:34 (with incidentId) / backend/src/modules/borrow/borrow.routes.ts:19 (standalone)',
    payloadSchema: z
      .object({
        reason: z.string().optional().default('Emergency borrow request'),
        urgency: z.string().optional().default('VERY_URGENT'),
        items: z
          .array(
            z.object({
              drugMasterId: z.string().optional(),
              qtyRequested: z.number().positive().optional(),
            }),
          )
          .optional(),
        incidentId: z.string().optional(),
        requiredUnits: z.number().optional(),
        bloodGroup: z.string().optional(),
        transfusionProtocol: z.string().optional(),
        lenderHospitalIds: z.array(z.string()).optional(),
        lenderPlan: z.record(z.string(), z.array(z.string())).optional(),
      })
      .passthrough(),
  },
} as const;

function extractIncidentDetails(args: {
  actionType: string;
  title: string;
  description: string;
  summary: Record<string, unknown>;
  payload: Record<string, unknown>;
}) {
  const p = args.payload || {};
  const s = args.summary || {};
  const textContent = `${args.title || ''} ${args.description || ''} ${p.description || ''} ${p.title || ''}`;

  // 1. Triage Counts
  const standardizedCounts: { RED: number; YELLOW: number; GREEN: number; BLACK: number } = {
    RED: 0,
    YELLOW: 0,
    GREEN: 0,
    BLACK: 0,
  };

  // Try structured counts objects
  const countSources = [
    p.counts,
    p.patientCounts,
    p.triageCounts,
    s.counts,
    s.patientCounts,
    s.triageCounts,
  ];
  for (const src of countSources) {
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        const key = k.trim().toUpperCase() as 'RED' | 'YELLOW' | 'GREEN' | 'BLACK';
        const num = Number(v);
        if ((key === 'RED' || key === 'YELLOW' || key === 'GREEN' || key === 'BLACK') && !isNaN(num) && num > 0) {
          standardizedCounts[key] = Math.max(standardizedCounts[key], Math.round(num));
        }
      }
    }
  }

  // Try flat properties on payload and summary
  const flatRed = Number(p.red ?? p.RED ?? s.red ?? s.RED ?? s.triage_red ?? s.redCasualties);
  if (!isNaN(flatRed) && flatRed > 0) standardizedCounts.RED = Math.max(standardizedCounts.RED, Math.round(flatRed));

  const flatYellow = Number(p.yellow ?? p.YELLOW ?? s.yellow ?? s.YELLOW ?? s.triage_yellow ?? s.yellowCasualties);
  if (!isNaN(flatYellow) && flatYellow > 0) standardizedCounts.YELLOW = Math.max(standardizedCounts.YELLOW, Math.round(flatYellow));

  const flatGreen = Number(p.green ?? p.GREEN ?? s.green ?? s.GREEN ?? s.triage_green ?? s.greenCasualties);
  if (!isNaN(flatGreen) && flatGreen > 0) standardizedCounts.GREEN = Math.max(standardizedCounts.GREEN, Math.round(flatGreen));

  const flatBlack = Number(p.black ?? p.BLACK ?? s.black ?? s.BLACK ?? s.triage_black ?? s.blackCasualties);
  if (!isNaN(flatBlack) && flatBlack > 0) standardizedCounts.BLACK = Math.max(standardizedCounts.BLACK, Math.round(flatBlack));

  // Regex scans on text if count is still 0
  if (standardizedCounts.RED === 0) {
    const m = textContent.match(/(?:ผู้ป่วยวิกฤต|วิกฤต|สีแดง|แดง|red|triage red)\D*?(\d+)/i);
    if (m && m[1]) standardizedCounts.RED = Number(m[1]);
  }
  if (standardizedCounts.YELLOW === 0) {
    const m = textContent.match(/(?:ผู้ป่วยกึ่งวิกฤต|เร่งด่วน|สีเหลือง|เหลือง|yellow|triage yellow)\D*?(\d+)/i);
    if (m && m[1]) standardizedCounts.YELLOW = Number(m[1]);
  }
  if (standardizedCounts.GREEN === 0) {
    const m = textContent.match(/(?:ผู้ป่วยไม่วิกฤต|สีเขียว|เขียว|green|triage green)\D*?(\d+)/i);
    if (m && m[1]) standardizedCounts.GREEN = Number(m[1]);
  }
  if (standardizedCounts.BLACK === 0) {
    const m = textContent.match(/(?:ผู้เสียชีวิต|สีดำ|ดำ|black|triage black)\D*?(\d+)/i);
    if (m && m[1]) standardizedCounts.BLACK = Number(m[1]);
  }

  // Check general total casualties
  const totalExplicit = Number(p.casualties ?? p.patients ?? p.totalPatients ?? s.casualties ?? s.patients ?? s.total_casualties ?? s.totalCasualties ?? s.total);
  let totalPatientsFound = !isNaN(totalExplicit) && totalExplicit > 0 ? Math.round(totalExplicit) : 0;
  if (totalPatientsFound === 0) {
    const m = textContent.match(/(?:ผู้บาดเจ็บ|ผู้ป่วย|casualties|patients|จำนวน)\D*?(\d+)\s*(?:ราย|คน)/i);
    if (m && m[1]) totalPatientsFound = Number(m[1]);
  }

  // If total patients found but triage breakdown has 0 across all levels, default to RED (urgent mass casualty protocol)
  const currentSum = standardizedCounts.RED + standardizedCounts.YELLOW + standardizedCounts.GREEN + standardizedCounts.BLACK;
  if (currentSum === 0 && totalPatientsFound > 0) {
    standardizedCounts.RED = totalPatientsFound;
  }

  // 2. ETA Extraction
  let etaMin: number | undefined = undefined;
  const rawEta = p.reportedEtaMin ?? p.etaMinutes ?? p.eta ?? s.reportedEtaMin ?? s.eta_minutes ?? s.eta;
  if (rawEta !== undefined && rawEta !== null && !isNaN(Number(rawEta))) {
    const n = Math.round(Number(rawEta));
    if (n > 0 && n <= 1440) etaMin = n;
  }
  if (etaMin === undefined) {
    const m = textContent.match(/(?:ภายใน|ถึงใน|อีก|ระยะเวลา|eta)\D*?(\d+)\s*(?:นาที|min)/i);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (n > 0 && n <= 1440) etaMin = n;
    }
  }

  // 3. Edits (Kits & Extra Medicines/Antidotes)
  const setKits: Record<string, number> = {};
  const rawKits = (p.kits || p.recommendedKits || s.kits || s.recommendedKits || s.recommended_kits || []) as any[];
  if (Array.isArray(rawKits)) {
    for (const k of rawKits) {
      if (typeof k === 'object' && k) {
        const rawCode = String(k.kitCode || k.code || k.kitName || k.name || '').trim();
        const code = resolveKitCode(rawCode);
        const q = Number(k.estimatedQuantity ?? k.qty ?? k.quantity ?? 1);
        if (code && q > 0) setKits[code] = q;
      }
    }
  }

  const setExtras: Record<string, number> = {};
  const rawAntidotes = (p.antidotes || p.recommendedAntidotes || p.items || s.antidotes || s.recommendedAntidotes || s.recommended_antidotes || []) as any[];
  if (Array.isArray(rawAntidotes)) {
    for (const a of rawAntidotes) {
      if (typeof a === 'object' && a) {
        const id = String(a.drugMasterId || a.id || '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const q = Number(a.qty ?? a.availableQuantity ?? a.quantity ?? 1);
        if (id && isUuid && q > 0) setExtras[id] = q;
      }
    }
  }

  const edits = (Object.keys(setKits).length > 0 || Object.keys(setExtras).length > 0)
    ? { packOverrides: {}, removeKits: [], removeExtras: [], setKits, setExtras }
    : undefined;

  return { standardizedCounts, etaMin, edits };
}

/**
 * Tool: submit_er_action_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for ER authorization.
 * Whitelisted actions: DECLARE_INCIDENT, DISPATCH_EMERGENCY_KITS, REQUEST_URGENT_ANTIDOTE
 * Allowed Roles: ER_STAFF, SYSTEM_ADMIN
 */
export const submitErActionProposalTool: IAgentTool<{
  actionType: 'DECLARE_INCIDENT' | 'UPDATE_INCIDENT' | 'DISPATCH_EMERGENCY_KITS' | 'REQUEST_URGENT_ANTIDOTE';
  title: string;
  description: string;
  summary: Record<string, unknown>;
  targetId?: string;
  payload: Record<string, unknown>;
}> = {
  name: 'submit_er_action_proposal',
  description:
    'Terminal proposal tool creating human-in-the-loop action cards for declaring incidents, updating incidents, approving kit dispatches, or requesting urgent antidotes.',
  parameters: z.object({
    actionType: z
      .enum(['DECLARE_INCIDENT', 'UPDATE_INCIDENT', 'DISPATCH_EMERGENCY_KITS', 'REQUEST_URGENT_ANTIDOTE'])
      .describe('Whitelisted emergency action type'),
    title: z.string().describe('Short title for the emergency proposal'),
    description: z.string().describe('Detailed emergency justification'),
    summary: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object') return parsed;
          } catch {
            // Not valid JSON, split key-values or turn into key: summary
            const obj: Record<string, unknown> = {};
            const parts = val.split(/[;\n,]+/);
            for (const part of parts) {
              const [k, ...v] = part.split(/[:=]/);
              if (k && v.length > 0) {
                const rawVal = v.join(':').trim();
                const num = Number(rawVal);
                obj[k.trim()] = !isNaN(num) && rawVal !== '' ? num : rawVal;
              }
            }
            if (Object.keys(obj).length > 0) return obj;
            return { note: val };
          }
        }
        return val ?? {};
      }, z.record(z.string(), z.unknown()))
      .describe('Key-value summary of casualties, kit counts, or antidotes (e.g. {"casualties": 3, "bloodType": "A Negative"})'),
    targetId: z
      .preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), z.string().uuid().optional())
      .describe('Target incident UUID if linking dispatch or borrow to an incident'),
    payload: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return { raw: val };
          }
        }
        return val ?? {};
      }, z.record(z.string(), z.unknown()))
      .describe('Action-specific payload parameters'),
  }),
  allowedRoles: ['ER_STAFF', 'PHARMACIST', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const hospitalId = context.hospitalId;

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to submit an ER action proposal.',
        };
      }

      const actionDef = ER_PROPOSAL_WHITELIST[args.actionType];
      if (!actionDef) {
        return {
          success: false,
          error: `Action '${args.actionType}' is not in the whitelisted ER actions.`,
        };
      }

      // Resolve effective incidentId (from targetId or payload.incidentId or context.activeId)
      let effectiveIncidentId =
        args.targetId ||
        (typeof args.payload?.incidentId === 'string' ? args.payload.incidentId : undefined) ||
        (typeof context.activeId === 'string' && context.activeId ? (context.activeId as string) : undefined);

      // If effectiveIncidentId is supplied, enforce existence and hospital ownership
      if (effectiveIncidentId) {
        const inc = await query<{ hospital_id: string }>(
          'SELECT hospital_id FROM incident WHERE id = $1',
          [effectiveIncidentId],
        );
        if (inc.rows.length === 0) {
          // If the model passed a non-existent or hallucinated UUID, check context.activeId or running incident
          let fallbackFound = false;
          if (context.activeId && typeof context.activeId === 'string' && context.activeId !== effectiveIncidentId) {
            const actInc = await query<{ hospital_id: string }>(
              'SELECT hospital_id FROM incident WHERE id = $1',
              [context.activeId],
            );
            if (actInc.rows.length > 0) {
              effectiveIncidentId = context.activeId as string;
              fallbackFound = true;
            }
          }
          if (!fallbackFound && hospitalId) {
            const runningInc = (
              await query<{ id: string }>(
                "SELECT id FROM incident WHERE hospital_id = $1 AND status::text = ANY('{OPEN, PLAN_REVIEW, ACTIVE}') ORDER BY created_at DESC LIMIT 1",
                [hospitalId],
              )
            ).rows[0];
            if (runningInc) {
              effectiveIncidentId = runningInc.id;
              fallbackFound = true;
            }
          }
          if (!fallbackFound) {
            return { success: false, error: `Incident '${effectiveIncidentId}' not found.` };
          }
        } else if (!isSystemAdmin && inc.rows[0].hospital_id !== hospitalId) {
          return {
            success: false,
            error: 'Permission denied: Cannot act on incident belonging to another hospital.',
          };
        }
      }

      // Special RBAC constraint: ER_STAFF cannot call standalone /api/v1/borrow-requests (PHARMACIST-only)
      if (args.actionType === 'REQUEST_URGENT_ANTIDOTE' && context.role === 'ER_STAFF' && !effectiveIncidentId) {
        return {
          success: false,
          error:
            'ER_STAFF cannot create standalone borrow requests directly without an active incident. Please declare an emergency incident first (DECLARE_INCIDENT) and retry with the returned incidentId.',
        };
      }

      // Build whitelisted endpoint
      let endpoint: string;
      try {
        endpoint = actionDef.buildEndpoint(effectiveIncidentId);
      } catch (err: any) {
        return {
          success: false,
          error: `Invalid targetId for ${args.actionType}: ${err.message}`,
        };
      }

      // Prepare sanitized and normalized payload
      const rawPayload = (args.payload || {}) as Record<string, unknown>;
      const payloadToValidate: Record<string, unknown> = { ...rawPayload };

      let extractedDetails = {
        standardizedCounts: { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0 },
        etaMin: undefined as number | undefined,
        edits: undefined as any,
      };

      if (args.actionType === 'DECLARE_INCIDENT' || args.actionType === 'UPDATE_INCIDENT') {
        extractedDetails = extractIncidentDetails(args);
        payloadToValidate.counts = extractedDetails.standardizedCounts;
        payloadToValidate.patientCounts = extractedDetails.standardizedCounts;
        if (extractedDetails.etaMin !== undefined && payloadToValidate.reportedEtaMin === undefined) {
          payloadToValidate.reportedEtaMin = extractedDetails.etaMin;
        }
        if (extractedDetails.edits && payloadToValidate.edits === undefined) {
          payloadToValidate.edits = extractedDetails.edits;
        }
      }

      if (args.actionType === 'DECLARE_INCIDENT') {
        if (!payloadToValidate.title && args.title) {
          payloadToValidate.title = args.title;
        }
        if (!payloadToValidate.description && args.description) {
          payloadToValidate.description = args.description;
        }
      }

      if (args.actionType === 'REQUEST_URGENT_ANTIDOTE') {
        if (!payloadToValidate.reason) {
          payloadToValidate.reason = args.description || args.title || 'Emergency antidote/blood borrow request';
        }
        if (effectiveIncidentId && !payloadToValidate.incidentId) {
          payloadToValidate.incidentId = effectiveIncidentId;
        }
      }

      // Validate payload schema
      const parseRes = actionDef.payloadSchema.safeParse(payloadToValidate);
      if (!parseRes.success) {
        return {
          success: false,
          error: `Invalid proposal payload for ${args.actionType}: ${parseRes.error.message}`,
        };
      }

      let actionApiPayload = parseRes.data as Record<string, unknown>;

      if (args.actionType === 'DECLARE_INCIDENT' || args.actionType === 'UPDATE_INCIDENT') {
        const { standardizedCounts, etaMin, edits } = extractedDetails;
        const totalPatients =
          standardizedCounts.RED +
          standardizedCounts.YELLOW +
          standardizedCounts.GREEN +
          standardizedCounts.BLACK;

        // Enrich summary so the card displays all triage numbers, total casualties, and ETA
        args.summary = {
          ...args.summary,
          counts: standardizedCounts,
          patientCounts: standardizedCounts,
          triageCounts: standardizedCounts,
          triage_red: standardizedCounts.RED,
          triage_yellow: standardizedCounts.YELLOW,
          triage_green: standardizedCounts.GREEN,
          triage_black: standardizedCounts.BLACK,
          total_casualties: totalPatients,
          totalCasualties: totalPatients,
          casualties: totalPatients,
          ...(etaMin !== undefined ? { eta_minutes: etaMin, eta: etaMin, reportedEtaMin: etaMin } : {}),
        };

        if (args.actionType === 'DECLARE_INCIDENT') {
          const validated = parseRes.data as Record<string, unknown>;
          const incType =
            (validated.incidentType as string) ||
            (validated.eventType as string) ||
            'MASS_CASUALTY';
          const incTitle =
            (validated.title as string) ||
            args.title ||
            'Emergency Incident';
          const incDesc =
            (validated.description as string) ||
            args.description ||
            incTitle;
          const incLoc =
            (validated.locationText as string) ||
            (validated.location as string) ||
            '';

          actionApiPayload = {
            ...actionApiPayload,
            title: incTitle,
            incidentType: incType,
            eventType: incType,
            description: incDesc,
            locationText: incLoc,
            counts: standardizedCounts,
            patientCounts: standardizedCounts,
            ...(etaMin !== undefined ? { reportedEtaMin: etaMin } : {}),
            ...(edits ? { edits } : {}),
            acknowledgeDuplicate: true,
          };
        } else if (args.actionType === 'UPDATE_INCIDENT') {
          actionApiPayload = {
            ...actionApiPayload,
            counts: standardizedCounts,
            patientCounts: standardizedCounts,
            ...(etaMin !== undefined ? { reportedEtaMin: etaMin } : {}),
            ...(edits ? { edits } : {}),
          };
        }
      }

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
            payload: actionApiPayload,
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to submit ER proposal: ${e.message}`,
      };
    }
  },
};
