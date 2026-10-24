import { z } from 'zod';
import { query } from '../../../../db/client.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';

// --- HELPER TYPES & FUNCTIONS ---

export interface Gs1ParseResult {
  detectedStandard: 'GS1' | 'LOCAL';
  gtin?: string;
  lotNo?: string;
  expiryDate?: string; // YYYY-MM-DD
}

/**
 * Calculates the last day of a given year and month (1-based).
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Converts a 2-digit YY to 4-digit YYYY (e.g. 50-99 -> 1950-1999, 00-49 -> 2000-2049).
 */
function expandYear(yy: number): number {
  return yy >= 50 ? 1900 + yy : 2000 + yy;
}

/**
 * Pure GS1-128 / GS1 DataMatrix / Local barcode parser.
 * Supports:
 * - Parenthesised AI formats: (01)GTIN(17)YYMMDD(10)LOT
 * - Unparenthesised formats: AI 01 (14 digits), AI 17 (6 digits), AI 10 (variable up to 20 chars ending with \x1d or string end)
 * - Leading symbology identifier stripping (e.g., ]C1, ]d2, ]e0)
 * - Day '00' in YYMMDD means the last day of that month
 * - Fallback to LOCAL standard if no valid GS1 pattern matched
 */
export function parseGs1Barcode(raw: string): Gs1ParseResult {
  if (!raw || typeof raw !== 'string') {
    return { detectedStandard: 'LOCAL', lotNo: '' };
  }

  // Strip common GS1 symbology prefixes: ]C1 (GS1-128), ]d2 (GS1 DataMatrix), ]e0 (GS1 QR)
  let cleaned = raw.trim().replace(/^\][A-Za-z0-9]{2}/, '');

  // 1. Try parenthesised AI syntax e.g. (01)08851234567890(17)261231(10)LOT1234
  if (cleaned.includes('(') && cleaned.includes(')')) {
    let gtin: string | undefined;
    let expiryDate: string | undefined;
    let lotNo: string | undefined;

    const aiRegex = /\((\d{2})\)([^\(\)]+)/g;
    let match: RegExpExecArray | null;
    let foundAnyAi = false;

    while ((match = aiRegex.exec(cleaned)) !== null) {
      const ai = match[1];
      const val = match[2].trim();

      if (ai === '01' && /^\d{14}$/.test(val)) {
        gtin = val;
        foundAnyAi = true;
      } else if (ai === '17' && /^\d{6}$/.test(val)) {
        const yy = parseInt(val.slice(0, 2), 10);
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        if (mm >= 1 && mm <= 12) {
          const year = expandYear(yy);
          const day = dd === 0 ? getLastDayOfMonth(year, mm) : dd;
          const monthStr = String(mm).padStart(2, '0');
          const dayStr = String(day).padStart(2, '0');
          expiryDate = `${year}-${monthStr}-${dayStr}`;
          foundAnyAi = true;
        }
      } else if (ai === '10' && val.length > 0) {
        lotNo = val;
        foundAnyAi = true;
      }
    }

    if (foundAnyAi && (gtin || lotNo || expiryDate)) {
      return {
        detectedStandard: 'GS1',
        gtin,
        lotNo,
        expiryDate,
      };
    }
  }

  // 2. Try unparenthesised GS1 stream
  // AIs can be separated by FNC1 (\x1d) or fixed-width boundaries:
  // AI 01: 14 chars fixed
  // AI 17: 6 chars fixed (YYMMDD)
  // AI 10: variable 1-20 chars terminated by \x1d or end of string
  let stream = cleaned;
  let gtin: string | undefined;
  let expiryDate: string | undefined;
  let lotNo: string | undefined;
  let isGs1Stream = false;

  let pos = 0;
  while (pos < stream.length) {
    if (stream.charCodeAt(pos) === 29) { // skip GS delimiter
      pos++;
      continue;
    }

    const ai2 = stream.slice(pos, pos + 2);
    if (ai2 === '01' && pos + 16 <= stream.length && /^\d{14}$/.test(stream.slice(pos + 2, pos + 16))) {
      gtin = stream.slice(pos + 2, pos + 16);
      pos += 16;
      isGs1Stream = true;
    } else if (ai2 === '17' && pos + 8 <= stream.length && /^\d{6}$/.test(stream.slice(pos + 2, pos + 8))) {
      const val = stream.slice(pos + 2, pos + 8);
      const yy = parseInt(val.slice(0, 2), 10);
      const mm = parseInt(val.slice(2, 4), 10);
      const dd = parseInt(val.slice(4, 6), 10);
      if (mm >= 1 && mm <= 12) {
        const year = expandYear(yy);
        const day = dd === 0 ? getLastDayOfMonth(year, mm) : dd;
        const monthStr = String(mm).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        expiryDate = `${year}-${monthStr}-${dayStr}`;
        isGs1Stream = true;
      }
      pos += 8;
    } else if (ai2 === '10' && pos + 2 < stream.length) {
      pos += 2;
      let end = stream.indexOf('\x1d', pos);
      if (end === -1) {
        end = stream.length;
      }
      // AI 10 max length is 20 chars
      const lotLen = Math.min(end - pos, 20);
      lotNo = stream.slice(pos, pos + lotLen);
      pos += lotLen;
      isGs1Stream = true;
      if (end < stream.length && stream[pos] === '\x1d') {
        pos++;
      }
    } else {
      break;
    }
  }

  if (isGs1Stream && (gtin || lotNo || expiryDate)) {
    return {
      detectedStandard: 'GS1',
      gtin,
      lotNo,
      expiryDate,
    };
  }

  // 3. Fallback: treat entire string as local lot number
  return {
    detectedStandard: 'LOCAL',
    lotNo: cleaned,
  };
}

