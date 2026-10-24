import { z } from 'zod';
import { query } from '../../../../db/client.js';
import type { IAgentTool, RequestContext, ToolResult } from '../tool.types.js';
import { sanitizeErrorMessage, toNumber } from './governance.utils.js';

/**
 * Maximum character count for serialized prompt/result fields in agent provenance inspection.
 */
export const PROVENANCE_TEXT_MAX_CHARS = 2000;

/**
 * Maximum transit threshold before flagging controlled substance transfer as stale (Assumption).
 */
export const NARCOTICS_IN_TRANSIT_MAX_HOURS = 24;

/**
 * Serializes and truncates free-text or JSON objects with secret sanitization.
 */
function sanitizeAndTruncate(
  val: unknown,
  maxChars = PROVENANCE_TEXT_MAX_CHARS,
): { text: string; truncated: boolean } {
  if (val === null || val === undefined) {
    return { text: '', truncated: false };
  }
  const rawStr = typeof val === 'string' ? val : JSON.stringify(val);
  const sanitized = sanitizeErrorMessage(rawStr);
  if (sanitized.length > maxChars) {
    return {
      text: sanitized.slice(0, maxChars) + '... [TRUNCATED]',
      truncated: true,
    };
  }
  return { text: sanitized, truncated: false };
}

// --- TOOL 1: inspect_agent_run_provenance ---

