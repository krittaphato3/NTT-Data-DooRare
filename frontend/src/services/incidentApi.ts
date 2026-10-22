import { apiJson, apiJsonAll } from './apiFetch';

/** F3 emergency API (backend/src/modules/incidents). Shapes mirror the services' responses. */

export type TriageLevel = 'RED' | 'YELLOW' | 'GREEN' | 'BLACK' | 'UNKNOWN';
export type ApiCounts = Record<TriageLevel, number> & { total?: number };
export type ApiIncidentStatus = 'OPEN' | 'PLAN_REVIEW' | 'ACTIVE' | 'CLOSE_REQUESTED' | 'RECONCILED' | 'CANCELLED';
export type EmergencyClass = 'CRITICAL' | 'SUPPORTIVE';

export interface ApiEta {
  reportedMin: number | null;
  unsure: boolean;
  minutes: number | null;
  source: 'REPORTED' | 'ROUTE' | 'UNAVAILABLE';
  arrivalAt: string | null;
  remainingMin: number | null;
  remainingSec: number | null;
  flags: ('ETA_UNAVAILABLE' | 'ROUTE_UNAVAILABLE' | 'PATIENTS_ARRIVED')[];
}

export interface ApiIncidentSummary {
  id: string;
  incidentNo: string;
  status: ApiIncidentStatus;
  group: 'active' | 'closed' | 'cancelled';
  type: string | null;
  description: string | null;
  location: { text: string | null; lat: number | null; lon: number | null };
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  closedAt: string | null;
  cancelReason: string | null;
  duplicateOf: string | null;
  version: number;
  eta: ApiEta;
  counts: Required<ApiCounts>;
  plan: { id: string; revision: number; status: string } | null;
  borrow: { requests: number; waiting: number; confirmed: number; received: number; escalated: number };
}

export interface ApiRuleRow {
  triage: TriageLevel;
  perPatient: number;
  critical: boolean;
}

export interface ApiPlanKit {
  code: string;
  kitTypeId: string | null;
  name: string;
  class: EmergencyClass;
  estimated: number;
  critical: number;
  buffer: number;
  ready: number | null;
  useReady: number;
  pack: number;
  packMax: number | null;
  borrowSet: number;
  critUseReady: number | null;
  critPack: number | null;
  critBorrowSet: number | null;
  noRecipe: boolean;
  edited: boolean;
  rule: ApiRuleRow[];
}

export interface ApiPlanExtra {
  key: string;
  drugMasterId: string | null;
  name: string;
  unit: string | null;
  class: EmergencyClass;
  blood: boolean;
  estimated: number;
  critical: number;
  buffer: number;
  loose: number | null;
  useLoose: number | null;
  borrow: number;
  critBorrow: number | null;
  capped: boolean;
  edited: boolean;
  rule: ApiRuleRow[];
}

export interface PlanEdits {
  packOverrides?: Record<string, number>;
  removeKits?: string[];
  removeExtras?: string[];
  setKits?: Record<string, number>;
  setExtras?: Record<string, number>;
}

export interface ApiPlan {
  id: string | null;
  revision: number;
  status: 'DRAFT' | 'READY_FOR_APPROVAL' | 'AUTO_APPROVED' | 'APPROVED' | 'NEEDS_DISCUSSION' | 'TRANSPORTING' | 'COMPLETED' | 'CANCELLED';
  source: string;
  legacy: boolean;
  createdAt: string | null;
  approvedAt: string | null;
  approvedBy: { id: string; name: string } | null;
  agentRunId: string | null;
  counts: Record<TriageLevel, number> | null;
  edits: PlanEdits | null;
  kits: ApiPlanKit[];
  extras: ApiPlanExtra[];
  shortfall: { item: string; name: string; need: number; available: number; shortage: number }[];
  notes: { kind: string; text: string }[];
  steps: { step: number; kind: string | null; action: string }[];
}

export interface ApiBorrowLeg {
  id: string;
  lender: { id: string; code: string; name: string };
  round: number;
  status: 'PENDING' | 'SENT' | 'ACCEPTED' | 'PARTIAL' | 'REJECTED' | 'TIMED_OUT' | 'CANCELLED' | 'LOADED' | 'IN_TRANSIT' | 'RECEIVED';
  qtyAsked: number;
  qtyAccepted: number | null;
  qtyReceived: number | null;
  transitMin: number | null;
  sentAt: string | null;
  deadlineAt: string | null;
  remainingSec: number | null;
  respondedAt: string | null;
  rejectReason: string | null;
  lateForEta: boolean;
  mode: string | null;
  task: { id: string; taskNo: string; status: string } | null;
}

export interface ApiBorrowLine {
  requestId: string;
  requestNo: string;
  status: string;
  createdAt: string | null;
  item: { id: string; kind: 'KIT' | 'DRUG'; kitTypeId: string | null; kitCode: string | null; drugMasterId: string | null; name: string; unit: string; class: string; blood: boolean };
  qtyRequested: number;
  qtyConfirmed: number;
  qtyReceived: number;
  qtyMissing: number;
  legs: ApiBorrowLeg[];
}

