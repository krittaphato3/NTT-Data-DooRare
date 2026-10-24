import { z } from 'zod';
import { query } from '../../../../db/client.js';
import type { IAgentTool, RequestContext, ToolProposalPayload, ToolResult } from '../tool.types.js';
import {
  buildEndpoint,
  HIGH_COST_VED_REVIEW_THRESHOLD_THB,
  PROPOSAL_ACTION_WHITELIST,
  toNumber,
} from './governance.utils.js';

// --- TOOL 1: get_unmapped_catalog_items ---

export interface UnmappedCatalogItem {
  hospitalDrugId: string;
  hospitalName: string;
  localCode: string;
  localName: string;
  ved: string;
  abc: string | null;
  mappingId: string | null;
  mappingStatus: string;
  confidence: number | null;
  method: string | null;
}

/**
 * Tool: get_unmapped_catalog_items
 * Retrieves hospital catalog items that are UNMATCHED, have only algorithmic suggestions,
 * or lack a mapping row completely. Prioritizes vital (V) and essential (E) drugs.
 * Allowed Roles: DATA_ADMIN, SYSTEM_ADMIN
 */
export const getUnmappedCatalogItemsTool: IAgentTool<{
  hospitalId?: string;
  status?: 'UNMATCHED' | 'SUGGESTED' | 'NO_MAPPING_ROW';
  limit?: number;
  offset?: number;
}> = {
  name: 'get_unmapped_catalog_items',
  description:
    'Lists unmapped hospital inventory items (status UNMATCHED, SUGGESTED, or missing mapping rows), prioritized by VED criticality.',
  parameters: z.object({
    hospitalId: z.string().uuid().optional().describe('Optional hospital UUID filter'),
    status: z
      .enum(['UNMATCHED', 'SUGGESTED', 'NO_MAPPING_ROW'])
      .optional()
      .describe('Filter by mapping status (UNMATCHED, SUGGESTED, or NO_MAPPING_ROW)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe('Max items to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe('Pagination offset (default 0)'),
  }),
  allowedRoles: ['DATA_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const whereClauses: string[] = ['hd.active = true'];
      const params: unknown[] = [];

      if (args.hospitalId) {
        params.push(args.hospitalId);
        whereClauses.push(`hd.hospital_id = $${params.length}`);
      }

      if (args.status === 'NO_MAPPING_ROW') {
        whereClauses.push('dm.id IS NULL');
      } else if (args.status === 'UNMATCHED') {
        whereClauses.push("dm.status = 'UNMATCHED'");
      } else if (args.status === 'SUGGESTED') {
        whereClauses.push("dm.status = 'SUGGESTED'");
      } else {
        whereClauses.push("(dm.status IN ('UNMATCHED', 'SUGGESTED') OR dm.id IS NULL)");
      }

      const whereSql = whereClauses.join(' AND ');

      // Total count query
      const countSql = `
        SELECT COUNT(*)::text AS total,
               COUNT(*) FILTER (WHERE dm.status = 'UNMATCHED')::text AS unmatched_count,
               COUNT(*) FILTER (WHERE dm.status = 'SUGGESTED')::text AS suggested_count,
               COUNT(*) FILTER (WHERE dm.id IS NULL)::text AS no_mapping_count
          FROM hospital_drug hd
          JOIN hospital h ON h.id = hd.hospital_id
          LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
         WHERE ${whereSql}
      `;
      const countRes = await query<{
        total: string;
        unmatched_count: string;
        suggested_count: string;
        no_mapping_count: string;
      }>(countSql, params);

      const total = toNumber(countRes.rows[0]?.total, 0);

      // Data query
      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const dataSql = `
        SELECT hd.id AS hospital_drug_id,
               h.name_th AS hospital_name,
               hd.local_code,
               hd.local_name,
               hd.ved::text AS ved,
               hd.abc::text AS abc,
               dm.id AS mapping_id,
               COALESCE(dm.status::text, 'NO_MAPPING_ROW') AS mapping_status,
               dm.confidence::text AS confidence,
               dm.method
          FROM hospital_drug hd
          JOIN hospital h ON h.id = hd.hospital_id
          LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
         WHERE ${whereSql}
         ORDER BY CASE hd.ved WHEN 'V' THEN 1 WHEN 'E' THEN 2 ELSE 3 END,
                  hd.local_name ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const dataRes = await query<{
        hospital_drug_id: string;
        hospital_name: string;
        local_code: string;
        local_name: string;
        ved: string;
        abc: string | null;
        mapping_id: string | null;
        mapping_status: string;
        confidence: string | null;
        method: string | null;
      }>(dataSql, params);

      const items: UnmappedCatalogItem[] = dataRes.rows.map((r) => ({
        hospitalDrugId: r.hospital_drug_id,
        hospitalName: r.hospital_name,
        localCode: r.local_code,
        localName: r.local_name,
        ved: r.ved,
        abc: r.abc,
        mappingId: r.mapping_id,
        mappingStatus: r.mapping_status,
        confidence: r.confidence !== null ? toNumber(r.confidence) : null,
        method: r.method,
      }));

      return {
        success: true,
        data: {
          items,
          total,
          limit,
          offset,
          truncated: total > offset + items.length,
          summary: {
            unmatched: toNumber(countRes.rows[0]?.unmatched_count, 0),
            suggested: toNumber(countRes.rows[0]?.suggested_count, 0),
            noMappingRow: toNumber(countRes.rows[0]?.no_mapping_count, 0),
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve unmapped catalog items: ${e.message}`,
      };
    }
  },
};

