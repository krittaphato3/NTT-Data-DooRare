import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../../../../db/client.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import { COLD_CHAIN_WARNING_MAX_TEMP, isPromptInjection } from './logistics.utils.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;

export interface CargoLine {
  drugMasterId: string | null;
  drugName: string | null;
  baseUnit: string | null;
  coldChain: boolean;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
}

/**
 * Loads cargo lines (drug / lot / qty / cold-chain flag) for a transport_task.
 * Adapts query logic from transport.repository.ts linesFor.
 */
export async function loadTaskCargo(refType: string, refId: string): Promise<CargoLine[]> {
  if (refType === 'BORROW_LEG') {
    const res = await query<{
      drug_master_id: string | null;
      drug_name: string | null;
      base_unit: string | null;
      cold_chain: boolean | null;
      lot_no: string | null;
      expiry_date: string | null;
      qty: string | number;
    }>(
      `SELECT dm.id AS drug_master_id,
              COALESCE(${DRUG_NAME}, kt.name) AS drug_name,
              COALESCE(dm.base_unit, 'ชุด') AS base_unit,
              COALESCE(dm.is_cold_chain, kt.needs_cold_chain, false) AS cold_chain,
              sl.lot_no, sl.expiry_date::text AS expiry_date,
              COALESCE(x.qty, bl.qty_received, bl.qty_accepted, bl.qty_asked) AS qty
         FROM borrow_leg bl
         LEFT JOIN borrow_request_item i
                ON i.id = COALESCE(bl.request_item_id, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = bl.request_id))
         LEFT JOIN drug_master dm ON dm.id = i.drug_master_id
         LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
         LEFT JOIN borrow_leg_lot x ON x.leg_id = bl.id
         LEFT JOIN stock_lot sl ON sl.id = x.lot_id
        WHERE bl.id = $1
        ORDER BY sl.expiry_date NULLS LAST, sl.lot_no`,
      [refId],
    );

    return res.rows.map((r) => ({
      drugMasterId: r.drug_master_id ?? null,
      drugName: r.drug_name ?? null,
      baseUnit: r.base_unit ?? null,
      coldChain: Boolean(r.cold_chain),
      lotNo: r.lot_no ?? null,
      expiryDate: r.expiry_date ?? null,
      qty: Number(r.qty),
    }));
  }

  if (refType === 'ALLOCATION_LINE') {
    const res = await query<{
      drug_master_id: string | null;
      drug_name: string | null;
      base_unit: string | null;
      cold_chain: boolean | null;
      lot_no: string | null;
      expiry_date: string | null;
      qty: string | number;
    }>(
      `SELECT dm.id AS drug_master_id,
              ${DRUG_NAME} AS drug_name,
              dm.base_unit,
              dm.is_cold_chain AS cold_chain,
              sl.lot_no, sl.expiry_date::text AS expiry_date,
              al.qty
         FROM allocation_line al
         JOIN allocation_plan ap ON ap.id = al.plan_id
         JOIN pool_entry pe ON pe.id = ap.pool_entry_id
         JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
         JOIN stock_lot sl ON sl.id = ne.lot_id
         JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
         JOIN drug_master dm ON dm.id = hd.drug_master_id
        WHERE al.id = $1`,
      [refId],
    );

    return res.rows.map((r) => ({
      drugMasterId: r.drug_master_id ?? null,
      drugName: r.drug_name ?? null,
      baseUnit: r.base_unit ?? null,
      coldChain: Boolean(r.cold_chain),
      lotNo: r.lot_no ?? null,
      expiryDate: r.expiry_date ?? null,
      qty: Number(r.qty),
    }));
  }

  return [];
}

// --- TOOL 1: get_assigned_trip_manifest ---

