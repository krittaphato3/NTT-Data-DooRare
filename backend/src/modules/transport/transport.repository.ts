import { query } from '../../db/client.js';
import type { Db } from '../../db/tx.js';
import type { TransportLine, TransportEventView, TransportListQuery } from './transport.types.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;

export interface TaskScope {
  /** null = region-wide (system/region admin). */
  hospitalId: string | null;
  /** Set for the DRIVER role: only tasks assigned to this user. */
  driverId: string | null;
}

export const TASK_SELECT = `
  SELECT tt.id, tt.task_no, tt.version, tt.ref_type, tt.ref_id, tt.status::text AS status,
         tt.from_hospital_id, fh.code AS from_code, COALESCE(fh.name_en, fh.name_th) AS from_name,
         tt.to_hospital_id,   th.code AS to_code,   COALESCE(th.name_en, th.name_th) AS to_name,
         tt.driver_id, dr.display_name AS driver_name,
         tt.vehicle_id, v.plate AS vehicle_plate, v.has_cold_box,
         tt.eta_at, tt.created_at, tt.loaded_at, tt.departed_at, tt.arrived_at, tt.received_at, tt.updated_at,
         tt.cancel_requested_by, cr.code AS cancel_requested_code, tt.cancel_consent_by, cc.code AS cancel_consent_code, tt.cancel_reason,
         br.context::text AS borrow_context,
         CASE WHEN tt.ref_type = 'BORROW_LEG' THEN br.request_no || ' · รอบ ' || bl.round_no
              ELSE ap.plan_no || ' · บรรทัด ' || (SELECT count(*) FROM allocation_line x WHERE x.plan_id = al.plan_id AND x.id <= al.id)
         END AS ref_label
    FROM transport_task tt
    JOIN hospital fh ON fh.id = tt.from_hospital_id
    JOIN hospital th ON th.id = tt.to_hospital_id
    LEFT JOIN app_user dr ON dr.id = tt.driver_id
    LEFT JOIN vehicle v ON v.id = tt.vehicle_id
    LEFT JOIN hospital cr ON cr.id = tt.cancel_requested_by
    LEFT JOIN hospital cc ON cc.id = tt.cancel_consent_by
    LEFT JOIN borrow_leg bl ON tt.ref_type = 'BORROW_LEG' AND bl.id = tt.ref_id
    LEFT JOIN borrow_request br ON br.id = bl.request_id
    LEFT JOIN allocation_line al ON tt.ref_type = 'ALLOCATION_LINE' AND al.id = tt.ref_id
    LEFT JOIN allocation_plan ap ON ap.id = al.plan_id
`;

export class TransportRepository {
  async list(scope: TaskScope, params: TransportListQuery): Promise<Record<string, any>[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (scope.hospitalId) {
      if (params.direction === 'out') add('tt.from_hospital_id = ?', scope.hospitalId);
      else if (params.direction === 'in') add('tt.to_hospital_id = ?', scope.hospitalId);
      else {
        values.push(scope.hospitalId);
        where.push(`(tt.from_hospital_id = $${values.length} OR tt.to_hospital_id = $${values.length})`);
      }
    }
    if (scope.driverId) add('tt.driver_id = ?', scope.driverId);
    if (params.status) add('tt.status = ?::transport_status', params.status);
    if (params.active) where.push(`tt.status NOT IN ('RECEIVED', 'CANCELLED')`);
    values.push(params.limit + 1, params.offset);
    const sql = `${TASK_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (tt.status IN ('RECEIVED', 'CANCELLED')), tt.created_at DESC, tt.id
      LIMIT $${values.length - 1} OFFSET $${values.length}`;
    return (await query(sql, values)).rows;
  }

  async getById(db: Db, id: string, forUpdate = false): Promise<Record<string, any> | null> {
    const result = await db.query(`${TASK_SELECT} WHERE tt.id = $1${forUpdate ? ' FOR UPDATE OF tt' : ''}`, [id]);
    return result.rows[0] ?? null;
  }

