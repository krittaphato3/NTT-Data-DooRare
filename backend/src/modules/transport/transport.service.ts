import type { AuthSessionUser } from '../auth/auth.types.js';
import { toPage } from '../../core/pagination.js';
import type { PageParams } from '../../core/pagination.js';
import { pool } from '../../db/client.js';
import { transportRepository } from './transport.repository.js';
import type { TaskScope } from './transport.repository.js';
import type { TransportEventView, TransportLine, TransportListQuery, TransportTaskView } from './transport.types.js';

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

export function scopeFor(user: AuthSessionUser): TaskScope {
  return { hospitalId: user.hospitalId, driverId: user.role === 'DRIVER' ? user.id : null };
}

export function mapTask(
  row: Record<string, any>,
  user: AuthSessionUser,
  lines: TransportLine[],
  events: TransportEventView[],
): TransportTaskView {
  const hospitalId = user.hospitalId;
  const direction = !hospitalId ? null : row.from_hospital_id === hospitalId ? 'OUT' : row.to_hospital_id === hospitalId ? 'IN' : null;
  const hasCancel = row.cancel_requested_by || row.cancel_reason;
  return {
    id: row.id,
    taskNo: row.task_no,
    version: Number(row.version),
    kind: row.ref_type === 'BORROW_LEG' ? 'F1' : 'F2',
    emergency: row.borrow_context === 'EMERGENCY',
    refType: row.ref_type,
    refId: row.ref_id,
    refLabel: row.ref_label,
    status: row.status,
    direction,
    from: { id: row.from_hospital_id, code: row.from_code, name: row.from_name },
    to: { id: row.to_hospital_id, code: row.to_code, name: row.to_name },
    driver: row.driver_id ? { id: row.driver_id, name: row.driver_name } : null,
    vehicle: row.vehicle_id ? { id: row.vehicle_id, plate: row.vehicle_plate, hasColdBox: row.has_cold_box } : null,
    etaAt: iso(row.eta_at),
    createdAt: iso(row.created_at)!,
    loadedAt: iso(row.loaded_at),
    departedAt: iso(row.departed_at),
    arrivedAt: iso(row.arrived_at),
    receivedAt: iso(row.received_at),
    updatedAt: iso(row.updated_at)!,
    cancel: hasCancel
      ? {
          requestedBy: row.cancel_requested_code ?? null,
          consentBy: row.cancel_consent_code ?? null,
          reason: row.cancel_reason ?? null,
        }
      : null,
    coldChain: lines.some((line) => line.coldChain),
    pendingSync: events.some((event) => !event.applied && !event.rejectReason),
    lines,
    events,
  };
}

export class TransportService {
  async list(user: AuthSessionUser, params: TransportListQuery) {
    const page: PageParams = { limit: params.limit, offset: params.offset };
    const rows = await transportRepository.list(scopeFor(user), params);
    const slice = toPage(rows, page);
    const [lines, events] = await Promise.all([
      transportRepository.linesFor(pool, slice.items as { id: string; ref_type: string; ref_id: string }[]),
      transportRepository.eventsFor(pool, slice.items.map((row) => row.id)),
    ]);
    return {
      items: slice.items.map((row) => mapTask(row, user, lines.get(row.id) ?? [], events.get(row.id) ?? [])),
      nextCursor: slice.nextCursor,
    };
  }

  async listVehicles(user: AuthSessionUser) {
    const rows = await transportRepository.listVehicles(user.hospitalId);
    return rows.map((row) => ({
      id: row.id,
      hospitalId: row.hospital_id,
      hospitalCode: row.hospital_code,
      plate: row.plate,
      hasColdBox: row.has_cold_box,
      active: row.active,
      currentTaskId: row.current_task_id ?? null,
    }));
  }
}

export const transportService = new TransportService();