export const getAssignedTripManifestTool: IAgentTool<{
  taskId?: string;
  status?: 'ACTIVE' | 'WAITING_DISPATCH' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'ALL';
}> = {
  name: 'get_assigned_trip_manifest',
  description:
    'Retrieves assigned transport trips, cargo lines, vehicle cold-box status, hospital contact details, and distance estimates for a driver or warehouse officer.',
  parameters: z.object({
    taskId: z.string().uuid().optional().describe('Optional specific transport task UUID to view'),
    status: z
      .enum(['ACTIVE', 'WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'ALL'])
      .optional()
      .default('ACTIVE')
      .describe('Filter by trip status (default ACTIVE = WAITING_DISPATCH, LOADED, IN_TRANSIT, ARRIVED)'),
  }),
  allowedRoles: ['DRIVER', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const isDriver = context.role === 'DRIVER';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for trip manifest queries.',
        };
      }

      const params: unknown[] = [];
      const where: string[] = [];

      // Tenant & Driver isolation
      if (isDriver) {
        params.push(context.userId);
        where.push(`tt.driver_id = $${params.length}`);
      }

      if (!isSystemAdmin && hospitalId) {
        params.push(hospitalId);
        const pIdx = params.length;
        where.push(`(tt.from_hospital_id = $${pIdx} OR tt.to_hospital_id = $${pIdx})`);
      }

      if (args.taskId) {
        params.push(args.taskId);
        where.push(`tt.id = $${params.length}`);
      }

      // Status filter
      const filterStatus = args.status ?? 'ACTIVE';
      if (filterStatus === 'ACTIVE') {
        where.push(`tt.status IN ('WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED')`);
      } else if (filterStatus !== 'ALL') {
        params.push(filterStatus);
        where.push(`tt.status = $${params.length}`);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT tt.id AS "taskId",
               tt.task_no AS "taskNo",
               tt.ref_type AS "refType",
               tt.ref_id AS "refId",
               tt.status::text AS "status",
               tt.version,
               tt.driver_id AS "driverId",
               dr.display_name AS "driverName",
               tt.vehicle_id AS "vehicleId",
               v.plate AS "vehiclePlate",
               v.has_cold_box AS "hasColdBox",
               tt.eta_at AS "etaAt",
               tt.created_at AS "createdAt",
               tt.loaded_at AS "loadedAt",
               tt.departed_at AS "departedAt",
               tt.arrived_at AS "arrivedAt",
               tt.received_at AS "receivedAt",
               fh.id AS "originHospitalId",
               fh.code AS "originCode",
               fh.name_th AS "originNameTh",
               fh.name_en AS "originNameEn",
               fh.phone AS "originPhone",
               fh.address AS "originAddress",
               fh.province AS "originProvince",
               th.id AS "destHospitalId",
               th.code AS "destCode",
               th.name_th AS "destNameTh",
               th.name_en AS "destNameEn",
               th.phone AS "destPhone",
               th.address AS "destAddress",
               th.province AS "destProvince",
               hd.distance_km AS "distanceKm",
               COALESCE(hd.travel_minutes_override, hd.travel_minutes)::float8 AS "travelMinutes"
          FROM transport_task tt
          JOIN hospital fh ON fh.id = tt.from_hospital_id
          JOIN hospital th ON th.id = tt.to_hospital_id
          LEFT JOIN app_user dr ON dr.id = tt.driver_id
          LEFT JOIN vehicle v ON v.id = tt.vehicle_id
          LEFT JOIN hospital_distance hd ON hd.from_hospital_id = tt.from_hospital_id AND hd.to_hospital_id = tt.to_hospital_id
         ${whereClause}
         ORDER BY tt.created_at DESC
         LIMIT 20
      `;

      const res = await query(sql, params);
      const rows = res.rows as Array<{
        taskId: string;
        taskNo: string;
        refType: string;
        refId: string;
        status: string;
        version: number;
        driverId: string | null;
        driverName: string | null;
        vehicleId: string | null;
        vehiclePlate: string | null;
        hasColdBox: boolean | null;
        etaAt: Date | null;
        createdAt: Date;
        loadedAt: Date | null;
        departedAt: Date | null;
        arrivedAt: Date | null;
        receivedAt: Date | null;
        originHospitalId: string;
        originCode: string;
        originNameTh: string;
        originNameEn: string | null;
        originPhone: string | null;
        originAddress: string | null;
        originProvince: string | null;
        destHospitalId: string;
        destCode: string;
        destNameTh: string;
        destNameEn: string | null;
        destPhone: string | null;
        destAddress: string | null;
        destProvince: string | null;
        distanceKm: string | number | null;
        travelMinutes: string | number | null;
      }>;

      if (args.taskId && rows.length === 0) {
        return {
          success: false,
          error: 'Transport task not found or not permitted.',
        };
      }

      const tasks = [];
      for (const r of rows) {
        const cargo = await loadTaskCargo(r.refType, r.refId);
        const coldChainRequired = cargo.some((c) => c.coldChain);
        const vehicleHasColdBox = Boolean(r.hasColdBox);
        const coldBoxWarning =
          coldChainRequired && !vehicleHasColdBox
            ? 'WARNING: Cold-chain cargo assigned to vehicle without cold box!'
            : null;

        tasks.push({
          taskId: r.taskId,
          taskNo: r.taskNo,
          status: r.status,
          version: r.version,
          origin: {
            hospitalId: r.originHospitalId,
            code: r.originCode,
            nameTh: r.originNameTh,
            nameEn: r.originNameEn,
            phone: r.originPhone,
            address: r.originAddress,
            province: r.originProvince,
          },
          destination: {
            hospitalId: r.destHospitalId,
            code: r.destCode,
            nameTh: r.destNameTh,
            nameEn: r.destNameEn,
            phone: r.destPhone,
            address: r.destAddress,
            province: r.destProvince,
          },
          vehicle: {
            id: r.vehicleId,
            plate: r.vehiclePlate,
            hasColdBox: vehicleHasColdBox,
          },
          driver: {
            id: r.driverId,
            name: r.driverName,
          },
          timestamps: {
            eta: r.etaAt ? new Date(r.etaAt).toISOString() : null,
            created: new Date(r.createdAt).toISOString(),
            loaded: r.loadedAt ? new Date(r.loadedAt).toISOString() : null,
            departed: r.departedAt ? new Date(r.departedAt).toISOString() : null,
            arrived: r.arrivedAt ? new Date(r.arrivedAt).toISOString() : null,
            received: r.receivedAt ? new Date(r.receivedAt).toISOString() : null,
          },
          routeMetrics: {
            distanceKm: r.distanceKm !== null ? Number(r.distanceKm) : null,
            travelMinutes: r.travelMinutes !== null ? Number(r.travelMinutes) : null,
          },
          cargo,
          coldChainRequired,
          coldBoxWarning,
        });
      }

      return {
        success: true,
        data: {
          count: tasks.length,
          tasks,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve trip manifest: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: report_traffic_delay_voice ---

/**
 * Extracts delay minutes from bilingual voice reports (Thai / English).
 */
function parseDelayMinutes(text: string): number | null {
  // 1. Hour and a half: "ชั่วโมงครึ่ง", "hour and a half", "1.5 ชั่วโมง", "1.5 hours"
  if (/ชั่วโมงครึ่ง|hour\s+and\s+a\s+half|1\.5\s*(?:hours|hour|ชั่วโมง)/i.test(text)) {
    return 90;
  }

  // 2. Half hour: "ครึ่งชั่วโมง", "half an hour", "half a hour", "half hour"
  if (/ครึ่งชั่วโมง|half\s+(?:an?\s+)?hour/i.test(text)) {
    return 30;
  }

  // 3. Combined hours + minutes e.g. "1 ชั่วโมง 20 นาที", "1 hr 20 mins"
  const hrMinMatch = text.match(/(\d+)\s*(?:ชั่วโมง|hours?|hrs?)\s*(\d+)\s*(?:นาที|minutes?|mins?)/i);
  if (hrMinMatch) {
    const h = parseInt(hrMinMatch[1], 10);
    const m = parseInt(hrMinMatch[2], 10);
    return h * 60 + m;
  }

  // 4. Standalone hours e.g. "2 ชั่วโมง", "2 hours", "1 hr"
  const hrMatch = text.match(/(\d+)\s*(?:ชั่วโมง|hours?|hrs?)/i);
  if (hrMatch) {
    const h = parseInt(hrMatch[1], 10);
    return h * 60;
  }

  // 5. Standalone minutes e.g. "45 นาที", "45 mins", "30 minutes"
  const minMatch = text.match(/(\d+)\s*(?:นาที|minutes?|mins?)/i);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  return null;
}

/**
 * Classifies traffic delay reasons into standard categories.
 */
function categorizeDelay(text: string): 'TRAFFIC_CONGESTION' | 'ACCIDENT' | 'WEATHER_FLOOD' | 'VEHICLE_BREAKDOWN' | 'OTHER' {
  if (/อุบัติเหตุ|ชน|accident|crash|collision/i.test(text)) {
    return 'ACCIDENT';
  }
  if (/น้ำท่วม|ฝนตก|ฝนหนัก|พายุ|ดินถล่ม|flood|heavy\s+rain|storm|weather/i.test(text)) {
    return 'WEATHER_FLOOD';
  }
  if (/รถเสีย|ยางแตก|ยางแบน|เครื่องดับ|ความเย็นเสีย|ระบบทำความเย็น|cooler|breakdown|flat\s+tire|engine|mechanical/i.test(text)) {
    return 'VEHICLE_BREAKDOWN';
  }
  if (/รถติด|ติดขัด|จราจร|การจราจร|traffic|jam|congestion|gridlock/i.test(text)) {
    return 'TRAFFIC_CONGESTION';
  }
  return 'OTHER';
}

export const reportTrafficDelayVoiceTool: IAgentTool<{
  delayReport: string;
  taskId?: string;
  currentEta?: string;
}> = {
  name: 'report_traffic_delay_voice',
  description:
    'Parses spoken or unstructured driver delay reports, calculates revised ETA, categorizes delay reasons, and identifies prompt injection attempts.',
  parameters: z.object({
    delayReport: z.string().min(1).max(1000).describe('Spoken or typed delay description (Thai or English)'),
    taskId: z.string().uuid().optional().describe('Optional transport task UUID to pull current ETA and cold-chain status'),
    currentEta: z.string().optional().describe('Optional current ETA ISO string to calculate revised ETA from'),
  }),
  allowedRoles: ['DRIVER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const isDriver = context.role === 'DRIVER';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for delay reporting.',
        };
      }

      // Check prompt injection (G-09 defense)
      const injectionSuspected = isPromptInjection(args.delayReport);
      const flags: string[] = [];
      if (injectionSuspected) {
        flags.push('PROMPT_INJECTION_SUSPECTED');
      }

      // Parse delay minutes & category
      const delayMinutes = parseDelayMinutes(args.delayReport);
      const category = categorizeDelay(args.delayReport);

      // Severity classification
      let severity: 'MINOR' | 'MODERATE' | 'SEVERE' = 'MINOR';
      if (delayMinutes !== null) {
        if (delayMinutes > 60) {
          severity = 'SEVERE';
        } else if (delayMinutes > 15) {
          severity = 'MODERATE';
        }
      }

      // If injection suspected: NEVER echo raw text. Output [REDACTED_SUSPECTED_INJECTION].
      const reason = injectionSuspected
        ? '[REDACTED_SUSPECTED_INJECTION]'
        : args.delayReport.trim().slice(0, 120);

      const needsConfirmation = injectionSuspected || delayMinutes === null || severity === 'SEVERE';
      const confidence: 'LOW' | 'HIGH' = injectionSuspected || delayMinutes === null ? 'LOW' : 'HIGH';

      // Resolve base ETA and revised ETA
      let baseEta: Date | null = null;
      let isColdChainTrip = false;

      if (args.currentEta) {
        const parsedCurrent = new Date(args.currentEta);
        if (!Number.isNaN(parsedCurrent.getTime())) {
          baseEta = parsedCurrent;
        }
      }

      if (args.taskId) {
        const taskRes = await query<{
          id: string;
          from_hospital_id: string;
          to_hospital_id: string;
          driver_id: string | null;
          eta_at: Date | null;
          ref_type: string;
          ref_id: string;
        }>(
          `SELECT id, from_hospital_id, to_hospital_id, driver_id, eta_at, ref_type, ref_id
             FROM transport_task
            WHERE id = $1`,
          [args.taskId],
        );

        if (taskRes.rows.length === 0) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }

        const task = taskRes.rows[0];

        // Tenant ownership check
        if (!isSystemAdmin) {
          if (!hospitalId || (task.from_hospital_id !== hospitalId && task.to_hospital_id !== hospitalId)) {
            return { success: false, error: 'Transport task not found or not permitted.' };
          }
          if (isDriver && task.driver_id !== context.userId) {
            return { success: false, error: 'Transport task not found or not permitted.' };
          }
        }

        if (!baseEta && task.eta_at) {
          baseEta = new Date(task.eta_at);
        }

        const cargo = await loadTaskCargo(task.ref_type, task.ref_id);
        isColdChainTrip = cargo.some((c) => c.coldChain);
      }

      const revisedEta =
        baseEta && delayMinutes !== null
          ? new Date(baseEta.getTime() + delayMinutes * 60 * 1000).toISOString()
          : null;

      let coldChainWarningNote: string | null = null;
      if (delayMinutes !== null && delayMinutes > 60 && isColdChainTrip) {
        coldChainWarningNote =
          'Check cooler temperature immediately. With delay exceeding 60 minutes, cold chain stability may be at risk.';
      }

      return {
        success: true,
        data: {
          delayMinutes,
          reason,
          category,
          baseEta: baseEta ? baseEta.toISOString() : null,
          revisedEta,
          severity,
          needsConfirmation,
          injectionSuspected,
          flags,
          confidence,
          coldChainWarningNote,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to process traffic delay report: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: log_transit_temperature_alert ---

export const logTransitTemperatureAlertTool: IAgentTool<{
  taskId: string;
  temperatureC: number;
  measuredAt?: string;
  locationDescription?: string;
}> = {
  name: 'log_transit_temperature_alert',
  description:
    'Evaluates in-transit temperature measurement against cold chain limits and provides immediate driver guidance.',
  parameters: z.object({
    taskId: z.string().uuid().describe('UUID of transport task'),
    temperatureC: z.number().describe('Current temperature reading in Celsius'),
    measuredAt: z.string().optional().describe('ISO timestamp of measurement'),
    locationDescription: z.string().max(200).optional().describe('Current transit location description'),
  }),
  allowedRoles: ['DRIVER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const isDriver = context.role === 'DRIVER';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required for temperature monitoring.',
        };
      }

      const taskRes = await query<{
        id: string;
        from_hospital_id: string;
        to_hospital_id: string;
        driver_id: string | null;
        vehicle_id: string | null;
        ref_type: string;
        ref_id: string;
        has_cold_box: boolean | null;
      }>(
        `SELECT tt.id, tt.from_hospital_id, tt.to_hospital_id, tt.driver_id, tt.vehicle_id,
                tt.ref_type, tt.ref_id, v.has_cold_box
           FROM transport_task tt
           LEFT JOIN vehicle v ON v.id = tt.vehicle_id
          WHERE tt.id = $1`,
        [args.taskId],
      );

      if (taskRes.rows.length === 0) {
        return { success: false, error: 'Transport task not found or not permitted.' };
      }

      const task = taskRes.rows[0];

      if (!isSystemAdmin) {
        if (!hospitalId || (task.from_hospital_id !== hospitalId && task.to_hospital_id !== hospitalId)) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }
        if (isDriver && task.driver_id !== context.userId) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }
      }

      const cargo = await loadTaskCargo(task.ref_type, task.ref_id);
      const coldChainRequired = cargo.some((c) => c.coldChain);
      const hasColdBox = Boolean(task.has_cold_box);

      const temp = args.temperatureC;
      let status: 'NORMAL' | 'WARNING_HIGH' | 'CRITICAL_HIGH' | 'CRITICAL_FREEZE';
      let deltaFromRange = 0;
      let driverGuidance = '';

      if (temp < 2.0) {
        status = 'CRITICAL_FREEZE';
        deltaFromRange = Math.round((2.0 - temp) * 10) / 10;
        driverGuidance =
          'CRITICAL FREEZE EXCURSION! Keep drugs away from direct contact with ice packs. Insert bubble wrap/insulating divider immediately. Do not allow biological products to freeze.';
      } else if (temp <= 8.0) {
        status = 'NORMAL';
        deltaFromRange = 0;
        driverGuidance =
          'Temperature is within the optimal 2.0°C - 8.0°C range. Maintain cooler box closed and continue trip.';
      } else if (temp <= COLD_CHAIN_WARNING_MAX_TEMP) {
        status = 'WARNING_HIGH';
        deltaFromRange = Math.round((temp - 8.0) * 10) / 10;
        driverGuidance =
          'Temperature slightly elevated. Verify cooler lid seal, avoid reopening box, and notify dispatch. Consider checking ice packs upon next stop.';
      } else {
        status = 'CRITICAL_HIGH';
        deltaFromRange = Math.round((temp - 8.0) * 10) / 10;
        driverGuidance =
          'CRITICAL HIGH EXCURSION (>10°C)! Do not dispense or deliver without pharmacist review. Call warehouse officer immediately and locate nearest accredited refuge hospital using find_emergency_cold_storage_refuge.';
      }

      return {
        success: true,
        data: {
          taskId: args.taskId,
          temperatureC: temp,
          status,
          deltaFromRange,
          coldChainRequired,
          hasColdBox,
          driverGuidance,
          recordingHint:
            'This reading can be officially recorded to the task transit event log by calling submit_driver_status_proposal with actionType LOG_TRANSIT_EVENT.',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to log transit temperature alert: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: find_emergency_cold_storage_refuge ---

export const findEmergencyColdStorageRefugeTool: IAgentTool<{
  currentHospitalId?: string;
  currentLat?: number;
  currentLng?: number;
  maxRadiusKm?: number;
}> = {
  name: 'find_emergency_cold_storage_refuge',
  description:
    'Locates nearest network hospitals equipped with cold chain storage to act as emergency fridge refuge during cooler breakdowns or severe transit delays.',
  parameters: z.object({
    currentHospitalId: z
      .string()
      .uuid()
      .optional()
      .describe('Origin hospital UUID (used by SYSTEM_ADMIN only; ignored for non-admin callers)'),
    currentLat: z.number().optional().describe('Current latitude (informational; GPS not yet supported)'),
    currentLng: z.number().optional().describe('Current longitude (informational; GPS not yet supported)'),
    maxRadiusKm: z.number().optional().default(50).describe('Search radius in kilometers (default 50, max 500)'),
  }),
  allowedRoles: ['DRIVER', 'WAREHOUSE_OFFICER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      let callerHospitalId: string | null = null;

      if (isSystemAdmin) {
        callerHospitalId = args.currentHospitalId ?? (context.hospitalId as string | null);
        if (!callerHospitalId) {
          return {
            success: false,
            error: 'currentHospitalId is required for SYSTEM_ADMIN when no context hospitalId is present.',
          };
        }
      } else {
        callerHospitalId = (context.hospitalId as string | null) ?? null;
        if (!callerHospitalId) {
          return {
            success: false,
            error: 'Context hospitalId is required to find refuge hospitals.',
          };
        }
      }

      const maxRadius = Math.min(500, Math.max(1, args.maxRadiusKm ?? 50));

      const sql = `
        SELECT h.id,
               h.name_th,
               h.name_en,
               h.phone AS "generalPhone",
               h.address,
               h.has_cold_chain AS "hasColdChain",
               h.province,
               hd.distance_km AS "distanceKm",
               COALESCE(hd.travel_minutes_override, hd.travel_minutes)::float8 AS "travelMinutes"
          FROM hospital h
          JOIN hospital_distance hd ON hd.to_hospital_id = h.id AND hd.from_hospital_id = $1
         WHERE h.id <> $1
           AND h.network_id = (SELECT network_id FROM hospital WHERE id = $1)
           AND h.active = true
           AND h.has_cold_chain = true
           AND hd.distance_km <= $2
         ORDER BY hd.distance_km ASC
         LIMIT 10
      `;

      const res = await query(sql, [callerHospitalId, maxRadius]);
      const rows = res.rows as Array<{
        id: string;
        name_th: string;
        name_en: string | null;
        generalPhone: string | null;
        address: string | null;
        hasColdChain: boolean;
        province: string | null;
        distanceKm: string | number;
        travelMinutes: string | number | null;
      }>;

      const gpsNotice =
        args.currentLat !== undefined || args.currentLng !== undefined
          ? 'GPS-based lookup is not supported yet; distance resolved using network distance matrix.'
          : null;

      const hospitals = rows.map((r) => ({
        hospitalId: r.id,
        nameTh: r.name_th,
        nameEn: r.name_en,
        generalPhone: r.generalPhone,
        phoneNotice: 'Hospital general telephone number; confirm fridge reception upon calling.',
        address: r.address,
        province: r.province,
        hasColdChain: Boolean(r.hasColdChain),
        distanceKm: Number(r.distanceKm),
        travelMinutes: r.travelMinutes !== null ? Number(r.travelMinutes) : null,
      }));

      return {
        success: true,
        data: {
          callerHospitalId,
          maxRadiusKm: maxRadius,
          count: hospitals.length,
          gpsNotice,
          hospitals,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to find emergency cold storage refuge: ${e.message}`,
      };
    }
  },
};