export interface ApiKitTask {
  id: string;
  status: 'TODO' | 'DONE';
  qty: number;
  kit: { id: string; code: string; name: string };
  incident: { id: string; incidentNo: string; status: string; type: string | null; createdAt: string | null };
  plan: { id: string; revision: number; status: string };
  confirmedAt: string | null;
  confirmedBy: { id: string; name: string } | null;
  components: { drugMasterId: string; name: string; unit: string; perKit: number; need: number; free: number; enough: boolean }[];
  canConfirm: boolean;
}

export interface ApiUsage {
  id: string;
  kind: 'KIT' | 'DRUG';
  drugMasterId: string | null;
  kitTypeId: string | null;
  kitCode: string | null;
  name: string;
  unit: string;
  qtyUsed: number;
}

export interface ApiIncidentUpdate {
  at: string;
  action: string;
  by: string | null;
  role: string | null;
  changes: { triage: TriageLevel; label: string; from: number; to: number }[];
  note: string | null;
}

export interface ApiIncidentDetail extends Omit<ApiIncidentSummary, 'plan'> {
  plan: ApiPlan | null;
  approvedPlanId: string | null;
  plans: { id: string; revision: number; status: string; createdAt: string | null; approvedAt: string | null; approvedBy: { id: string; name: string } | null }[];
  borrowLines: ApiBorrowLine[];
  kitTasks: ApiKitTask[];
  usage: ApiUsage[];
  updates: ApiIncidentUpdate[];
  warnings: { code: string; message: string }[];
}

export interface ApiPreviewLine {
  key: string;
  kind: 'KIT' | 'DRUG';
  name: string;
  unit: string;
  class: EmergencyClass;
  blood: boolean;
  qty: number;
  covered: number;
  timeoutMin: number;
  mode: 'IN_TIME' | 'FASTEST_LATE' | 'ETA_UNKNOWN' | 'COVERED';
  lenders: { hospitalId: string; code: string; name: string; transitMin: number | null; inTime: boolean | null; available: number; askQty: number; chosen: boolean }[];
  warnings: { code: string; message: string }[];
}

export interface ApiBorrowPreview {
  etaRemainingMin: number | null;
  eta: { minutes: number | null; source: string; flags: string[] };
  lines: ApiPreviewLine[];
}

export interface ApiSendResult {
  created: { requestId: string; requestNo: string; name: string; qty: number; legs: number; mode: string; late: boolean }[];
  increased: { requestId: string; requestNo: string; name: string; qty: number; legs: number }[];
  reduced: { requestId: string; requestNo: string; name: string; qty: number; keptConfirmed: number }[];
  unchanged: string[];
  warnings: { code: string; line: string; message: string }[];
  sentLegs: number;
}

export interface ApiEmergencyLeg {
  id: string;
  round: number;
  status: ApiBorrowLeg['status'];
  request: { id: string; requestNo: string };
  borrower: { id: string; code: string; name: string };
  incident: { id: string; incidentNo: string; type: string | null; location: string | null; status: string; eta: { minutes: number | null; arrivalAt: string | null; remainingSec: number | null; source: string; flags: string[] } };
  item: { kind: 'KIT' | 'DRUG'; kitTypeId: string | null; drugMasterId: string | null; name: string; unit: string; class: string; blood: boolean };
  qtyRequested: number;
  qtyAsked: number;
  qtyAccepted: number | null;
  qtyReceived: number | null;
  available: number;
  transitMin: number | null;
  lateForEta: boolean;
  sentAt: string | null;
  deadlineAt: string | null;
  remainingSec: number | null;
  respondedAt: string | null;
  rejectReason: string | null;
  messageText: string | null;
  task: { id: string; taskNo: string; status: string } | null;
}

export interface ApiKitStockRow {
  kitTypeId: string;
  code: string;
  name: string;
  needsColdChain: boolean;
  ready: number;
  held: number;
  free: number;
  canPackMore: number;
  limitedBy: string | null;
  noRecipe: boolean;
  updatedAt: string | null;
}

export interface ApiReconciliation {
  incident: { id: string; incidentNo: string; status: string; type: string | null };
  borrowed: {
    lender: { id: string; code: string; name: string };
    items: { legId: string; legStatus: string; kind: 'KIT' | 'DRUG'; kitTypeId: string | null; drugMasterId: string | null; name: string; unit: string; qtyBorrowed: number; obligation: { id: string; qty: number; returned: number; outstanding: number; status: string; dueDate: string; mode: string } | null }[];
  }[];
  unusedBorrowed: { key: string; name: string; unit: string; borrowed: number; used: number; unused: number }[];
  usage: (ApiUsage & { valueThb: number | null })[];
  totals: { lenders: number; borrowedLines: number; outstandingReturns: number; usageValueThb: number; unpricedUsageLines: number };
  notes: string[];
}

