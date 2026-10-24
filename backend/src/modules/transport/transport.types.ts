export type TransportStatus = 'WAITING_DISPATCH' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED';
export type Direction = 'all' | 'in' | 'out';

export const TRANSPORT_STATUSES: readonly TransportStatus[] = [
  'WAITING_DISPATCH',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED',
  'RECEIVED',
  'CANCELLED',
];

export interface HospitalRef {
  id: string;
  code: string;
  name: string;
}

export interface TransportLine {
  drugMasterId: string | null;
  drugName: string | null;
  baseUnit: string | null;
  coldChain: boolean;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
}

export interface TransportEventView {
  id: string;
  clientEventId: string;
  seq: number;
  toStatus: TransportStatus;
  capturedAt: string;
  receivedAt: string;
  applied: boolean;
  rejectReason: string | null;
  photoKeys: string[];
  temperatureC: number | null;
  actorName: string | null;
  actorRole: string | null;
}

export interface TransportTaskView {
  id: string;
  taskNo: string | null;
  version: number;
  kind: 'F1' | 'F2';
  /** A leg of an F3 emergency borrow request (kind stays F1: same borrow slip and transport flow). */
  emergency: boolean;
  refType: 'BORROW_LEG' | 'ALLOCATION_LINE';
  refId: string;
  /** `BR-2026-000126 · รอบ 1` or `AP-2026-000041 · บรรทัด 2`. */
  refLabel: string | null;
  status: TransportStatus;
  /** From the caller's hospital: OUT = leaves it, IN = arrives at it; null for region-wide users. */
  direction: 'OUT' | 'IN' | null;
  from: HospitalRef;
  to: HospitalRef;
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
  /** True while a driver event is captured but not yet applied (offline queue, FR-F2a-016). */
  pendingSync: boolean;
  lines: TransportLine[];
  events: TransportEventView[];
}

export interface TransportListQuery {
  direction: Direction;
  status?: TransportStatus;
  /** Only tasks that still need work (not RECEIVED / CANCELLED). */
  active: boolean;
  limit: number;
  offset: number;
}
