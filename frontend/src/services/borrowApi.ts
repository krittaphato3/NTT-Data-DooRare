import { apiJson, apiJsonAll } from './apiFetch';

export type ApiRequestStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'PARTIALLY_FULFILLED' | 'ESCALATED' | 'FULFILLED' | 'CLOSED_UNFULFILLED' | 'CANCELLED';
export type ApiLegStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'PARTIAL' | 'REJECTED' | 'TIMED_OUT' | 'CANCELLED' | 'LOADED' | 'IN_TRANSIT' | 'RECEIVED';
export type ApiUrgency = 'NORMAL' | 'URGENT' | 'VERY_URGENT';

export interface ApiBorrowLeg {
  id: string;
  lender: { id: string; code: string; name: string };
  round: number;
  rank: number;
  status: ApiLegStatus;
  qtyAsked: number;
  qtyAccepted: number | null;
  qtyReceived: number | null;
  si: number | null;
  scoreParts: { time: number; fulfill: number; stockSafety: number; reliability: number } | null;
  transitMin: number | null;
  sentAt: string | null;
  deadlineAt: string | null;
  remainingSec: number | null;
  remindedAt: string | null;
  respondedAt: string | null;
  rejectReason: string | null;
  messageText: string | null;
}

export interface ApiLadderEntry {
  hospitalId: string;
  code: string;
  name: string;
  rank: number;
  si: number;
  parts: { time: number; fulfill: number; stockSafety: number; reliability: number };
  transitMin: number;
  lendable: number;
  stock: number;
  qtyPlanned: number;
  message: string | null;
  /** AGT-F1: why the agent picked this lender and quantity for the first round. */
  rationale?: string | null;
}

export interface ApiBorrowRequest {
  id: string;
  requestNo: string;
  status: ApiRequestStatus;
  context: 'STOCK_ALERT' | 'MANUAL' | 'EMERGENCY';
  urgency: ApiUrgency;
  reason: string | null;
  version: number;
  borrower: { id: string; code: string; name: string };
  drug: { id: string; kind?: 'DRUG' | 'KIT'; name: string; baseUnit: string; ved: 'V' | 'E' | 'D' | null; coldChain: boolean };
  qtyRequested: number;
  qtyFulfilled: number;
  rValue: number | null;
  firstRoundQty: number | null;
  stop: { threshold: number; effective: number; remaining: number; met: boolean } | null;
  alertId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  legs: ApiBorrowLeg[];
  proposal?: {
    need: { u: number; leadDays: number; required: number | null; stock: number; incoming: number; windowDays: number; urgency: ApiUrgency; ved: string; pattern: string; flags: string[] };
    ladder: ApiLadderEntry[];
    excluded: { hospitalId: string; code: string; reason: string | null }[];
    parallel: boolean;
    builtAt: string;
    agent?: { status: 'OK' | 'FALLBACK' | 'SKIPPED'; model: string | null; summary: string | null; confidence: string | null; flags: string[]; priorityAfter: string[] } | null;
  };
}

export interface ApiLenderLot { lotId: string; lotNo: string; expiryDate: string; manufacturer: string | null; free: number; daysLeft: number; lendable: boolean }
export interface ApiLenderItem {
  id: string;
  requestId: string;
  requestNo: string;
  round: number;
  status: ApiLegStatus;
  /** F3 only: TIMED_OUT but the emergency request still lacks goods, so it can be confirmed late. */
  canAnswerLate: boolean;
  urgency: ApiUrgency;
  reason: string | null;
  context: 'STOCK_ALERT' | 'MANUAL' | 'EMERGENCY';
  ved: 'V' | 'E' | 'D' | null;
  borrower: { id: string; code: string; name: string };
  drug: { id: string; name: string; baseUnit: string; coldChain: boolean };
  qtyAsked: number;
  qtyAccepted: number | null;
  qtyReceived: number | null;
  sentAt: string | null;
  deadlineAt: string | null;
  remainingSec: number | null;
  rejectReason: string | null;
  messageText: string | null;
  task: { id: string; taskNo: string; status: string } | null;
  lendable?: number;
  usableForLending?: number;
  ownTarget?: number;
  lots?: ApiLenderLot[];
}

const post = <T>(path: string, body: unknown = {}) =>
  apiJson<T>(path, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
type One = { ok: true; id: string; version: number; data: ApiBorrowRequest };

export const listBorrowRequests = (params: { status?: string; role?: 'borrower' | 'lender' | 'all'; limit?: number } = {}) => {
  const q = new URLSearchParams({ limit: String(params.limit ?? 200) });
  if (params.status) q.set('status', params.status);
  if (params.role) q.set('role', params.role);
  return apiJsonAll<{ ok: true; items: ApiBorrowRequest[]; nextCursor: string | null }>(`/borrow-requests?${q}`);
};
export const getBorrowRequest = (id: string) => apiJson<One>(`/borrow-requests/${id}`);

/** API-F1b-001. From an alert: `{ stockAlertId }`; manual: `{ context: 'MANUAL', items: [{ drugMasterId, qtyRequested }], reason }`. */
export const createBorrowRequest = (body: { stockAlertId?: string; context?: 'MANUAL'; items?: { drugMasterId: string; qtyRequested: number }[]; reason?: string }) => post<One>('/borrow-requests', body);
export const proposeBorrowRequest = (id: string) => post<One>(`/borrow-requests/${id}/propose`);
export const approveBorrowRequest = (id: string, version?: number, messages?: Record<string, string>) => post<One>(`/borrow-requests/${id}/approve`, { version, messages });
export const rejectBorrowRequest = (id: string, reason: string) => post<One>(`/borrow-requests/${id}/reject`, { reason });
export const cancelBorrowRequest = (id: string, reason: string) => post<One>(`/borrow-requests/${id}/cancel`, { reason });
/** Borrower stops waiting for a lender: that request is cancelled and the next lender of the ladder is asked now. */
export const skipBorrowLeg = (id: string, legId: string) => post<One>(`/borrow-requests/${id}/legs/${legId}/skip`);
export const escalateManual = (id: string, body: { lenderHospitalId: string; qty: number; reason: string }) => post<One>(`/borrow-requests/${id}/escalate-manual`, body);
export const editLadder = (id: string, body: { version?: number; legs?: { hospitalId: string; qty: number }[]; messages?: Record<string, string> }) =>
  apiJson<One>(`/borrow-requests/${id}/ladder`, { method: 'PATCH', body: JSON.stringify(body) });

export const listLenderQueue = (status?: string) =>
  apiJsonAll<{ ok: true; items: ApiLenderItem[]; nextCursor: string | null }>(`/lender-queue?limit=200${status ? `&status=${status}` : ''}`);

export interface RespondBody { decision: 'ACCEPT' | 'PARTIAL' | 'REJECT'; qty?: number; reason?: string; lots?: { lotId: string; qty: number }[] }
export const respondToLeg = (legId: string, body: RespondBody) =>
  post<{ ok: true; id: string; data: { id: string; status: ApiLegStatus; qtyAccepted?: number; task?: { id: string; taskNo: string }; requestStatus: string; nextRoundLegs: number } }>(`/borrow-legs/${legId}/respond`, body);