// --- TOOL 2: get_mapping_suggestions ---

export interface MappingSuggestionItem {
  tmtId: string;
  tmtName: string | null;
  gpId: string | null;
  score: number;
  scoreParts: unknown;
  rank: number;
  matchedGenericName: string | null;
}

/**
 * Tool: get_mapping_suggestions
 * Retrieves ranked TMT and canonical Drug Master candidates for an unverified drug mapping.
 * Suggestions are algorithmic and advisory.
 * Allowed Roles: DATA_ADMIN, SYSTEM_ADMIN
 */
export const getMappingSuggestionsTool: IAgentTool<{
  hospitalDrugId?: string;
  mappingId?: string;
  topN?: number;
}> = {
  name: 'get_mapping_suggestions',
  description:
    'Retrieves ranked algorithmic TMT candidates for a hospital drug or mapping row. Output is strictly advisory.',
  parameters: z.object({
    hospitalDrugId: z
      .string()
      .uuid()
      .optional()
      .describe('Hospital drug UUID (provide either hospitalDrugId or mappingId)'),
    mappingId: z
      .string()
      .uuid()
      .optional()
      .describe('Drug mapping UUID (provide either hospitalDrugId or mappingId)'),
    topN: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum number of ranked candidates to return (default 5)'),
  }),
  allowedRoles: ['DATA_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const topN = args.topN ?? 5;

      if ((!args.hospitalDrugId && !args.mappingId) || (args.hospitalDrugId && args.mappingId)) {
        return {
          success: false,
          error: 'Must provide exactly one of hospitalDrugId or mappingId.',
        };
      }

      let filterSql: string;
      let filterParam: string;

      if (args.hospitalDrugId) {
        filterSql = 'dm.hospital_drug_id = $1';
        filterParam = args.hospitalDrugId;
      } else {
        filterSql = 'dm.id = $1';
        filterParam = args.mappingId!;
      }

      const sql = `
        SELECT dm.id AS mapping_id,
               dm.hospital_drug_id,
               dm.status::text AS mapping_status,
               hd.local_name,
               mc.id AS candidate_id,
               mc.tmt_id,
               tmt.name AS tmt_name,
               tmt.gp_id,
               mc.score::text AS score,
               mc.score_parts,
               mc.rank,
               dmast.generic_name AS matched_generic_name
          FROM drug_mapping dm
          JOIN hospital_drug hd ON hd.id = dm.hospital_drug_id
          JOIN mapping_candidate mc ON mc.drug_mapping_id = dm.id
          LEFT JOIN tmt_reference tmt ON tmt.tmt_id = mc.tmt_id
          LEFT JOIN drug_master dmast ON dmast.gp_id = tmt.gp_id
         WHERE ${filterSql}
         ORDER BY mc.rank ASC
         LIMIT $2
      `;

      const res = await query<{
        mapping_id: string;
        hospital_drug_id: string;
        mapping_status: string;
        local_name: string;
        candidate_id: string;
        tmt_id: string;
        tmt_name: string | null;
        gp_id: string | null;
        score: string;
        score_parts: unknown;
        rank: number;
        matched_generic_name: string | null;
      }>(sql, [filterParam, topN]);

      if (res.rows.length === 0) {
        // Check if mapping row exists at all
        const mappingCheck = await query<{ id: string; status: string }>(
          `SELECT dm.id, dm.status::text AS status
             FROM drug_mapping dm
            WHERE ${filterSql}`,
          [filterParam],
        );

        if (mappingCheck.rows.length === 0) {
          return {
            success: true,
            data: {
              target: filterParam,
              candidates: [],
              advisory: true,
              note: 'No mapping row exists for this drug identifier. Algorithmic candidates have not been generated.',
            },
          };
        }

        return {
          success: true,
          data: {
            mappingId: mappingCheck.rows[0].id,
            mappingStatus: mappingCheck.rows[0].status,
            candidates: [],
            advisory: true,
            note: 'No mapping candidates found for this mapping row.',
          },
        };
      }

      const first = res.rows[0];
      const candidates: MappingSuggestionItem[] = res.rows.map((r) => ({
        tmtId: r.tmt_id,
        tmtName: r.tmt_name,
        gpId: r.gp_id,
        score: toNumber(r.score, 0),
        scoreParts: r.score_parts,
        rank: r.rank,
        matchedGenericName: r.matched_generic_name,
      }));

      return {
        success: true,
        data: {
          mappingId: first.mapping_id,
          hospitalDrugId: first.hospital_drug_id,
          localName: first.local_name,
          mappingStatus: first.mapping_status,
          candidates,
          advisory: true,
          note: 'Candidates are generated via fuzzy string match and TMT ontology. Human verification required before activation.',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to retrieve mapping suggestions: ${e.message}`,
      };
    }
  },
};

// --- TOOL 3: audit_ved_classifications ---

export interface VedAuditFinding {
  code:
    | 'MISSING_ABC'
    | 'HIGH_COST_NON_VITAL'
    | 'VITAL_UNMAPPED'
    | 'VED_CONFLICT_ACROSS_HOSPITALS';
  hospitalDrugId?: string;
  hospitalName?: string;
  localName?: string;
  drugMasterId?: string;
  genericName?: string;
  detail: string;
}

/**
 * Tool: audit_ved_classifications
 * Audits catalog VED/ABC classifications across hospital drug lists:
 * - MISSING_ABC: Nullable ABC rating not filled.
 * - HIGH_COST_NON_VITAL: Unit price exceeds 10,000 THB but item is not classified as Vital (V).
 * - VITAL_UNMAPPED: Item marked as Vital (V) but lacks verified Drug Master mapping.
 * - VED_CONFLICT_ACROSS_HOSPITALS: Discrepant VED ratings across hospitals for the same canonical drug.
 * Allowed Roles: DATA_ADMIN, SYSTEM_ADMIN
 */
export const auditVedClassificationsTool: IAgentTool<{
  hospitalId?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'audit_ved_classifications',
  description:
    'Audits hospital VED classifications for high-cost anomalies, unmapped vital drugs, missing ABC ratings, and regional classification conflicts.',
  parameters: z.object({
    hospitalId: z.string().uuid().optional().describe('Optional hospital UUID filter'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe('Max findings to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe('Pagination offset (default 0)'),
  }),
  allowedRoles: ['DATA_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const findings: VedAuditFinding[] = [];

      const hospitalFilter = args.hospitalId ? 'AND hd.hospital_id = $1' : '';
      const params = args.hospitalId ? [args.hospitalId] : [];

      // 1. HIGH_COST_NON_VITAL: price > threshold and ved <> 'V'
      const highCostRes = await query<{
        hospital_drug_id: string;
        hospital_name: string;
        local_name: string;
        ved: string;
        unit_price_thb: string;
      }>(
        `SELECT hd.id AS hospital_drug_id,
                h.name_th AS hospital_name,
                hd.local_name,
                hd.ved::text AS ved,
                hd.unit_price_thb::text AS unit_price_thb
           FROM hospital_drug hd
           JOIN hospital h ON h.id = hd.hospital_id
          WHERE hd.active = true
            AND hd.unit_price_thb > ${HIGH_COST_VED_REVIEW_THRESHOLD_THB}
            AND hd.ved <> 'V'
            ${hospitalFilter}
          ORDER BY hd.unit_price_thb DESC`,
        params,
      );

      for (const r of highCostRes.rows) {
        findings.push({
          code: 'HIGH_COST_NON_VITAL',
          hospitalDrugId: r.hospital_drug_id,
          hospitalName: r.hospital_name,
          localName: r.local_name,
          detail: `Review recommended: unit price is ${toNumber(r.unit_price_thb).toLocaleString()} THB (> ${HIGH_COST_VED_REVIEW_THRESHOLD_THB.toLocaleString()} THB) but VED classification is '${r.ved}'.`,
        });
      }

      // 2. VITAL_UNMAPPED: ved = 'V' and not verified in mapping
      const vitalUnmappedRes = await query<{
        hospital_drug_id: string;
        hospital_name: string;
        local_name: string;
        mapping_status: string | null;
      }>(
        `SELECT hd.id AS hospital_drug_id,
                h.name_th AS hospital_name,
                hd.local_name,
                dm.status::text AS mapping_status
           FROM hospital_drug hd
           JOIN hospital h ON h.id = hd.hospital_id
           LEFT JOIN drug_mapping dm ON dm.hospital_drug_id = hd.id
          WHERE hd.active = true
            AND hd.ved = 'V'
            AND (dm.id IS NULL OR dm.status <> 'VERIFIED')
            ${hospitalFilter}
          ORDER BY hd.local_name ASC`,
        params,
      );

      for (const r of vitalUnmappedRes.rows) {
        findings.push({
          code: 'VITAL_UNMAPPED',
          hospitalDrugId: r.hospital_drug_id,
          hospitalName: r.hospital_name,
          localName: r.local_name,
          detail: `Critical/vital medicine (VED = 'V') is unverified in Drug Master (current status: ${r.mapping_status || 'NO_MAPPING_ROW'}).`,
        });
      }

      // 3. MISSING_ABC: abc rating is null
      const missingAbcRes = await query<{
        hospital_drug_id: string;
        hospital_name: string;
        local_name: string;
        ved: string;
      }>(
        `SELECT hd.id AS hospital_drug_id,
                h.name_th AS hospital_name,
                hd.local_name,
                hd.ved::text AS ved
           FROM hospital_drug hd
           JOIN hospital h ON h.id = hd.hospital_id
          WHERE hd.active = true
            AND hd.abc IS NULL
            ${hospitalFilter}
          ORDER BY hd.local_name ASC`,
        params,
      );

      for (const r of missingAbcRes.rows) {
        findings.push({
          code: 'MISSING_ABC',
          hospitalDrugId: r.hospital_drug_id,
          hospitalName: r.hospital_name,
          localName: r.local_name,
          detail: `ABC classification rating is null. Expenditure priority cannot be evaluated.`,
        });
      }

      // 4. VED_CONFLICT_ACROSS_HOSPITALS: across verified mappings, different hospitals assigned different VED classes
      const conflictRes = await query<{
        drug_master_id: string;
        generic_name: string;
        hospital_count: string;
        ved_values: string;
        hospital_breakdown: string;
      }>(
        `SELECT dmast.id AS drug_master_id,
                dmast.generic_name,
                COUNT(DISTINCT hd.ved)::text AS hospital_count,
                string_agg(DISTINCT hd.ved::text, ', ') AS ved_values,
                string_agg(DISTINCT h.name_th || ' (' || hd.ved::text || ')', '; ') AS hospital_breakdown
           FROM drug_mapping dm
           JOIN hospital_drug hd ON hd.id = dm.hospital_drug_id
           JOIN hospital h ON h.id = hd.hospital_id
           JOIN drug_master dmast ON dmast.id = dm.drug_master_id
          WHERE dm.status = 'VERIFIED'
            AND hd.active = true
          GROUP BY dmast.id, dmast.generic_name
         HAVING COUNT(DISTINCT hd.ved) > 1
          ORDER BY dmast.generic_name ASC`,
      );

      for (const r of conflictRes.rows) {
        findings.push({
          code: 'VED_CONFLICT_ACROSS_HOSPITALS',
          drugMasterId: r.drug_master_id,
          genericName: r.generic_name,
          detail: `Discrepant VED classifications across network: ${r.hospital_breakdown}. Canonical alignment recommended.`,
        });
      }

      const total = findings.length;
      const paginatedFindings = findings.slice(offset, offset + limit);

      const summary = {
        HIGH_COST_NON_VITAL: findings.filter((f) => f.code === 'HIGH_COST_NON_VITAL').length,
        VITAL_UNMAPPED: findings.filter((f) => f.code === 'VITAL_UNMAPPED').length,
        MISSING_ABC: findings.filter((f) => f.code === 'MISSING_ABC').length,
        VED_CONFLICT_ACROSS_HOSPITALS: findings.filter((f) => f.code === 'VED_CONFLICT_ACROSS_HOSPITALS').length,
      };

      return {
        success: true,
        data: {
          findings: paginatedFindings,
          total,
          limit,
          offset,
          truncated: total > offset + paginatedFindings.length,
          summary,
          assumptions: {
            highCostReviewThresholdThb: HIGH_COST_VED_REVIEW_THRESHOLD_THB,
            missingVedCheckSkipped:
              'hospital_drug.ved is defined NOT NULL DEFAULT E in schema.sql; structural nulls cannot occur.',
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to audit VED classifications: ${e.message}`,
      };
    }
  },
};