// --- TOOL 5: submit_driver_status_proposal (TERMINAL) ---

const DRIVER_PROPOSAL_WHITELIST = {
  DEPART_TRIP: {
    endpoint: (taskId: string) => `/api/v1/transport-tasks/${taskId}/status`,
    method: 'POST' as const,
    fixedStatus: 'IN_TRANSIT',
    payloadSchema: z.object({
      version: z.number().int().min(1, 'Task version is required'),
      photoKeys: z.array(z.string()).max(10).optional(),
      temperatureC: z.number().min(-50).max(60).optional(),
      reason: z.string().max(500).optional(),
    }),
  },
  ARRIVE_DESTINATION: {
    endpoint: (taskId: string) => `/api/v1/transport-tasks/${taskId}/status`,
    method: 'POST' as const,
    fixedStatus: 'ARRIVED',
    payloadSchema: z.object({
      version: z.number().int().min(1, 'Task version is required'),
      photoKeys: z.array(z.string()).max(10).optional(),
      temperatureC: z.number().min(-50).max(60).optional(),
      reason: z.string().max(500).optional(),
    }),
  },
  LOG_TRANSIT_EVENT: {
    endpoint: (taskId: string) => `/api/v1/transport-tasks/${taskId}/events:sync`,
    method: 'POST' as const,
    fixedStatus: undefined,
    // Schema accepts either direct `events: [...]` array or single event fields to normalize into events array
    payloadSchema: z.object({
      events: z
        .array(
          z.object({
            clientEventId: z.string().uuid(),
            seq: z.number().int().min(0),
            toStatus: z.enum(['LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED']),
            capturedAt: z.string(),
            photoKeys: z.array(z.string()).max(10).optional(),
            temperatureC: z.number().min(-50).max(60).optional(),
          }),
        )
        .min(1)
        .max(200)
        .optional(),
      // Direct single event fields supported for ergonomic LLM calls:
      clientEventId: z.string().uuid().optional(),
      seq: z.number().int().min(0).optional(),
      toStatus: z.enum(['LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED']).optional(),
      capturedAt: z.string().optional(),
      photoKeys: z.array(z.string()).max(10).optional(),
      temperatureC: z.number().min(-50).max(60).optional(),
    }),
  },
} as const;