type Wrapped<T> = { ok: true; id?: string; data: T };

const post = <T>(path: string, body: unknown = {}, key: string = crypto.randomUUID()) =>
  apiJson<T>(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) });

export const listIncidents = (status: 'active' | 'closed' | 'cancelled' | 'all' = 'all') => apiJsonAll<{ ok: true; items: ApiIncidentSummary[]; nextCursor: string | null }>(`/incidents?status=${status}&limit=200`);
export const getIncident = (id: string) => apiJson<Wrapped<ApiIncidentDetail>>(`/incidents/${id}`);

export interface CreateIncidentInput {
  incidentType: string;
  description?: string;
  locationText?: string;
  locationLat?: number;
  locationLon?: number;
  counts?: Partial<Record<TriageLevel, number>>;
  reportedEtaMin?: number;
  etaUnsure?: boolean;
  acknowledgeDuplicate?: boolean;
  duplicateOf?: string;
}
export const createIncident = (input: CreateIncidentInput) => post<Wrapped<ApiIncidentDetail>>('/incidents', input);
export const updateCounts = (id: string, input: { counts?: Partial<Record<TriageLevel, number>>; reportedEtaMin?: number | null; etaUnsure?: boolean; note?: string; version?: number; incidentType?: string; description?: string; locationText?: string }) =>
  apiJson<Wrapped<{ changes: { triage: TriageLevel; label: string; from: number; to: number }[]; newPlanRevision: number | null; detail: ApiIncidentDetail }>>(`/incidents/${id}/counts`, { method: 'PATCH', body: JSON.stringify(input) });

export const previewPlan = (id: string, edits?: PlanEdits) => post<Wrapped<{ preview: true; incident: { id: string; status: string; version: number }; plan: ApiPlan }>>(`/incidents/${id}/plan`, { preview: true, ...(edits ? { edits } : {}) });
export const calculatePlan = (id: string, edits?: PlanEdits) => post<Wrapped<{ incident: { id: string; status: string; version: number }; plan: ApiPlan }>>(`/incidents/${id}/plan`, edits ? { edits } : {});
export const approvePlan = (id: string, planId: string) => post<Wrapped<{ incident: { id: string; status: string; version: number }; plan: ApiPlan; packTasks: number }>>(`/incidents/${id}/plan/approve`, { planId });

export const previewBorrow = (id: string) => apiJson<Wrapped<ApiBorrowPreview>>(`/incidents/${id}/emergency-borrow/preview`);
export const sendBorrow = (id: string, lenderPlan?: Record<string, string[]>) => post<Wrapped<ApiSendResult>>(`/incidents/${id}/emergency-borrow`, lenderPlan ? { lenderPlan } : {});

export const listEmergencyLegs = (status: 'pending' | 'confirmed' | 'done' | 'declined' | 'all' = 'all') => apiJsonAll<{ ok: true; items: ApiEmergencyLeg[]; nextCursor: string | null }>(`/emergency-legs?limit=200${status === 'all' ? '' : `&status=${status}`}`);
export const confirmEmergencyLeg = (legId: string, body: { decision: 'CONFIRM' | 'PARTIAL' | 'REJECT'; qty?: number; reason?: string }) =>
  post<Wrapped<{ id: string; status: string; qtyAccepted?: number; remaining?: number; lateForEta?: boolean; nextRoundLegs?: number; escalated?: boolean }>>(`/emergency-legs/${legId}/confirm`, body);

export const listKitTasks = (incidentId?: string) => apiJsonAll<{ ok: true; items: ApiKitTask[]; nextCursor: string | null }>(`/kit-tasks?limit=200${incidentId ? `&incidentId=${incidentId}` : ''}`);
export const confirmKitTask = (id: string) => post<Wrapped<{ id: string; status: string; qty: number }>>(`/kit-tasks/${id}/confirm`);
export const getKitStock = () => apiJson<{ ok: true; items: ApiKitStockRow[] }>('/kit-stock');
export const setKitStock = (kitTypeId: string, qtyReady: number, reason?: string) => apiJson<Wrapped<{ kitTypeId: string; ready: number; held: number }>>(`/kit-stock/${kitTypeId}`, { method: 'PUT', body: JSON.stringify({ qtyReady, reason }) });

export const recordUsage = (id: string, lines: { drugMasterId?: string; kitTypeId?: string; qtyUsed: number }[]) => apiJson<Wrapped<{ usage: ApiUsage[]; changed: number }>>(`/incidents/${id}/usage`, { method: 'POST', body: JSON.stringify({ lines }) });
export const closeIncident = (id: string, body: { mode?: 'REQUEST' | 'APPROVE' | 'CANCEL'; reason?: string } = {}) => post<Wrapped<{ status: ApiIncidentStatus; detail: ApiIncidentDetail }>>(`/incidents/${id}/close`, body);
export const getReconciliation = (id: string) => apiJson<Wrapped<ApiReconciliation>>(`/incidents/${id}/reconciliation`);