// --- TOOL 4: submit_data_admin_proposal (TERMINAL) ---

/**
 * Tool: submit_data_admin_proposal (Terminal Tool)
 * Generates an interactive Human-In-The-Loop (HITL) proposal card for central Data Admin actions:
 * - VERIFY_DRUG_MAPPING: Confirms algorithmic or manual link between a hospital drug and canonical Drug Master.
 * - REJECT_DRUG_MAPPING: Rejects suggested drug mapping with documented justification.
 * - UPDATE_CENTRAL_ITEM: Creates or updates a non-drug supply or blood central item.
 * Allowed Roles: DATA_ADMIN, SYSTEM_ADMIN
 */
export const submitDataAdminProposalTool: IAgentTool<{
  action: 'VERIFY_DRUG_MAPPING' | 'REJECT_DRUG_MAPPING' | 'UPDATE_CENTRAL_ITEM';
  mappingId?: string;
  version?: number;
  drugMasterId?: string;
  baseUnitsPerPack?: number;
  unitConversionFactor?: number;
  localPackUnit?: string;
  manufacturer?: string;
  reason?: string;
  note?: string;
  itemType?: 'SUPPLY' | 'BLOOD';
  internalCode?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  baseUnit?: string;
}> = {
  name: 'submit_data_admin_proposal',
  description:
    'Terminal proposal tool creating human-in-the-loop action proposals for verifying/rejecting drug mappings or creating central-list items.',
  parameters: z.object({
    action: z
      .enum(['VERIFY_DRUG_MAPPING', 'REJECT_DRUG_MAPPING', 'UPDATE_CENTRAL_ITEM'])
      .describe('Data admin executive action to propose'),
    mappingId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of drug_mapping (for VERIFY/REJECT)'),
    version: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Expected drug_mapping version (defaults to current version)'),
    drugMasterId: z
      .string()
      .uuid()
      .optional()
      .describe('Canonical drug_master UUID for VERIFY_DRUG_MAPPING'),
    baseUnitsPerPack: z
      .number()
      .positive()
      .optional()
      .describe('Hospital pack size in base units (required for VERIFY_DRUG_MAPPING)'),
    unitConversionFactor: z
      .number()
      .positive()
      .optional()
      .default(1)
      .describe('Base units per local unit (default 1)'),
    localPackUnit: z.string().optional().describe('Local pack unit, e.g. กล่อง'),
    manufacturer: z.string().optional().describe('Manufacturer name'),
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .optional()
      .describe('Mandatory audit justification for REJECT_DRUG_MAPPING (min 10 chars)'),
    note: z.string().optional().describe('Optional note for VERIFY_DRUG_MAPPING'),
    itemType: z
      .enum(['SUPPLY', 'BLOOD'])
      .optional()
      .describe('Item category for UPDATE_CENTRAL_ITEM'),
    internalCode: z
      .string()
      .optional()
      .describe('Central internal code (e.g. SUP-0001) for UPDATE_CENTRAL_ITEM'),
    genericName: z
      .string()
      .optional()
      .describe('Canonical generic name for UPDATE_CENTRAL_ITEM'),
    strength: z.string().optional().describe('Optional strength specification'),
    dosageForm: z.string().optional().describe('Optional dosage form specification'),
    baseUnit: z
      .string()
      .optional()
      .describe('Base dispensing unit (e.g. piece, vial, bag) for UPDATE_CENTRAL_ITEM'),
  }),
  allowedRoles: ['DATA_ADMIN', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      if (args.action === 'VERIFY_DRUG_MAPPING') {
        if (!args.mappingId) {
          return {
            success: false,
            error: 'mappingId is required for VERIFY_DRUG_MAPPING.',
          };
        }
        const mapRes = await query<{
          id: string;
          status: string;
          version: number;
          drug_master_id: string | null;
          base_units_per_pack: string | number | null;
          local_name: string;
          hospital_name: string;
        }>(
          `SELECT dm.id,
                  dm.status::text AS status,
                  dm.version,
                  dm.drug_master_id,
                  dm.base_units_per_pack,
                  hd.local_name,
                  h.name_th AS hospital_name
             FROM drug_mapping dm
             JOIN hospital_drug hd ON hd.id = dm.hospital_drug_id
             JOIN hospital h ON h.id = hd.hospital_id
            WHERE dm.id = $1`,
          [args.mappingId],
        );

        if (mapRes.rows.length === 0) {
          return {
            success: false,
            error: `Drug mapping '${args.mappingId}' not found.`,
          };
        }

        const mapRow = mapRes.rows[0];
        const alreadyDecided = mapRow.status === 'VERIFIED' || mapRow.status === 'REJECTED';

        const actionDef = PROPOSAL_ACTION_WHITELIST.DATA_ADMIN.VERIFY_DRUG_MAPPING;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: mapRow.id });

        const effectiveDrugMasterId = args.drugMasterId || mapRow.drug_master_id;
        const expectedVersion = args.version ?? mapRow.version;
        const prefilledBaseUnits =
          mapRow.base_units_per_pack != null ? toNumber(mapRow.base_units_per_pack, 0) : undefined;
        const effectiveBaseUnitsPerPack =
          args.baseUnitsPerPack ?? (prefilledBaseUnits && prefilledBaseUnits > 0 ? prefilledBaseUnits : undefined);

        if (effectiveBaseUnitsPerPack === undefined || effectiveBaseUnitsPerPack <= 0) {
          return {
            success: false,
            error: 'baseUnitsPerPack (positive number) is required for VERIFY_DRUG_MAPPING.',
          };
        }

        const actionPayload: Record<string, unknown> = {
          version: expectedVersion,
          baseUnitsPerPack: effectiveBaseUnitsPerPack,
          unitConversionFactor: args.unitConversionFactor ?? 1,
          ...(effectiveDrugMasterId ? { drugMasterId: effectiveDrugMasterId } : {}),
          ...(args.localPackUnit ? { localPackUnit: args.localPackUnit } : {}),
          ...(args.manufacturer ? { manufacturer: args.manufacturer } : {}),
          ...(args.note ? { note: args.note.trim() } : {}),
        };

        const summary: Record<string, unknown> = {
          action: 'VERIFY_DRUG_MAPPING',
          mappingId: mapRow.id,
          localName: mapRow.local_name,
          hospitalName: mapRow.hospital_name,
          currentStatus: mapRow.status,
          drugMasterId: effectiveDrugMasterId,
          baseUnitsPerPack: effectiveBaseUnitsPerPack,
          ...(alreadyDecided ? { warning: `Mapping is currently already in status '${mapRow.status}'.` } : {}),
        };

        const proposal: ToolProposalPayload = {
          type: 'VERIFY_DRUG_MAPPING',
          title: `Proposal: Verify Drug Mapping for ${mapRow.local_name} (${mapRow.hospital_name})`,
          description: `Propose approving verification of hospital drug mapping '${mapRow.local_name}' to Drug Master (${effectiveDrugMasterId ?? 'Canonical Link'}).`,
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

      if (args.action === 'REJECT_DRUG_MAPPING') {
        if (!args.mappingId) {
          return {
            success: false,
            error: 'mappingId is required for REJECT_DRUG_MAPPING.',
          };
        }
        if (!args.reason || args.reason.trim().length < 10) {
          return {
            success: false,
            error: 'reason (minimum 10 characters) is required for REJECT_DRUG_MAPPING.',
          };
        }

        const mapRes = await query<{
          id: string;
          status: string;
          local_name: string;
          hospital_name: string;
        }>(
          `SELECT dm.id,
                  dm.status::text AS status,
                  hd.local_name,
                  h.name_th AS hospital_name
             FROM drug_mapping dm
             JOIN hospital_drug hd ON hd.id = dm.hospital_drug_id
             JOIN hospital h ON h.id = hd.hospital_id
            WHERE dm.id = $1`,
          [args.mappingId],
        );

        if (mapRes.rows.length === 0) {
          return {
            success: false,
            error: `Drug mapping '${args.mappingId}' not found.`,
          };
        }

        const mapRow = mapRes.rows[0];
        const alreadyDecided = mapRow.status === 'VERIFIED' || mapRow.status === 'REJECTED';

        const actionDef = PROPOSAL_ACTION_WHITELIST.DATA_ADMIN.REJECT_DRUG_MAPPING;
        const endpoint = buildEndpoint(actionDef.endpointTemplate, { id: mapRow.id });

        const actionPayload = {
          reason: args.reason.trim(),
        };

        const summary: Record<string, unknown> = {
          action: 'REJECT_DRUG_MAPPING',
          mappingId: mapRow.id,
          localName: mapRow.local_name,
          hospitalName: mapRow.hospital_name,
          currentStatus: mapRow.status,
          reason: args.reason.trim(),
          ...(alreadyDecided ? { warning: `Mapping is currently already in status '${mapRow.status}'.` } : {}),
        };

        const proposal: ToolProposalPayload = {
          type: 'REJECT_DRUG_MAPPING',
          title: `Proposal: Reject Drug Mapping for ${mapRow.local_name} (${mapRow.hospital_name})`,
          description: `Propose rejecting mapping suggestion for '${mapRow.local_name}'. Justification: ${args.reason.trim()}`,
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

      if (args.action === 'UPDATE_CENTRAL_ITEM') {
        if (!args.itemType) {
          return {
            success: false,
            error: 'itemType (SUPPLY or BLOOD) is required for UPDATE_CENTRAL_ITEM.',
          };
        }
        if (!args.internalCode || !args.internalCode.trim()) {
          return {
            success: false,
            error: 'internalCode is required for UPDATE_CENTRAL_ITEM.',
          };
        }
        if (!args.genericName || !args.genericName.trim()) {
          return {
            success: false,
            error: 'genericName is required for UPDATE_CENTRAL_ITEM.',
          };
        }
        if (!args.baseUnit || !args.baseUnit.trim()) {
          return {
            success: false,
            error: 'baseUnit is required for UPDATE_CENTRAL_ITEM.',
          };
        }

        const actionDef = PROPOSAL_ACTION_WHITELIST.DATA_ADMIN.UPDATE_CENTRAL_ITEM;
        const endpoint = actionDef.endpointTemplate;

        const actionPayload: Record<string, unknown> = {
          item_type: args.itemType,
          internal_code: args.internalCode.trim(),
          generic_name: args.genericName.trim(),
          base_unit: args.baseUnit.trim(),
          ...(args.strength ? { strength: args.strength.trim() } : {}),
          ...(args.dosageForm ? { dosage_form: args.dosageForm.trim() } : {}),
        };

        const summary: Record<string, unknown> = {
          action: 'UPDATE_CENTRAL_ITEM',
          itemType: args.itemType,
          internalCode: args.internalCode.trim(),
          genericName: args.genericName.trim(),
          baseUnit: args.baseUnit.trim(),
          strength: args.strength?.trim() ?? null,
          dosageForm: args.dosageForm?.trim() ?? null,
        };

        const proposal: ToolProposalPayload = {
          type: 'UPDATE_CENTRAL_ITEM',
          title: `Proposal: Create/Update Central Item (${args.internalCode.trim()})`,
          description: `Propose creating or updating central-list item ${args.internalCode.trim()} (${args.genericName.trim()}) in category ${args.itemType}.`,
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
        error: `Failed to submit data admin proposal: ${e.message}`,
      };
    }
  },
};

/**
 * All 4 Data Admin domain tools.
 */
export const dataAdminTools = [
  getUnmappedCatalogItemsTool,
  getMappingSuggestionsTool,
  auditVedClassificationsTool,
  submitDataAdminProposalTool,
];