export const submitDriverStatusProposalTool: IAgentTool<{
  actionType: 'DEPART_TRIP' | 'ARRIVE_DESTINATION' | 'UPDATE_ETA' | 'LOG_TRANSIT_EVENT';
  taskId: string;
  title: string;
  description: string;
  summary: Record<string, unknown>;
  payload?: Record<string, unknown>;
}> = {
  name: 'submit_driver_status_proposal',
  description:
    'Terminal tool submitting human-in-the-loop action proposals for driver trip status departures, arrivals, or offline transit event logging.',
  parameters: z.object({
    actionType: z
      .enum(['DEPART_TRIP', 'ARRIVE_DESTINATION', 'UPDATE_ETA', 'LOG_TRANSIT_EVENT'])
      .describe('Whitelisted driver action type'),
    taskId: z.string().uuid().describe('Target transport_task UUID'),
    title: z.string().describe('Title of the proposed action'),
    description: z.string().describe('Detailed trip status rationale'),
    summary: z.record(z.string(), z.unknown()).describe('Key-value summary of proposed metrics'),
    payload: z.record(z.string(), z.unknown()).optional().default({}).describe('Action-specific payload parameters'),
  }),
  allowedRoles: ['DRIVER', 'SYSTEM_ADMIN'],
  execute: async (args, context: RequestContext): Promise<ToolResult> => {
    try {
      const hospitalId = context.hospitalId;
      const isSystemAdmin = context.role === 'SYSTEM_ADMIN';
      const isDriver = context.role === 'DRIVER';

      if (!hospitalId && !isSystemAdmin) {
        return {
          success: false,
          error: 'Context hospitalId is required to submit a driver status proposal.',
        };
      }

      // Check task existence and permissions
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

      if (!isSystemAdmin) {
        if (!hospitalId || (task.from_hospital_id !== hospitalId && task.to_hospital_id !== hospitalId)) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }
        if (isDriver && task.driver_id !== context.userId) {
          return { success: false, error: 'Transport task not found or not permitted.' };
        }
      }

      // Special handling for UPDATE_ETA:
      // The backend has no endpoint that updates ETA without a state transition.
      // Therefore, UPDATE_ETA is DRAFT_ONLY without an executable actionApi proposal card.
      if (args.actionType === 'UPDATE_ETA') {
        return {
          success: true,
          data: {
            status: 'DRAFT_ONLY',
            executable: false,
            note: 'No backend endpoint updates ETA without a status change; share the revised ETA with dispatch manually.',
          },
        };
      }

      const actionDef = DRIVER_PROPOSAL_WHITELIST[args.actionType];
      if (!actionDef) {
        return {
          success: false,
          error: `Action '${args.actionType}' is not in the whitelisted driver actions.`,
        };
      }

      const rawPayload = args.payload || {};

      // Ensure version is present for status transitions before proceeding
      if (args.actionType === 'DEPART_TRIP' || args.actionType === 'ARRIVE_DESTINATION') {
        const v = (rawPayload as any).version;
        if (v === undefined || typeof v !== 'number' || v < 1) {
          return {
            success: false,
            error: `Invalid proposal payload for ${args.actionType}: Task version is required and must be >= 1.`,
          };
        }
      }

      const parseRes = actionDef.payloadSchema.safeParse(rawPayload);
      if (!parseRes.success) {
        return {
          success: false,
          error: `Invalid proposal payload for ${args.actionType}: ${parseRes.error.message}`,
        };
      }

      let sanitizedPayload: Record<string, unknown> = {};

      if (args.actionType === 'DEPART_TRIP' || args.actionType === 'ARRIVE_DESTINATION') {
        const data = parseRes.data as {
          version: number;
          photoKeys?: string[];
          temperatureC?: number;
          reason?: string;
        };
        sanitizedPayload = {
          toStatus: actionDef.fixedStatus,
          version: data.version,
          ...(data.photoKeys ? { photoKeys: data.photoKeys } : {}),
          ...(data.temperatureC !== undefined ? { temperatureC: data.temperatureC } : {}),
          ...(data.reason ? { reason: data.reason } : {}),
        };
      } else if (args.actionType === 'LOG_TRANSIT_EVENT') {
        const data = parseRes.data as {
          events?: Array<{
            clientEventId: string;
            seq: number;
            toStatus: string;
            capturedAt: string;
            photoKeys?: string[];
            temperatureC?: number;
          }>;
          clientEventId?: string;
          seq?: number;
          toStatus?: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED';
          capturedAt?: string;
          photoKeys?: string[];
          temperatureC?: number;
        };

        if (data.events && data.events.length > 0) {
          sanitizedPayload = { events: data.events };
        } else if (data.seq !== undefined && data.toStatus) {
          sanitizedPayload = {
            events: [
              {
                clientEventId: data.clientEventId || crypto.randomUUID(),
                seq: data.seq,
                toStatus: data.toStatus,
                capturedAt: data.capturedAt || new Date().toISOString(),
                ...(data.photoKeys ? { photoKeys: data.photoKeys } : {}),
                ...(data.temperatureC !== undefined ? { temperatureC: data.temperatureC } : {}),
              },
            ],
          };
        } else {
          return {
            success: false,
            error: 'Invalid proposal payload for LOG_TRANSIT_EVENT: Must provide either events array or seq and toStatus.',
          };
        }
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
          endpoint: actionDef.endpoint(args.taskId),
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
        error: `Failed to submit driver status proposal: ${e.message}`,
      };
    }
  },
};

export const driverTools = [
  getAssignedTripManifestTool,
  reportTrafficDelayVoiceTool,
  logTransitTemperatureAlertTool,
  findEmergencyColdStorageRefugeTool,
  submitDriverStatusProposalTool,
] as const;