/**
 * Calculates days between today (UTC midnight) and a target date string (YYYY-MM-DD).
 */
function getDaysToExpiry(expiryDateStr: string): number {
  const target = new Date(expiryDateStr);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.ceil((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

// --- TOOL 1: get_fefo_pick_list ---

export const getFefoPickListTool: IAgentTool<{
  hospitalDrugId?: string;
  drugCode?: string;
  quantityNeeded?: number;
  excludeHeld?: boolean;
}> = {
  name: 'get_fefo_pick_list',
  description:
    'Retrieves optimal stock lots for picking ordered by First-Expired, First-Out (FEFO), with greedy allocation against required quantity.',
  parameters: z.object({
    hospitalDrugId: z.string().uuid().optional().describe('UUID of the hospital drug'),
    drugCode: z.string().optional().describe('Local code or name search query for the drug'),
    quantityNeeded: z.number().positive().optional().describe('Target pick quantity needed'),
    excludeHeld: z.boolean().optional().default(true).describe('Exclude held stock from available quantity (default true)'),
  }),
  allowedRoles: ['WAREHOUSE_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for hospital-scoped stock queries.',
        };
      }

      if (!args.hospitalDrugId && (!args.drugCode || !args.drugCode.trim())) {
        return {
          success: false,
          error: 'Either hospitalDrugId or drugCode must be provided.',
        };
      }

      // Enforce ownership if hospitalDrugId is specified
      if (args.hospitalDrugId && hospitalId && !isSystemAdmin) {
        const ownerCheck = await query<{ hospital_id: string }>(
          'SELECT hospital_id FROM hospital_drug WHERE id = $1',
          [args.hospitalDrugId],
        );
        if (ownerCheck.rows.length === 0) {
          return { success: false, error: `Hospital drug '${args.hospitalDrugId}' not found.` };
        }
        if (ownerCheck.rows[0].hospital_id !== hospitalId) {
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
        where.push(`sl.hospital_id = $${params.length}`);
      }

      if (args.hospitalDrugId) {
        params.push(args.hospitalDrugId);
        where.push(`sl.hospital_drug_id = $${params.length}`);
      }

      if (args.drugCode && args.drugCode.trim()) {
        params.push(`%${args.drugCode.trim()}%`);
        const pIdx = params.length;
        where.push(`(hd.local_code ILIKE $${pIdx} OR hd.local_name ILIKE $${pIdx} OR dm.generic_name ILIKE $${pIdx})`);
      }

      // Available stock filter
      const excludeHeld = args.excludeHeld ?? true;
      if (excludeHeld) {
        where.push('(sl.qty_on_hand - sl.qty_held) > 0');
      } else {
        where.push('sl.qty_on_hand > 0');
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT sl.id AS "lotId",
               sl.lot_no AS "lotNo",
               sl.expiry_date::text AS "expiryDate",
               sl.qty_on_hand::float8 AS "qtyOnHand",
               sl.qty_held::float8 AS "qtyHeld",
               sl.manufacturer,
               hd.id AS "hospitalDrugId",
               hd.local_code AS "localCode",
               hd.local_name AS "localName",
               dm.generic_name AS "genericName",
               dm.base_unit AS "baseUnit"
          FROM stock_lot sl
          JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
          JOIN drug_master dm ON dm.id = hd.drug_master_id
         ${whereClause}
         ORDER BY sl.expiry_date ASC, sl.lot_no ASC
      `;

      const res = await query(sql, params);
      const rows = res.rows as Array<{
        lotId: string;
        lotNo: string;
        expiryDate: string;
        qtyOnHand: number;
        qtyHeld: number;
        manufacturer: string | null;
        hospitalDrugId: string;
        localCode: string;
        localName: string;
        genericName: string;
        baseUnit: string;
      }>;

      let remainingToPick = args.quantityNeeded !== undefined ? Math.max(0, args.quantityNeeded) : 0;
      let totalAvailable = 0;
      let totalPicked = 0;

      const lots = rows.map((r) => {
        const qtyOnHand = Number(r.qtyOnHand);
        const qtyHeld = Number(r.qtyHeld);
        const availableQty = Math.max(0, excludeHeld ? qtyOnHand - qtyHeld : qtyOnHand);
        const daysToExpiry = getDaysToExpiry(r.expiryDate);
        const isExpired = daysToExpiry < 0;

        let recommendedPickQty = 0;
        if (!isExpired) {
          totalAvailable += availableQty;
          if (args.quantityNeeded !== undefined && remainingToPick > 0) {
            const pick = Math.min(availableQty, remainingToPick);
            recommendedPickQty = Math.round(pick * 1000) / 1000;
            remainingToPick -= recommendedPickQty;
            totalPicked += recommendedPickQty;
          }
        }

        return {
          lotId: r.lotId,
          lotNo: r.lotNo,
          expiryDate: r.expiryDate,
          daysToExpiry,
          isExpired,
          qtyOnHand,
          qtyHeld,
          availableQty,
          recommendedPickQty,
          manufacturer: r.manufacturer,
          hospitalDrugId: r.hospitalDrugId,
          drugName: r.localName || r.genericName,
          baseUnit: r.baseUnit,
        };
      });

      totalAvailable = Math.round(totalAvailable * 1000) / 1000;
      totalPicked = Math.round(totalPicked * 1000) / 1000;
      const shortfall =
        args.quantityNeeded !== undefined
          ? Math.max(0, Math.round((args.quantityNeeded - totalPicked) * 1000) / 1000)
          : 0;

      return {
        success: true,
        data: {
          quantityNeeded: args.quantityNeeded ?? null,
          totalAvailable,
          totalPicked,
          shortfall,
          lotCount: lots.length,
          lots,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve FEFO pick list: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: check_cold_chain_compliance ---

export const checkColdChainComplianceTool: IAgentTool<{
  taskId?: string;
  temperatureLogs?: Array<{ recordedAt: string; temperatureC: number }>;
  thresholdMin?: number;
  thresholdMax?: number;
}> = {
  name: 'check_cold_chain_compliance',
  description:
    'Evaluates cold chain temperature logs against specified min/max thresholds (default 2.0°C to 8.0°C) and identifies breaches.',
  parameters: z.object({
    taskId: z.string().uuid().optional().describe('Optional transport task UUID to load logged sensor readings'),
    temperatureLogs: z
      .array(
        z.object({
          recordedAt: z.string().describe('ISO timestamp of the temperature reading'),
          temperatureC: z.number().describe('Temperature in degrees Celsius'),
        }),
      )
      .optional()
      .describe('Optional direct temperature readings array'),
    thresholdMin: z.number().optional().default(2.0).describe('Minimum acceptable temperature in Celsius (default 2.0)'),
    thresholdMax: z.number().optional().default(8.0).describe('Maximum acceptable temperature in Celsius (default 8.0)'),
  }),
  allowedRoles: ['WAREHOUSE_OFFICER', 'DRIVER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const minThreshold = args.thresholdMin ?? 2.0;
      const maxThreshold = args.thresholdMax ?? 8.0;

      if (minThreshold >= maxThreshold) {
        return {
          success: false,
          error: `Invalid thresholds: thresholdMin (${minThreshold}) must be strictly less than thresholdMax (${maxThreshold}).`,
        };
      }

      if (!args.taskId && (!args.temperatureLogs || args.temperatureLogs.length === 0)) {
        if (!args.taskId && args.temperatureLogs && args.temperatureLogs.length === 0) {
          // Handled as NO_DATA below
        } else {
          return {
            success: false,
            error: 'Either taskId or temperatureLogs must be provided.',
          };
        }
      }

      let readings: Array<{ recordedAt: string; temperatureC: number }> = [];

      if (args.taskId) {
        const hospitalId = context.hospitalId;
        const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
        const isDriver = context.role === 'DRIVER';

        // Check task existence and tenant permissions
        const taskRes = await query<{
          id: string;
          from_hospital_id: string;
          to_hospital_id: string;
          driver_id: string | null;
        }>(
          'SELECT id, from_hospital_id, to_hospital_id, driver_id FROM transport_task WHERE id = $1',
          [args.taskId],
        );

        if (taskRes.rows.length === 0) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }

        const task = taskRes.rows[0];

        // Tenant ownership check (hide existence on permission failure)
        if (!isSystemAdmin) {
          if (!hospitalId || (task.from_hospital_id !== hospitalId && task.to_hospital_id !== hospitalId)) {
            return { success: false, error: 'Transport task not found or not permitted.' };
          }
          if (isDriver && task.driver_id !== context.userId) {
            return { success: false, error: 'Transport task not found or not permitted.' };
          }
        }

        const eventsRes = await query<{
          captured_at: Date;
          temperature_c: string | number;
        }>(
          `SELECT te.captured_at, te.temperature_c
             FROM transport_event te
             JOIN transport_task tt ON tt.id = te.task_id
            WHERE te.task_id = $1 AND te.temperature_c IS NOT NULL
            ORDER BY te.captured_at ASC, te.seq ASC`,
          [args.taskId],
        );

        readings = eventsRes.rows.map((r) => ({
          recordedAt: new Date(r.captured_at).toISOString(),
          temperatureC: Number(r.temperature_c),
        }));
      } else if (args.temperatureLogs) {
        readings = args.temperatureLogs.map((log) => ({
          recordedAt: log.recordedAt,
          temperatureC: Number(log.temperatureC),
        }));
      }

      if (readings.length === 0) {
        return {
          success: true,
          data: {
            status: 'NO_DATA',
            thresholdMin: minThreshold,
            thresholdMax: maxThreshold,
            min: null,
            max: null,
            avg: null,
            readingCount: 0,
            breachCount: 0,
            breaches: [],
            recommendation: 'No temperature readings recorded for this shipment.',
          },
        };
      }

      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      const breaches: Array<{
        timestamp: string;
        temperature: number;
        direction: 'LOW' | 'HIGH';
        deviation: number;
      }> = [];

      let hasLow = false;
      let hasHigh = false;

      for (const r of readings) {
        const temp = r.temperatureC;
        if (temp < min) min = temp;
        if (temp > max) max = temp;
        sum += temp;

        if (temp < minThreshold) {
          hasLow = true;
          const deviation = Math.round((minThreshold - temp) * 10) / 10;
          breaches.push({
            timestamp: r.recordedAt,
            temperature: temp,
            direction: 'LOW',
            deviation,
          });
        } else if (temp > maxThreshold) {
          hasHigh = true;
          const deviation = Math.round((temp - maxThreshold) * 10) / 10;
          breaches.push({
            timestamp: r.recordedAt,
            temperature: temp,
            direction: 'HIGH',
            deviation,
          });
        }
      }

      const avg = Math.round((sum / readings.length) * 10) / 10;

      // Status rule:
      // If both low and high breaches exist -> BREACH_HIGH (both listed)
      // If only high -> BREACH_HIGH
      // If only low -> BREACH_LOW
      // Else -> COMPLIANT
      let status: 'COMPLIANT' | 'BREACH_LOW' | 'BREACH_HIGH' = 'COMPLIANT';
      let recommendation =
        'Temperature maintained within safe cold chain limits (2°C - 8°C). Drug integrity confirmed.';

      if (hasHigh || (hasHigh && hasLow)) {
        status = 'BREACH_HIGH';
        recommendation =
          'Temperature excursion detected above maximum threshold. Quarantine shipment immediately; do not dispense until pharmacist review.';
      } else if (hasLow) {
        status = 'BREACH_LOW';
        recommendation =
          'Temperature excursion detected below minimum threshold. Quarantine shipment immediately; do not dispense until pharmacist review.';
      }

      return {
        success: true,
        data: {
          status,
          thresholdMin: minThreshold,
          thresholdMax: maxThreshold,
          min,
          max,
          avg,
          readingCount: readings.length,
          breachCount: breaches.length,
          breaches,
          recommendation,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to check cold chain compliance: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: get_kit_packing_checklist ---

/**
 * Readiness Calculation Rule:
 * - READY: All required components have available hospital stock >= required quantity (shortfall is 0 for every component).
 * - PARTIAL: Some components have available stock to meet the need or partial availability, but at least one component has a shortfall > 0, and not all components are at 0 stock.
 * - MISSING_ITEMS: Critical lacking — either all components have 0 available stock, or at least one essential component has completely 0 available stock.
 */
function calculateKitReadiness(components: Array<{ required: number; available: number; shortfall: number }>): 'READY' | 'PARTIAL' | 'MISSING_ITEMS' {
  if (components.length === 0) return 'MISSING_ITEMS';

  const allReady = components.every((c) => c.shortfall === 0);
  if (allReady) return 'READY';

  const anyCompletelyMissing = components.some((c) => c.available <= 0 && c.required > 0);
  if (anyCompletelyMissing) return 'MISSING_ITEMS';

  return 'PARTIAL';
}

export const getKitPackingChecklistTool: IAgentTool<{
  kitTaskId?: string;
  kitTypeId?: string;
  incidentId?: string;
}> = {
  name: 'get_kit_packing_checklist',
  description:
    'Retrieves packing checklist and component FEFO stock availability for an emergency kit pack task or kit type.',
  parameters: z.object({
    kitTaskId: z.string().uuid().optional().describe('UUID of kit_pack_task'),
    kitTypeId: z.string().uuid().optional().describe('UUID of kit_type recipe'),
    incidentId: z.string().uuid().optional().describe('UUID of incident linked to kit pack tasks'),
  }),
  allowedRoles: ['WAREHOUSE_OFFICER', 'ER_STAFF', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for kit packing checklist.',
        };
      }

      if (!args.kitTaskId && !args.kitTypeId && !args.incidentId) {
        return {
          success: false,
          error: 'At least one of kitTaskId, kitTypeId, or incidentId must be provided.',
        };
      }

      interface ResolvedTask {
        taskId: string | null;
        kitTypeId: string;
        targetQty: number;
        code: string;
        name: string;
        needsColdChain: boolean;
      }

      let resolvedTasks: ResolvedTask[] = [];

      if (args.kitTaskId) {
        const params: unknown[] = [args.kitTaskId];
        let where = 'kpt.id = $1';
        if (!isSystemAdmin && hospitalId) {
          params.push(hospitalId);
          where += ` AND kpt.hospital_id = $${params.length}`;
        }

        const taskRes = await query<{
          id: string;
          kit_type_id: string;
          qty: number;
          code: string;
          name: string;
          needs_cold_chain: boolean;
        }>(
          `SELECT kpt.id, kpt.kit_type_id, kpt.qty, kt.code, kt.name, kt.needs_cold_chain
             FROM kit_pack_task kpt
             JOIN kit_type kt ON kt.id = kpt.kit_type_id
            WHERE ${where}`,
          params,
        );

        if (taskRes.rows.length === 0) {
          return { success: false, error: 'Kit pack task not found or not permitted.' };
        }

        resolvedTasks = taskRes.rows.map((r) => ({
          taskId: r.id,
          kitTypeId: r.kit_type_id,
          targetQty: Number(r.qty),
          code: r.code,
          name: r.name,
          needsColdChain: Boolean(r.needs_cold_chain),
        }));
      } else if (args.incidentId) {
        const params: unknown[] = [args.incidentId];
        let where = 'ep.incident_id = $1';
        if (!isSystemAdmin && hospitalId) {
          params.push(hospitalId);
          where += ` AND kpt.hospital_id = $${params.length}`;
        }

        const tasksRes = await query<{
          id: string;
          kit_type_id: string;
          qty: number;
          code: string;
          name: string;
          needs_cold_chain: boolean;
        }>(
          `SELECT kpt.id, kpt.kit_type_id, kpt.qty, kt.code, kt.name, kt.needs_cold_chain
             FROM kit_pack_task kpt
             JOIN emergency_plan ep ON ep.id = kpt.plan_id
             JOIN kit_type kt ON kt.id = kpt.kit_type_id
            WHERE ${where}`,
          params,
        );

        if (tasksRes.rows.length === 0) {
          return { success: false, error: 'No kit pack tasks found for the specified incident and hospital.' };
        }

        resolvedTasks = tasksRes.rows.map((r) => ({
          taskId: r.id,
          kitTypeId: r.kit_type_id,
          targetQty: Number(r.qty),
          code: r.code,
          name: r.name,
          needsColdChain: Boolean(r.needs_cold_chain),
        }));
      } else if (args.kitTypeId) {
        const ktRes = await query<{
          id: string;
          code: string;
          name: string;
          needs_cold_chain: boolean;
        }>(
          'SELECT id, code, name, needs_cold_chain FROM kit_type WHERE id = $1',
          [args.kitTypeId],
        );

        if (ktRes.rows.length === 0) {
          return { success: false, error: `Kit type '${args.kitTypeId}' not found.` };
        }

        resolvedTasks = [
          {
            taskId: null,
            kitTypeId: ktRes.rows[0].id,
            targetQty: 1,
            code: ktRes.rows[0].code,
            name: ktRes.rows[0].name,
            needsColdChain: Boolean(ktRes.rows[0].needs_cold_chain),
          },
        ];
      }

      // Build checklist for each task
      const checklists = [];

      for (const t of resolvedTasks) {
        // Query recipe components
        const compRes = await query<{
          drug_master_id: string;
          qty_per_kit: string | number;
          generic_name: string;
          strength: string | null;
          dosage_form: string | null;
          base_unit: string;
        }>(
          `SELECT kc.drug_master_id, kc.qty_per_kit, dm.generic_name, dm.strength, dm.dosage_form, dm.base_unit
             FROM kit_component kc
             JOIN drug_master dm ON dm.id = kc.drug_master_id
            WHERE kc.kit_type_id = $1
            ORDER BY dm.generic_name ASC`,
          [t.kitTypeId],
        );

        const components = [];

        for (const c of compRes.rows) {
          const qtyPerKit = Number(c.qty_per_kit);
          const required = Math.round(qtyPerKit * t.targetQty * 1000) / 1000;
          const drugName = [c.generic_name, c.strength, c.dosage_form].filter(Boolean).join(' ');

          // Query stock lots for this component in the caller's hospital
          const stockParams: unknown[] = [c.drug_master_id];
          let stockWhere = 'hd.drug_master_id = $1 AND sl.expiry_date >= current_date AND (sl.qty_on_hand - sl.qty_held) > 0';

          if (!isSystemAdmin || hospitalId) {
            stockParams.push(hospitalId);
            stockWhere += ` AND sl.hospital_id = $${stockParams.length}`;
          }

          const lotsRes = await query<{
            id: string;
            lot_no: string;
            expiry_date: string;
            qty_on_hand: string | number;
            qty_held: string | number;
          }>(
            `SELECT sl.id, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.qty_on_hand, sl.qty_held
               FROM stock_lot sl
               JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
              WHERE ${stockWhere}
              ORDER BY sl.expiry_date ASC, sl.lot_no ASC`,
            stockParams,
          );

          let remainingNeeded = required;
          let availableTotal = 0;
          const pickLots = [];

          for (const l of lotsRes.rows) {
            const free = Math.max(0, Number(l.qty_on_hand) - Number(l.qty_held));
            availableTotal += free;
            const pick = Math.min(free, remainingNeeded);
            const recommendedPick = Math.round(pick * 1000) / 1000;
            remainingNeeded = Math.max(0, Math.round((remainingNeeded - recommendedPick) * 1000) / 1000);

            pickLots.push({
              lotId: l.id,
              lotNo: l.lot_no,
              expiryDate: l.expiry_date,
              availableQty: Math.round(free * 1000) / 1000,
              recommendedPickQty: recommendedPick,
            });
          }

          availableTotal = Math.round(availableTotal * 1000) / 1000;
          const shortfall = Math.max(0, Math.round((required - availableTotal) * 1000) / 1000);

          components.push({
            drugMasterId: c.drug_master_id,
            drugName,
            baseUnit: c.base_unit,
            qtyPerKit,
            required,
            available: availableTotal,
            shortfall,
            lots: pickLots,
          });
        }

        const readiness = calculateKitReadiness(components);

        checklists.push({
          kitTaskId: t.taskId,
          kitTypeId: t.kitTypeId,
          code: t.code,
          name: t.name,
          needsColdChain: t.needsColdChain,
          targetQty: t.targetQty,
          readiness,
          components,
        });
      }

      return {
        success: true,
        data: {
          taskCount: checklists.length,
          checklists: checklists.length === 1 ? checklists[0] : checklists,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to get kit packing checklist: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: verify_batch_barcode ---

export const verifyBatchBarcodeTool: IAgentTool<{
  barcode: string;
  hospitalDrugId?: string;
  expectedLotNo?: string;
}> = {
  name: 'verify_batch_barcode',
  description:
    'Parses GS1 / 2D DataMatrix or local barcodes and validates batch lot, expiration, and hospital inventory records.',
  parameters: z.object({
    barcode: z.string().describe('Barcode string (GS1-128, DataMatrix, or local lot number)'),
    hospitalDrugId: z.string().uuid().optional().describe('Optional expected hospital drug UUID to detect drug mismatches'),
    expectedLotNo: z.string().optional().describe('Optional expected lot number to verify against scanned barcode'),
  }),
  allowedRoles: ['WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for barcode verification.',
        };
      }

      const parsed = parseGs1Barcode(args.barcode);
      const scannedLot = parsed.lotNo;

      if (!scannedLot) {
        return {
          success: false,
          error: 'Unable to parse a valid lot number from the provided barcode.',
        };
      }

      // Check expectedLotNo match if provided
      const lotMatchesExpected =
        args.expectedLotNo !== undefined
          ? scannedLot.trim().toLowerCase() === args.expectedLotNo.trim().toLowerCase()
          : null;

      // Query database for lot
      const params: unknown[] = [scannedLot];
      let where = 'sl.lot_no = $1';

      if (!isSystemAdmin || hospitalId) {
        params.push(hospitalId);
        where += ` AND sl.hospital_id = $${params.length}`;
      }

      const lotRes = await query<{
        lot_id: string;
        lot_no: string;
        expiry_date: string;
        qty_on_hand: string | number;
        qty_held: string | number;
        hospital_drug_id: string;
        local_code: string;
        local_name: string;
        generic_name: string;
        base_unit: string;
      }>(
        `SELECT sl.id AS lot_id,
                sl.lot_no,
                sl.expiry_date::text AS expiry_date,
                sl.qty_on_hand,
                sl.qty_held,
                hd.id AS hospital_drug_id,
                hd.local_code,
                hd.local_name,
                dm.generic_name,
                dm.base_unit
           FROM stock_lot sl
           JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
           JOIN drug_master dm ON dm.id = hd.drug_master_id
          WHERE ${where}
          ORDER BY sl.expiry_date ASC`,
        params,
      );

      // Determine matchStatus:
      // 'MATCH_FOUND' | 'LOT_NOT_FOUND' | 'EXPIRED_LOT' | 'DRUG_MISMATCH'
      let matchStatus: 'MATCH_FOUND' | 'LOT_NOT_FOUND' | 'EXPIRED_LOT' | 'DRUG_MISMATCH';
      let matchedRecord = null;
      let expiryMatchesRecord: boolean | null = null;

      if (lotRes.rows.length === 0) {
        matchStatus = 'LOT_NOT_FOUND';
      } else {
        const lots = lotRes.rows;
        // If hospitalDrugId provided, check if any lot matches it
        if (args.hospitalDrugId) {
          const matchingDrugLots = lots.filter((l) => l.hospital_drug_id === args.hospitalDrugId);
          if (matchingDrugLots.length === 0) {
            matchStatus = 'DRUG_MISMATCH';
          } else {
            const first = matchingDrugLots[0];
            const daysToExpiry = getDaysToExpiry(first.expiry_date);
            if (daysToExpiry < 0) {
              matchStatus = 'EXPIRED_LOT';
            } else {
              matchStatus = 'MATCH_FOUND';
            }
            const free = Math.max(0, Number(first.qty_on_hand) - Number(first.qty_held));
            matchedRecord = {
              lotId: first.lot_id,
              hospitalDrugId: first.hospital_drug_id,
              drugName: first.local_name || first.generic_name,
              lotNo: first.lot_no,
              expiryDate: first.expiry_date,
              availableQty: Math.round(free * 1000) / 1000,
              baseUnit: first.base_unit,
            };
            if (parsed.expiryDate) {
              expiryMatchesRecord = parsed.expiryDate === first.expiry_date;
            }
          }
        } else {
          // If multiple different hospital drugs have this lot number
          const uniqueDrugs = new Set(lots.map((l) => l.hospital_drug_id));
          const first = lots[0];
          const daysToExpiry = getDaysToExpiry(first.expiry_date);

          if (daysToExpiry < 0) {
            matchStatus = 'EXPIRED_LOT';
          } else {
            matchStatus = 'MATCH_FOUND';
          }

          if (uniqueDrugs.size === 1) {
            const free = Math.max(0, Number(first.qty_on_hand) - Number(first.qty_held));
            matchedRecord = {
              lotId: first.lot_id,
              hospitalDrugId: first.hospital_drug_id,
              drugName: first.local_name || first.generic_name,
              lotNo: first.lot_no,
              expiryDate: first.expiry_date,
              availableQty: Math.round(free * 1000) / 1000,
              baseUnit: first.base_unit,
            };
            if (parsed.expiryDate) {
              expiryMatchesRecord = parsed.expiryDate === first.expiry_date;
            }
          }
        }
      }

      return {
        success: true,
        data: {
          detectedStandard: parsed.detectedStandard,
          gtin: parsed.gtin ?? null,
          gtinVerified: false, // GTIN column is not stored in DB
          parsedLotNo: parsed.lotNo ?? null,
          parsedExpiryDate: parsed.expiryDate ?? null,
          matchStatus,
          lotMatchesExpected,
          expiryMatchesRecord,
          matchedRecord,
          candidateCount: lotRes.rows.length,
          candidates: lotRes.rows.map((l) => ({
            lotId: l.lot_id,
            hospitalDrugId: l.hospital_drug_id,
            drugName: l.local_name || l.generic_name,
            lotNo: l.lot_no,
            expiryDate: l.expiry_date,
            availableQty: Math.max(0, Number(l.qty_on_hand) - Number(l.qty_held)),
            baseUnit: l.base_unit,
          })),
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to verify batch barcode: ${e.message}`,
      };
    }
  },
};

// --- TOOL 5: submit_warehouse_confirmation_proposal (TERMINAL) ---

const WAREHOUSE_PROPOSAL_WHITELIST = {
  CONFIRM_DISPATCH: {
    endpoint: (id: string) => `/api/v1/transport-tasks/${id}/status`,
    method: 'POST' as const,
    fixedStatus: 'LOADED',
    payloadSchema: z.object({
      version: z.number().int().min(1, 'Version must be at least 1'),
      photoKeys: z.array(z.string()).max(10).optional(),
      temperatureC: z.number().min(-50).max(60).optional(),
      reason: z.string().max(500).optional(),
    }),
  },
  CONFIRM_RECEIPT: {
    endpoint: (id: string) => `/api/v1/transport-tasks/${id}/status`,
    method: 'POST' as const,
    fixedStatus: 'RECEIVED',
    payloadSchema: z.object({
      version: z.number().int().min(1, 'Version must be at least 1'),
      photoKeys: z.array(z.string()).max(10).optional(),
      temperatureC: z.number().min(-50).max(60).optional(),
      qtyReceived: z.number().positive().min(0.001).optional(),
      reason: z.string().max(500).optional(),
    }),
  },
  RECORD_RETURN: {
    endpoint: (id: string) => `/api/v1/return-obligations/${id}/return`,
    method: 'POST' as const,
    fixedStatus: undefined,
    payloadSchema: z.object({
      qty: z.number().positive('Return quantity must be greater than 0').min(0.001),
    }),
  },
  CONFIRM_KIT_PACKED: {
    endpoint: (id: string) => `/api/v1/kit-tasks/${id}/confirm`,
    method: 'POST' as const,
    fixedStatus: undefined,
    payloadSchema: z.object({}).default({}),
  },
} as const;

export const submitWarehouseConfirmationProposalTool: IAgentTool<{
  actionType: 'CONFIRM_DISPATCH' | 'CONFIRM_RECEIPT' | 'RECORD_RETURN' | 'CONFIRM_KIT_PACKED';
  title: string;
  description: string;
  summary: Record<string, unknown>;
  targetId: string;
  payload?: Record<string, unknown>;
}> = {
  name: 'submit_warehouse_confirmation_proposal',
  description:
    'Terminal tool submitting human-in-the-loop action proposals for warehouse dispatch, receipt, return obligation fulfillment, or kit packing confirmation.',
  parameters: z.object({
    actionType: z
      .enum(['CONFIRM_DISPATCH', 'CONFIRM_RECEIPT', 'RECORD_RETURN', 'CONFIRM_KIT_PACKED'])
      .describe('Whitelisted warehouse confirmation action type'),
    title: z.string().describe('Title of the proposed action'),
    description: z.string().describe('Detailed warehouse explanation or rationale'),
    summary: z.record(z.string(), z.unknown()).describe('Key-value summary of proposed metrics'),
    targetId: z.string().uuid().describe('UUID of target transport_task, return_obligation, or kit_pack_task'),
    payload: z.record(z.string(), z.unknown()).optional().default({}).describe('Action-specific payload parameters'),
  }),
  allowedRoles: ['WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to submit a warehouse confirmation proposal.',
        };
      }

      const actionDef = WAREHOUSE_PROPOSAL_WHITELIST[args.actionType];
      if (!actionDef) {
        return {
          success: false,
          error: `Action '${args.actionType}' is not in the whitelisted warehouse actions.`,
        };
      }

      // Enforce hospital ownership and target record existence
      if (args.actionType === 'CONFIRM_DISPATCH' || args.actionType === 'CONFIRM_RECEIPT') {
        const taskRes = await query<{
          id: string;
          from_hospital_id: string;
          to_hospital_id: string;
        }>(
          'SELECT id, from_hospital_id, to_hospital_id FROM transport_task WHERE id = $1',
          [args.targetId],
        );
        if (taskRes.rows.length === 0) {
          return { success: false, error: `Transport task '${args.targetId}' not found.` };
        }
        if (!isSystemAdmin && hospitalId) {
          const t = taskRes.rows[0];
          if (t.from_hospital_id !== hospitalId && t.to_hospital_id !== hospitalId) {
            return {
              success: false,
              error: 'Permission denied: Cannot confirm transport task belonging to another hospital.',
            };
          }
        }
      } else if (args.actionType === 'RECORD_RETURN') {
        const roRes = await query<{
          id: string;
          debtor_hospital_id: string;
          creditor_hospital_id: string;
        }>(
          'SELECT id, debtor_hospital_id, creditor_hospital_id FROM return_obligation WHERE id = $1',
          [args.targetId],
        );
        if (roRes.rows.length === 0) {
          return { success: false, error: `Return obligation '${args.targetId}' not found.` };
        }
        if (!isSystemAdmin && hospitalId) {
          const ro = roRes.rows[0];
          if (ro.debtor_hospital_id !== hospitalId && ro.creditor_hospital_id !== hospitalId) {
            return {
              success: false,
              error: 'Permission denied: Cannot record return for obligation belonging to another hospital.',
            };
          }
        }
      } else if (args.actionType === 'CONFIRM_KIT_PACKED') {
        const kptRes = await query<{
          id: string;
          hospital_id: string;
        }>(
          'SELECT id, hospital_id FROM kit_pack_task WHERE id = $1',
          [args.targetId],
        );
        if (kptRes.rows.length === 0) {
          return { success: false, error: `Kit pack task '${args.targetId}' not found.` };
        }
        if (!isSystemAdmin && hospitalId) {
          if (kptRes.rows[0].hospital_id !== hospitalId) {
            return {
              success: false,
              error: 'Permission denied: Cannot confirm kit task belonging to another hospital.',
            };
          }
        }
      }

      // Validate payload with the strict schema for this action
      const rawPayload = args.payload || {};
      const parseRes = actionDef.payloadSchema.safeParse(rawPayload);
      if (!parseRes.success) {
        return {
          success: false,
          error: `Invalid proposal payload for ${args.actionType}: ${parseRes.error.message}`,
        };
      }

      // Build sanitized payload and inject fixed toStatus if applicable
      const sanitizedPayload: Record<string, unknown> = {
        ...(parseRes.data as Record<string, unknown>),
      };
      if (actionDef.fixedStatus) {
        sanitizedPayload.toStatus = actionDef.fixedStatus;
      }

      const proposal: ToolProposalPayload = {
        type: args.actionType,
        title: args.title,
        description: args.description,
        summary: {
          ...args.summary,
          requestedBy: context.userId || 'current-user',
          hospitalId: hospitalId || 'global',
        },
        actionApi: {
          endpoint: actionDef.endpoint(args.targetId),
          method: actionDef.method,
          payload: sanitizedPayload,
        },
      };

      return {
        success: true,
        proposal,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to submit warehouse confirmation proposal: ${e.message}`,
      };
    }
  },
};

export const warehouseTools = [
  getFefoPickListTool,
  checkColdChainComplianceTool,
  getKitPackingChecklistTool,
  verifyBatchBarcodeTool,
  submitWarehouseConfirmationProposalTool,
] as const;