export interface AgentRunSummaryItem {
  id: string;
  agent: string;
  task: string;
  refType: string | null;
  refId: string | null;
  hospitalId: string | null;
  modelId: string | null;
  inputHash: string;
  status: string;
  steps: number | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

/**
 * Tool: inspect_agent_run_provenance
 * Audits agent executions, tool invocation sequence, inputs, outputs, and token metrics.
 * In single-run mode, returns complete sanitized execution trace and correlated audit entries.
 * In list mode, returns paginated execution summaries.
 * Allowed Roles: AUDITOR, SYSTEM_ADMIN
 */
export const inspectAgentRunProvenanceTool: IAgentTool<{
  runId?: string;
  agent?: string;
  status?: 'OK' | 'INVALID' | 'FALLBACK' | 'ERROR' | 'SKIPPED';
  hospitalId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'inspect_agent_run_provenance',
  description:
    'Inspects agent execution provenance, tool call traces, prompts, token counts, and correlated audit log entries.',
  parameters: z.object({
    runId: z.string().uuid().optional().describe('UUID of a specific agent_run to inspect in depth'),
    agent: z.string().optional().describe('Filter by agent identifier in list mode'),
    status: z
      .enum(['OK', 'INVALID', 'FALLBACK', 'ERROR', 'SKIPPED'])
      .optional()
      .describe('Filter by execution status in list mode'),
    hospitalId: z.string().uuid().optional().describe('Filter by hospital UUID in list mode'),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
      .optional()
      .describe('Filter runs created on or after date (YYYY-MM-DD)'),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
      .optional()
      .describe('Filter runs created on or before date (YYYY-MM-DD)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe('Maximum items to return in list mode (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe('Pagination offset in list mode (default 0)'),
  }),
  allowedRoles: ['AUDITOR', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      // 1. Single Run Detailed Mode
      if (args.runId) {
        const runRes = await query<{
          id: string;
          agent: string;
          task: string;
          ref_type: string | null;
          ref_id: string | null;
          hospital_id: string | null;
          model_id: string | null;
          input_hash: string;
          input: unknown;
          output: unknown;
          status: string;
          steps: number | null;
          latency_ms: number | null;
          tokens_in: number | null;
          tokens_out: number | null;
          guardrail_hits: unknown;
          created_at: string;
        }>(
          `SELECT id, agent, task, ref_type, ref_id, hospital_id, model_id,
                  input_hash, input, output, status, steps, latency_ms,
                  tokens_in, tokens_out, guardrail_hits, created_at::text AS created_at
             FROM agent_run
            WHERE id = $1`,
          [args.runId],
        );

        if (runRes.rows.length === 0) {
          return {
            success: false,
            error: `Agent run '${args.runId}' not found.`,
          };
        }

        const run = runRes.rows[0];

        // Fetch tool calls
        const toolCallsRes = await query<{
          seq: number;
          tool: string;
          args: unknown;
          result: unknown;
          error: string | null;
          latency_ms: number | null;
        }>(
          `SELECT seq, tool, args, result, error, latency_ms
             FROM agent_tool_call
            WHERE run_id = $1
            ORDER BY seq ASC`,
          [run.id],
        );

        // Fetch correlated audit_log entries (metadata only)
        const auditRes = await query<{
          id: string;
          occurred_at: string;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          row_hash: string;
        }>(
          `SELECT id::text AS id, occurred_at::text AS occurred_at,
                  actor_id::text AS actor_id, actor_role, action,
                  entity_type, entity_id::text AS entity_id, row_hash
             FROM audit_log
            WHERE agent_run_id = $1
            ORDER BY occurred_at ASC`,
          [run.id],
        );

        const sanitizedInput = sanitizeAndTruncate(run.input);
        const sanitizedOutput = sanitizeAndTruncate(run.output);

        const toolCalls = toolCallsRes.rows.map((tc) => {
          const sArgs = sanitizeAndTruncate(tc.args);
          const sResult = sanitizeAndTruncate(tc.result);
          return {
            seq: tc.seq,
            tool: tc.tool,
            args: sArgs.text,
            argsTruncated: sArgs.truncated,
            result: sResult.text,
            resultTruncated: sResult.truncated,
            error: tc.error ? sanitizeErrorMessage(tc.error) : null,
            latencyMs: tc.latency_ms,
          };
        });

        const auditLogEntries = auditRes.rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurred_at,
          actorId: row.actor_id,
          actorRole: row.actor_role,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          rowHash: row.row_hash,
        }));

        return {
          success: true,
          data: {
            run: {
              id: run.id,
              agent: run.agent,
              task: run.task,
              refType: run.ref_type,
              refId: run.ref_id,
              hospitalId: run.hospital_id,
              modelId: run.model_id,
              inputHash: run.input_hash,
              status: run.status,
              steps: run.steps,
              latencyMs: run.latency_ms,
              tokensIn: run.tokens_in,
              tokensOut: run.tokens_out,
              guardrailHits: run.guardrail_hits,
              createdAt: run.created_at,
              input: sanitizedInput.text,
              inputTruncated: sanitizedInput.truncated,
              output: sanitizedOutput.text,
              outputTruncated: sanitizedOutput.truncated,
            },
            toolCalls,
            auditLogEntries,
          },
        };
      }

      // 2. List Mode
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const whereClauses: string[] = ['1=1'];
      const params: unknown[] = [];

      if (args.agent) {
        params.push(args.agent);
        whereClauses.push(`agent = $${params.length}`);
      }

      if (args.status) {
        params.push(args.status);
        whereClauses.push(`status = $${params.length}`);
      }

      if (args.hospitalId) {
        params.push(args.hospitalId);
        whereClauses.push(`hospital_id = $${params.length}`);
      }

      if (args.from) {
        params.push(args.from);
        whereClauses.push(`created_at >= $${params.length}::timestamptz`);
      }

      if (args.to) {
        params.push(args.to);
        whereClauses.push(`created_at <= ($${params.length}::date + 1)::timestamptz`);
      }

      const whereSql = whereClauses.join(' AND ');

      // Summary counts
      const countSql = `
        SELECT COUNT(*)::text AS total,
               COALESCE(SUM(tokens_in + tokens_out), 0)::text AS total_tokens,
               COUNT(*) FILTER (WHERE status = 'OK')::text AS count_ok,
               COUNT(*) FILTER (WHERE status = 'INVALID')::text AS count_invalid,
               COUNT(*) FILTER (WHERE status = 'FALLBACK')::text AS count_fallback,
               COUNT(*) FILTER (WHERE status = 'ERROR')::text AS count_error,
               COUNT(*) FILTER (WHERE status = 'SKIPPED')::text AS count_skipped
          FROM agent_run
         WHERE ${whereSql}
      `;

      const countRes = await query<{
        total: string;
        total_tokens: string;
        count_ok: string;
        count_invalid: string;
        count_fallback: string;
        count_error: string;
        count_skipped: string;
      }>(countSql, params);

      const total = toNumber(countRes.rows[0]?.total, 0);

      // Data query
      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const listSql = `
        SELECT id, agent, task, ref_type, ref_id, hospital_id, model_id,
               input_hash, status, steps, latency_ms, tokens_in, tokens_out,
               created_at::text AS created_at
          FROM agent_run
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const listRes = await query<{
        id: string;
        agent: string;
        task: string;
        ref_type: string | null;
        ref_id: string | null;
        hospital_id: string | null;
        model_id: string | null;
        input_hash: string;
        status: string;
        steps: number | null;
        latency_ms: number | null;
        tokens_in: number | null;
        tokens_out: number | null;
        created_at: string;
      }>(listSql, params);

      const items: AgentRunSummaryItem[] = listRes.rows.map((r) => ({
        id: r.id,
        agent: r.agent,
        task: r.task,
        refType: r.ref_type,
        refId: r.ref_id,
        hospitalId: r.hospital_id,
        modelId: r.model_id,
        inputHash: r.input_hash,
        status: r.status,
        steps: r.steps,
        latencyMs: r.latency_ms,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        createdAt: r.created_at,
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
            totalTokens: toNumber(countRes.rows[0]?.total_tokens, 0),
            byStatus: {
              OK: toNumber(countRes.rows[0]?.count_ok, 0),
              INVALID: toNumber(countRes.rows[0]?.count_invalid, 0),
              FALLBACK: toNumber(countRes.rows[0]?.count_fallback, 0),
              ERROR: toNumber(countRes.rows[0]?.count_error, 0),
              SKIPPED: toNumber(countRes.rows[0]?.count_skipped, 0),
            },
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to inspect agent run provenance: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 2: inspect_narcotics_chain_of_custody ---

export interface NarcoticsTaskFinding {
  code:
    | 'MISSING_DRIVER'
    | 'MISSING_TIMESTAMP'
    | 'TIMESTAMP_ORDER_VIOLATION'
    | 'NO_EVENT_TRAIL'
    | 'NO_HANDOVER_PHOTO'
    | 'STALE_IN_TRANSIT'
    | 'CONTROLLED_IN_ALLOCATION';
  taskId: string;
  taskNo: string | null;
  detail: string;
}

export interface CustodyTaskInput {
  taskId?: string;
  taskNo?: string | null;
  status: string;
  driver_id?: string | null;
  loaded_at?: string | Date | null;
  departed_at?: string | Date | null;
  arrived_at?: string | Date | null;
  received_at?: string | Date | null;
  eventCount?: number;
  photoCount?: number;
  handoverPhotoCount?: number;
  is_controlled?: boolean;
  ref_type?: string;
  drug_name?: string;
}

/**
 * Pure helper detecting custody compliance gaps for a single transport task.
 */
export function detectCustodyGaps(
  task: CustodyTaskInput,
  nowMs: number = Date.now(),
): NarcoticsTaskFinding[] {
  const findings: NarcoticsTaskFinding[] = [];
  const taskId = task.taskId || '';
  const taskNo = task.taskNo ?? null;
  const maxTransitMs = NARCOTICS_IN_TRANSIT_MAX_HOURS * 3600 * 1000;

  // 1. Violation: Controlled substance in regional pooling allocation
  if (task.ref_type === 'ALLOCATION_LINE') {
    findings.push({
      code: 'CONTROLLED_IN_ALLOCATION',
      taskId,
      taskNo,
      detail: `Controlled substance (${task.drug_name || 'Controlled'}) transferred via regional allocation line, violating BR-F1b-014 prohibition.`,
    });
  }

  // Only evaluate procedural handover checks if the task has not been cancelled
  if (task.status !== 'CANCELLED') {
    // 2. Missing driver after dispatch
    if (task.status !== 'WAITING_DISPATCH' && !task.driver_id) {
      findings.push({
        code: 'MISSING_DRIVER',
        taskId,
        taskNo,
        detail: `Task status is '${task.status}' but no driver account is assigned.`,
      });
    }

    // 3. Missing expected lifecycle timestamps
    if (['LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED'].includes(task.status) && !task.loaded_at) {
      findings.push({
        code: 'MISSING_TIMESTAMP',
        taskId,
        taskNo,
        detail: `Task reached status '${task.status}' without recorded loaded_at timestamp.`,
      });
    }
    if (['IN_TRANSIT', 'ARRIVED', 'RECEIVED'].includes(task.status) && !task.departed_at) {
      findings.push({
        code: 'MISSING_TIMESTAMP',
        taskId,
        taskNo,
        detail: `Task reached status '${task.status}' without recorded departed_at timestamp.`,
      });
    }
    if (['ARRIVED', 'RECEIVED'].includes(task.status) && !task.arrived_at) {
      findings.push({
        code: 'MISSING_TIMESTAMP',
        taskId,
        taskNo,
        detail: `Task reached status '${task.status}' without recorded arrived_at timestamp.`,
      });
    }
    if (task.status === 'RECEIVED' && !task.received_at) {
      findings.push({
        code: 'MISSING_TIMESTAMP',
        taskId,
        taskNo,
        detail: `Task reached status 'RECEIVED' without recorded received_at timestamp.`,
      });
    }

    // 4. Timestamp chronologic order violation
    const tLoaded = task.loaded_at ? new Date(task.loaded_at).getTime() : null;
    const tDeparted = task.departed_at ? new Date(task.departed_at).getTime() : null;
    const tArrived = task.arrived_at ? new Date(task.arrived_at).getTime() : null;
    const tReceived = task.received_at ? new Date(task.received_at).getTime() : null;

    if (tLoaded && tDeparted && tLoaded > tDeparted) {
      findings.push({
        code: 'TIMESTAMP_ORDER_VIOLATION',
        taskId,
        taskNo,
        detail: `Timestamp sequence violation: loaded_at (${task.loaded_at}) is later than departed_at (${task.departed_at}).`,
      });
    }
    if (tDeparted && tArrived && tDeparted > tArrived) {
      findings.push({
        code: 'TIMESTAMP_ORDER_VIOLATION',
        taskId,
        taskNo,
        detail: `Timestamp sequence violation: departed_at (${task.departed_at}) is later than arrived_at (${task.arrived_at}).`,
      });
    }
    if (tArrived && tReceived && tArrived > tReceived) {
      findings.push({
        code: 'TIMESTAMP_ORDER_VIOLATION',
        taskId,
        taskNo,
        detail: `Timestamp sequence violation: arrived_at (${task.arrived_at}) is later than received_at (${task.received_at}).`,
      });
    }
    if (tLoaded && tReceived && tLoaded > tReceived) {
      findings.push({
        code: 'TIMESTAMP_ORDER_VIOLATION',
        taskId,
        taskNo,
        detail: `Timestamp sequence violation: loaded_at (${task.loaded_at}) is later than received_at (${task.received_at}).`,
      });
    }

    // 5. No event trail
    const eventCount = task.eventCount ?? 0;
    if (task.status !== 'WAITING_DISPATCH' && eventCount === 0) {
      findings.push({
        code: 'NO_EVENT_TRAIL',
        taskId,
        taskNo,
        detail: `Dispatched task has zero recorded transport_event audit milestones.`,
      });
    }

    // 6. No handover photo upon arrival/receipt
    const handoverPhotos = task.handoverPhotoCount ?? (task.status === 'RECEIVED' ? (task.photoCount ?? 0) : 0);
    if (task.status === 'RECEIVED' && handoverPhotos === 0) {
      findings.push({
        code: 'NO_HANDOVER_PHOTO',
        taskId,
        taskNo,
        detail: `Narcotics shipment completed receipt without required arrival/handover verification photo.`,
      });
    }

    // 7. Stale in-transit
    if (task.status === 'IN_TRANSIT' && tDeparted && nowMs - tDeparted > maxTransitMs) {
      const elapsedHours = Number(((nowMs - tDeparted) / (3600 * 1000)).toFixed(1));
      findings.push({
        code: 'STALE_IN_TRANSIT',
        taskId,
        taskNo,
        detail: `Narcotics dispatch has been in-transit for ${elapsedHours} hours (> ${NARCOTICS_IN_TRANSIT_MAX_HOURS}h threshold).`,
      });
    }
  }

  return findings;
}

export interface NarcoticsCustodyTaskItem {
  taskId: string;
  taskNo: string | null;
  refType: string;
  drugName: string;
  fromHospitalName: string;
  toHospitalName: string;
  driverName: string | null;
  status: string;
  loadedAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  receivedAt: string | null;
  eventCount: number;
  photoCount: number;
  findings: NarcoticsTaskFinding[];
}

/**
 * Tool: inspect_narcotics_chain_of_custody
 * Audits narcotics/controlled-substance movements for chain-of-custody compliance:
 * driver assignments, timestamp sequencing, driver events, and photo verification.
 * Allowed Roles: AUDITOR, SYSTEM_ADMIN
 */
export const inspectNarcoticsChainOfCustodyTool: IAgentTool<{
  hospitalId?: string;
  from?: string;
  to?: string;
  taskId?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'inspect_narcotics_chain_of_custody',
  description:
    'Audits chain-of-custody compliance for controlled/narcotic drug movements: driver identification, timestamp consistency, event trails, and photos.',
  parameters: z.object({
    hospitalId: z.string().uuid().optional().describe('Filter by source or destination hospital UUID'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter created_at from date (YYYY-MM-DD)'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter created_at to date (YYYY-MM-DD)'),
    taskId: z.string().uuid().optional().describe('UUID of a specific transport_task to inspect'),
    limit: z.number().int().min(1).max(200).optional().default(50).describe('Max tasks to return (default 50)'),
    offset: z.number().int().min(0).optional().default(0).describe('Pagination offset (default 0)'),
  }),
  allowedRoles: ['AUDITOR', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      // Query both BORROW_LEG tasks and any ALLOCATION_LINE tasks referencing controlled substances
      const sql = `
        WITH borrow_tasks AS (
          SELECT tt.id AS task_id,
                 tt.task_no,
                 tt.ref_type,
                 tt.status::text AS status,
                 tt.from_hospital_id,
                 h_from.name_th AS from_hospital_name,
                 tt.to_hospital_id,
                 h_to.name_th AS to_hospital_name,
                 tt.driver_id,
                 u.display_name AS driver_name,
                 dm.generic_name AS drug_name,
                 dm.is_controlled,
                 tt.loaded_at,
                 tt.departed_at,
                 tt.arrived_at,
                 tt.received_at,
                 tt.created_at,
                 (SELECT COUNT(*)::int FROM transport_event te WHERE te.task_id = tt.id) AS event_count,
                 (SELECT COUNT(*)::int FROM transport_photo tp WHERE tp.task_id = tt.id) AS photo_count,
                 (SELECT COUNT(*)::int FROM transport_photo tp WHERE tp.task_id = tt.id AND tp.stage = 'ARRIVED') AS handover_photo_count
            FROM transport_task tt
            JOIN borrow_leg bl ON bl.id = tt.ref_id AND tt.ref_type = 'BORROW_LEG'
            JOIN borrow_request_item bri ON bri.id = bl.request_item_id
            JOIN drug_master dm ON dm.id = bri.drug_master_id AND dm.is_controlled = true
            JOIN hospital h_from ON h_from.id = tt.from_hospital_id
            JOIN hospital h_to ON h_to.id = tt.to_hospital_id
            LEFT JOIN app_user u ON u.id = tt.driver_id
        ),
        allocation_tasks AS (
          SELECT tt.id AS task_id,
                 tt.task_no,
                 tt.ref_type,
                 tt.status::text AS status,
                 tt.from_hospital_id,
                 h_from.name_th AS from_hospital_name,
                 tt.to_hospital_id,
                 h_to.name_th AS to_hospital_name,
                 tt.driver_id,
                 u.display_name AS driver_name,
                 dm.generic_name AS drug_name,
                 dm.is_controlled,
                 tt.loaded_at,
                 tt.departed_at,
                 tt.arrived_at,
                 tt.received_at,
                 tt.created_at,
                 (SELECT COUNT(*)::int FROM transport_event te WHERE te.task_id = tt.id) AS event_count,
                 (SELECT COUNT(*)::int FROM transport_photo tp WHERE tp.task_id = tt.id) AS photo_count,
                 (SELECT COUNT(*)::int FROM transport_photo tp WHERE tp.task_id = tt.id AND tp.stage = 'ARRIVED') AS handover_photo_count
            FROM transport_task tt
            JOIN allocation_line al ON al.id = tt.ref_id AND tt.ref_type = 'ALLOCATION_LINE'
            JOIN allocation_plan ap ON ap.id = al.plan_id
            JOIN pool_entry pe ON pe.id = ap.pool_entry_id
            JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
            JOIN stock_lot sl ON sl.id = ne.lot_id
            JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
            JOIN drug_master dm ON dm.id = hd.drug_master_id AND dm.is_controlled = true
            JOIN hospital h_from ON h_from.id = tt.from_hospital_id
            JOIN hospital h_to ON h_to.id = tt.to_hospital_id
            LEFT JOIN app_user u ON u.id = tt.driver_id
        ),
        all_narcotics AS (
          SELECT * FROM borrow_tasks
          UNION ALL
          SELECT * FROM allocation_tasks
        )
        SELECT * FROM all_narcotics
         WHERE ($1::uuid IS NULL OR task_id = $1)
           AND ($2::uuid IS NULL OR from_hospital_id = $2 OR to_hospital_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)
           AND ($4::timestamptz IS NULL OR created_at <= ($4::date + 1)::timestamptz)
         ORDER BY created_at DESC
      `;

      const res = await query<{
        task_id: string;
        task_no: string | null;
        ref_type: string;
        status: string;
        from_hospital_id: string;
        from_hospital_name: string;
        to_hospital_id: string;
        to_hospital_name: string;
        driver_id: string | null;
        driver_name: string | null;
        drug_name: string;
        is_controlled: boolean;
        loaded_at: string | null;
        departed_at: string | null;
        arrived_at: string | null;
        received_at: string | null;
        created_at: string;
        event_count: number;
        photo_count: number;
        handover_photo_count: number;
      }>(sql, [
        args.taskId ?? null,
        args.hospitalId ?? null,
        args.from ?? null,
        args.to ?? null,
      ]);

      const allFindings: NarcoticsTaskFinding[] = [];
      const taskItems: NarcoticsCustodyTaskItem[] = [];
      const nowMs = Date.now();
      const maxTransitMs = NARCOTICS_IN_TRANSIT_MAX_HOURS * 3600 * 1000;

      for (const row of res.rows) {
        const taskFindings = detectCustodyGaps(
          {
            taskId: row.task_id,
            taskNo: row.task_no,
            status: row.status,
            driver_id: row.driver_id,
            loaded_at: row.loaded_at,
            departed_at: row.departed_at,
            arrived_at: row.arrived_at,
            received_at: row.received_at,
            eventCount: row.event_count,
            photoCount: row.photo_count,
            handoverPhotoCount: row.handover_photo_count,
            is_controlled: row.is_controlled,
            ref_type: row.ref_type,
            drug_name: row.drug_name,
          },
          nowMs,
        );

        allFindings.push(...taskFindings);

        taskItems.push({
          taskId: row.task_id,
          taskNo: row.task_no,
          refType: row.ref_type,
          drugName: row.drug_name,
          fromHospitalName: row.from_hospital_name,
          toHospitalName: row.to_hospital_name,
          driverName: row.driver_name,
          status: row.status,
          loadedAt: row.loaded_at,
          departedAt: row.departed_at,
          arrivedAt: row.arrived_at,
          receivedAt: row.received_at,
          eventCount: row.event_count,
          photoCount: row.photo_count,
          findings: taskFindings,
        });
      }

      const total = taskItems.length;
      const paginatedTasks = taskItems.slice(offset, offset + limit);

      const summaryByCode: Record<string, number> = {
        MISSING_DRIVER: allFindings.filter((f) => f.code === 'MISSING_DRIVER').length,
        MISSING_TIMESTAMP: allFindings.filter((f) => f.code === 'MISSING_TIMESTAMP').length,
        TIMESTAMP_ORDER_VIOLATION: allFindings.filter((f) => f.code === 'TIMESTAMP_ORDER_VIOLATION').length,
        NO_EVENT_TRAIL: allFindings.filter((f) => f.code === 'NO_EVENT_TRAIL').length,
        NO_HANDOVER_PHOTO: allFindings.filter((f) => f.code === 'NO_HANDOVER_PHOTO').length,
        STALE_IN_TRANSIT: allFindings.filter((f) => f.code === 'STALE_IN_TRANSIT').length,
        CONTROLLED_IN_ALLOCATION: allFindings.filter((f) => f.code === 'CONTROLLED_IN_ALLOCATION').length,
      };

      return {
        success: true,
        data: {
          tasks: paginatedTasks,
          total,
          limit,
          offset,
          truncated: total > offset + paginatedTasks.length,
          totalFindings: allFindings.length,
          summaryByCode,
          assumptions: {
            maxTransitHours: NARCOTICS_IN_TRANSIT_MAX_HOURS,
            handoverPhotoRule:
              "Handover verification checks transport_photo records at stage 'ARRIVED' per schema.sql check constraint.",
            allocationLineRule:
              'Allocation lines for controlled substances violate BR-F1b-014 and are flagged under CONTROLLED_IN_ALLOCATION.',
          },
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to inspect narcotics chain of custody: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 3: verify_tamper_evidence ---

export interface AuditWindowRow {
  id: string | number;
  prev_hash: string | null;
  row_hash: string;
}

export interface AuditWindowAnalysis {
  linkedPairs: number;
  edgeRows: number;
  forks: number;
  genesisCandidatesInWindow: number;
  anomalies: string[];
}

/**
 * Pure helper analyzing hash continuity, linkage, forks, and loops within an audit_log row window.
 */
export function analyzeAuditWindow(rows: AuditWindowRow[]): AuditWindowAnalysis {
  const rowMap = new Map<string, AuditWindowRow>();
  for (const r of rows) {
    rowMap.set(r.row_hash, r);
  }

  let linkedPairs = 0;
  let edgeRows = 0;
  let forks = 0;
  let genesisCandidatesInWindow = 0;
  const seenPrevHashes = new Map<string, string | number>();
  const anomalies: string[] = [];

  for (const r of rows) {
    if (r.prev_hash === null) {
      genesisCandidatesInWindow++;
    } else {
      // Check for fork (two rows sharing identical non-null prev_hash)
      if (seenPrevHashes.has(r.prev_hash)) {
        forks++;
        anomalies.push(
          `Fork detected: audit_log entry ${r.id} and ${seenPrevHashes.get(r.prev_hash)} share identical prev_hash ${r.prev_hash.slice(0, 12)}...`,
        );
      } else {
        seenPrevHashes.set(r.prev_hash, r.id);
      }

      // Check parent linkage within window
      const parent = rowMap.get(r.prev_hash);
      if (parent) {
        if (String(parent.id) === String(r.id)) {
          anomalies.push(`Self-referential loop: audit_log entry ${r.id} has row_hash equal to its prev_hash.`);
        } else {
          linkedPairs++;
        }
      } else {
        edgeRows++;
      }
    }
  }

  return {
    linkedPairs,
    edgeRows,
    forks,
    genesisCandidatesInWindow,
    anomalies,
  };
}

/**
 * Tool: verify_tamper_evidence
 * Audits SHA-256 cryptographic chain continuity and verifies tamper evidence.
 * Invokes audit_chain_verify() and analyzes parent-child hash linkages across a recent window.
 * Strictly read-only; does not re-compute hashes in JS.
 * Allowed Roles: AUDITOR, SYSTEM_ADMIN
 */
export const verifyTamperEvidenceTool: IAgentTool<{
  windowSize?: number;
  entityType?: string;
  entityId?: string;
}> = {
  name: 'verify_tamper_evidence',
  description:
    'Audits tamper evidence and cryptographic hash chain continuity in audit_log. Runs audit_chain_verify() and analyzes windowed hash linkages.',
  parameters: z.object({
    windowSize: z
      .number()
      .int()
      .min(10)
      .max(500)
      .optional()
      .default(100)
      .describe('Window size of recent audit_log rows to analyze (default 100)'),
    entityType: z.string().optional().describe('Optional entity type to retrieve entity-specific audit trail'),
    entityId: z.string().uuid().optional().describe('Optional entity UUID to retrieve entity-specific audit trail'),
  }),
  allowedRoles: ['AUDITOR', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const windowSize = args.windowSize ?? 100;

      // 1. Run database function audit_chain_verify() (JOB-15)
      const verifyRes = await query<{ problems: string }>(`SELECT audit_chain_verify() AS problems`);
      const chainVerifyProblems = toNumber(verifyRes.rows[0]?.problems, 0);

      // 2. Fetch recent bounded window of audit_log metadata
      const windowRes = await query<{
        id: string;
        occurred_at: string;
        actor_id: string | null;
        actor_role: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        prev_hash: string | null;
        row_hash: string;
      }>(
        `SELECT id::text AS id, occurred_at::text AS occurred_at,
                actor_id::text AS actor_id, actor_role, action,
                entity_type, entity_id::text AS entity_id,
                prev_hash, row_hash
           FROM audit_log
          ORDER BY id DESC
          LIMIT $1`,
        [windowSize],
      );

      const rows = windowRes.rows;
      const windowAnalysis = analyzeAuditWindow(rows);

      // 3. Entity-specific audit trail if requested
      let entityAuditTrail: Array<{
        id: string;
        occurredAt: string;
        actorId: string | null;
        actorRole: string | null;
        action: string;
        entityType: string;
        entityId: string | null;
        rowHash: string;
      }> | undefined;

      if (args.entityType && args.entityId) {
        const entRes = await query<{
          id: string;
          occurred_at: string;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          row_hash: string;
        }>(
          `SELECT id::text AS id, occurred_at::text AS occurred_at,
                  actor_id::text AS actor_id, actor_role, action,
                  entity_type, entity_id::text AS entity_id, row_hash
             FROM audit_log
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY occurred_at ASC`,
          [args.entityType, args.entityId],
        );
        entityAuditTrail = entRes.rows.map((r) => ({
          id: r.id,
          occurredAt: r.occurred_at,
          actorId: r.actor_id,
          actorRole: r.actor_role,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          rowHash: r.row_hash,
        }));
      }

      return {
        success: true,
        data: {
          chainVerifyProblems,
          intact: chainVerifyProblems === 0,
          windowChecked: rows.length,
          linkedPairs: windowAnalysis.linkedPairs,
          edgeRows: windowAnalysis.edgeRows,
          forks: windowAnalysis.forks,
          genesisCandidatesInWindow: windowAnalysis.genesisCandidatesInWindow,
          anomalies: windowAnalysis.anomalies,
          checkedAt: new Date().toISOString(),
          note:
            'Cryptographic SHA-256 validation is computed natively inside PostgreSQL via audit_chain_verify(). 0 problems indicates continuous tamper-free integrity.',
          ...(entityAuditTrail ? { entityAuditTrail } : {}),
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to verify tamper evidence: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

// --- TOOL 4: submit_auditor_finding_proposal (TERMINAL / DRAFT_ONLY) ---

/**
 * Tool: submit_auditor_finding_proposal (Terminal Tool - DRAFT_ONLY)
 * Prepares formal human-in-the-loop compliance and audit findings for offline review or
 * inclusion in compliance reports (API-AD-005).
 * Strictly non-mutating with no backend action API route.
 * Allowed Roles: AUDITOR, SYSTEM_ADMIN
 */
export const submitAuditorFindingProposalTool: IAgentTool<{
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  findings: Array<{
    entityType: string;
    entityId: string;
    observation: string;
  }>;
  recommendedActions?: string[];
}> = {
  name: 'submit_auditor_finding_proposal',
  description:
    'Generates human-in-the-loop compliance finding documentation for administrative and regulatory review. Non-executable draft.',
  parameters: z.object({
    title: z.string().min(5).max(200).describe('Short descriptive title of the audit finding'),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).describe('Assessed audit compliance severity'),
    description: z.string().min(20).describe('Detailed regulatory and compliance narrative'),
    findings: z
      .array(
        z.object({
          entityType: z.string().describe('Target entity type e.g. transport_task, audit_log, drug_mapping'),
          entityId: z.string().describe('Target entity UUID or identifier'),
          observation: z.string().describe('Specific compliance discrepancy observed'),
        }),
      )
      .min(1)
      .max(20)
      .describe('List of specific compliance findings'),
    recommendedActions: z
      .array(z.string())
      .min(0)
      .max(10)
      .optional()
      .default([])
      .describe('Recommended remedial or corrective actions'),
  }),
  allowedRoles: ['AUDITOR', 'SYSTEM_ADMIN'],
  execute: async (args, _context: RequestContext): Promise<ToolResult> => {
    try {
      const sanitizedTitle = sanitizeErrorMessage(args.title);
      const sanitizedDescription = sanitizeErrorMessage(args.description);

      const sanitizedFindings = args.findings.map((f) => ({
        entityType: sanitizeErrorMessage(f.entityType),
        entityId: sanitizeErrorMessage(f.entityId),
        observation: sanitizeErrorMessage(f.observation),
      }));

      const sanitizedActions = (args.recommendedActions || []).map((action) =>
        sanitizeErrorMessage(action),
      );

      return {
        success: true,
        data: {
          status: 'DRAFT_ONLY',
          executable: false,
          requiresHumanReview: true,
          title: sanitizedTitle,
          severity: args.severity,
          description: sanitizedDescription,
          findings: sanitizedFindings,
          recommendedActions: sanitizedActions,
          note:
            'No backend mutation endpoint exists for auditor compliance findings. Drafted for human review or inclusion in compliance reports (API-AD-005).',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to draft auditor finding proposal: ${sanitizeErrorMessage(e.message)}`,
      };
    }
  },
};

/**
 * All 4 Auditor domain tools.
 */
export const auditorTools = [
  inspectAgentRunProvenanceTool,
  inspectNarcoticsChainOfCustodyTool,
  verifyTamperEvidenceTool,
  submitAuditorFindingProposalTool,
];
