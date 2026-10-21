import { apiJson } from './apiFetch';

export type ApiTransportStatus = 'WAITING_DISPATCH' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED';

export interface ApiHospitalRef {
  id: string;
  code: string;
  name: string;
}

export interface ApiTransportLine {
  drugMasterId: string | null;
  drugName: string | null;
  baseUnit: string | null;
  coldChain: boolean;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
}

export interface ApiTransportEvent {
  id: string;
  toStatus: ApiTransportStatus;
  capturedAt: string;
  receivedAt: string;
  applied: boolean;
  rejectReason: string | null;
  photoKeys: string[];
  temperatureC: number | null;
  actorName: string | null;
  actorRole: string | null;
}

/** `GET /transport-tasks` item (backend/src/modules/transport/transport.types.ts). */
export interface ApiTransportTask {
  id: string;
  taskNo: string | null;
  version: number;
  kind: 'F1' | 'F2';
  refType: 'BORROW_LEG' | 'ALLOCATION_LINE';
  refId: string;
  refLabel: string | null;
  status: ApiTransportStatus;
  direction: 'OUT' | 'IN' | null;
  from: ApiHospitalRef;
  to: ApiHospitalRef;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate: string; hasColdBox: boolean } | null;
  etaAt: string | null;
  createdAt: string;
  loadedAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  receivedAt: string | null;
  updatedAt: string;
  cancel: { requestedBy: string | null; consentBy: string | null; reason: string | null } | null;
  coldChain: boolean;
  pendingSync: boolean;
  lines: ApiTransportLine[];
  events: ApiTransportEvent[];
}

export interface ApiVehicle {
  id: string;
  hospitalId: string;
  hospitalCode: string;
  plate: string;
  hasColdBox: boolean;
  active: boolean;
  currentTaskId: string | null;
}

export function getTransportTasks(params: { direction?: 'all' | 'in' | 'out'; active?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams();
  q.set('limit', String(params.limit ?? 200));
  if (params.direction) q.set('direction', params.direction);
  if (params.active !== undefined) q.set('active', String(params.active));
  return apiJson<{ ok: true; items: ApiTransportTask[]; nextCursor: string | null }>(`/transport-tasks?${q}`);
}

export function getVehicles() {
  return apiJson<{ ok: true; items: ApiVehicle[] }>('/vehicles');
}

/** API-F2a-013. Idempotency-Key makes a double click / retry safe. */
export function advanceTransportTask(
  taskId: string,
  body: { toStatus: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED'; version: number; photoKeys?: string[]; qtyReceived?: number; reason?: string },
) {
  return apiJson<{ ok: true; id: string; version: number; data: ApiTransportTask }>(`/transport-tasks/${taskId}/status`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

/** Uploads one compressed photo; returns the key to send in `photoKeys`. */
export function uploadTransportPhoto(taskId: string, dataBase64: string) {
  return apiJson<{ ok: true; photoKey: string; size: number }>(`/transport-tasks/${taskId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ dataBase64 }),
  });
}
