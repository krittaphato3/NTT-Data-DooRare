import { z } from 'zod';
import { query } from '../../../../db/client.js';
import { forecastsService } from '../../../forecasts/forecasts.service.js';
import type { IAgentTool, RequestContext, ToolResult } from '../tool.types.js';

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