  /** Lines (drug / lot / qty) of the given tasks, keyed by task id. */
  async linesFor(db: Db, tasks: { id: string; ref_type: string; ref_id: string }[]): Promise<Map<string, TransportLine[]>> {
    const lines = new Map<string, TransportLine[]>();
    const taskByRef = new Map(tasks.map((t) => [`${t.ref_type}:${t.ref_id}`, t.id]));
    const legIds = tasks.filter((t) => t.ref_type === 'BORROW_LEG').map((t) => t.ref_id);
    const lineIds = tasks.filter((t) => t.ref_type === 'ALLOCATION_LINE').map((t) => t.ref_id);
    const push = (key: string, row: Record<string, any>): void => {
      const taskId = taskByRef.get(key);
      if (!taskId) return;
      const list = lines.get(taskId) ?? [];
      list.push({
        drugMasterId: row.drug_master_id ?? null,
        drugName: row.drug_name ?? null,
        baseUnit: row.base_unit ?? null,
        coldChain: Boolean(row.cold_chain),
        lotNo: row.lot_no ?? null,
        expiryDate: row.expiry_date ?? null,
        qty: Number(row.qty),
      });
      lines.set(taskId, list);
    };
    if (legIds.length) {
      const result = await db.query(
        `SELECT bl.id AS ref_id, dm.id AS drug_master_id,
                COALESCE(${DRUG_NAME}, kt.name) AS drug_name, COALESCE(dm.base_unit, 'ชุด') AS base_unit,
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
          WHERE bl.id = ANY($1::uuid[])
          ORDER BY sl.expiry_date NULLS LAST, sl.lot_no`,
        [legIds],
      );
      for (const row of result.rows) push(`BORROW_LEG:${row.ref_id}`, row);
    }
    if (lineIds.length) {
      const result = await db.query(
        `SELECT al.id AS ref_id, dm.id AS drug_master_id, ${DRUG_NAME} AS drug_name, dm.base_unit,
                dm.is_cold_chain AS cold_chain, sl.lot_no, sl.expiry_date::text AS expiry_date, al.qty
           FROM allocation_line al
           JOIN allocation_plan ap ON ap.id = al.plan_id
           JOIN pool_entry pe ON pe.id = ap.pool_entry_id
           JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
           JOIN stock_lot sl ON sl.id = ne.lot_id
           JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
           JOIN drug_master dm ON dm.id = hd.drug_master_id
          WHERE al.id = ANY($1::uuid[])`,
        [lineIds],
      );
      for (const row of result.rows) push(`ALLOCATION_LINE:${row.ref_id}`, row);
    }
    return lines;
  }

  async eventsFor(db: Db, taskIds: string[]): Promise<Map<string, TransportEventView[]>> {
    const events = new Map<string, TransportEventView[]>();
    if (taskIds.length === 0) return events;
    const result = await db.query(
      `SELECT te.id, te.client_event_id, te.seq, te.task_id, te.to_status::text AS to_status, te.captured_at, te.received_at, te.applied, te.reject_reason,
              te.photo_keys, te.temperature_c::float8 AS temperature_c, u.display_name, u.role::text AS role
         FROM transport_event te
         LEFT JOIN app_user u ON u.id = te.actor_id
        WHERE te.task_id = ANY($1::uuid[])
        ORDER BY te.captured_at, te.seq`,
      [taskIds],
    );
    for (const row of result.rows) {
      const list = events.get(row.task_id) ?? [];
      list.push({
        id: row.id,
        clientEventId: row.client_event_id,
        seq: Number(row.seq),
        toStatus: row.to_status,
        capturedAt: new Date(row.captured_at).toISOString(),
        receivedAt: new Date(row.received_at).toISOString(),
        applied: row.applied,
        rejectReason: row.reject_reason,
        photoKeys: row.photo_keys ?? [],
        temperatureC: row.temperature_c,
        actorName: row.display_name,
        actorRole: row.role,
      });
      events.set(row.task_id, list);
    }
    return events;
  }

  async listVehicles(hospitalId: string | null): Promise<Record<string, any>[]> {
    const result = await query(
      `SELECT v.id, v.hospital_id, h.code AS hospital_code, v.plate, v.has_cold_box, v.active,
              (SELECT t.id FROM transport_task t WHERE t.vehicle_id = v.id AND t.status NOT IN ('RECEIVED', 'CANCELLED')
                ORDER BY t.created_at DESC LIMIT 1) AS current_task_id
         FROM vehicle v JOIN hospital h ON h.id = v.hospital_id
        WHERE ($1::uuid IS NULL OR v.hospital_id = $1::uuid)
        ORDER BY h.code, v.plate`,
      [hospitalId],
    );
    return result.rows;
  }
}

export const transportRepository = new TransportRepository();
