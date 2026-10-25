import { apiJson, apiJsonAll } from './apiFetch';

export type ApiExpiryStatus = 'DETECTED' | 'KEPT' | 'DISMISSED' | 'RELEASED_TO_POOL' | 'ALLOCATED' | 'TRANSFERRED';
export type ApiPlanStatus = 'DRAFT' | 'READY_FOR_APPROVAL' | 'AUTO_APPROVED' | 'APPROVED' | 'NEEDS_DISCUSSION' | 'TRANSPORTING' | 'COMPLETED' | 'CANCELLED';
export type ApiPlanOption = 'MERGE_SHIPMENTS' | 'RAISE_VALUE' | 'DONATE_OR_DISCARD' | 'HOLD';

/** `GET /near-expiry` item (backend/src/modules/expiry/nearExpiry.service.ts). */
export interface ApiNearExpiry {
  id: string;
  status: ApiExpiryStatus;
  expired: boolean;
  lot: { id: string; lotNo: string; expiryDate: string; freeQty: number; heldQty: number };
  drug: { hospitalDrugId: string; drugMasterId: string | null; name: string; localCode: string; localName: string; ved: 'V' | 'E' | 'D'; abc: string | null; unit: string; coldChain: boolean; mapping: string | null };
  qty: number;
  unitPrice: number;
  valueThb: number;
  daysLeft: number;
  thresholdDays: number;
  usePerDay: number;
  fefoUsable: number;
  releasable: number;
  repeatFlag: 'WATCH' | 'RECOMMEND' | null;
  detectedAt: string;
  releasedQty: number | null;
  poolEntryId: string | null;
  plan: { id: string; planNo: string } | null;
  note: string | null;
  reviewAfter: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  history: { lot: string; status: string; qty: number }[];
  version: number;
}

export interface ApiPoolEntry {
  id: string;
  /** The near-expiry item behind the pool entry (what `withdraw` takes). */
  itemId?: string;
  drug: { name: string; localCode: string; ved: 'V' | 'E' | 'D'; unit: string };
  lotNo: string;
  expiryDate: string;
  daysLeft: number;
  qtyAvailable: number;
  qtyInPlans: number;
  qtyReleased: number;
  unitPrice: number;
  valueThb: number;
  origin: { id: string; code: string; name: string };
  status: 'HELD' | 'IN_PLAN' | 'ALLOCATED';
  planNo: string | null;
  releasedBy: string | null;
  releasedAt: string;
}

export interface ApiPlan {
  id: string;
  planNo: string;
  status: ApiPlanStatus;
  version: number;
  drug: { name: string; localCode: string; ved: 'V' | 'E' | 'D'; unit: string; coldChain: boolean };
  lot: { lotNo: string; expiryDate: string; daysLeft: number };
  origin: { id: string; code: string; name: string };
  qty: number;
  unitValue: number;
  lines: { id: string; receiver: { id: string; code: string; name: string }; qty: number; valueThb: number; distanceKm: number; transportCostThb: number; coldChain: boolean; task: { id: string; taskNo: string; status: string } | null }[];
  totalValueThb: number;
  transportCostThb: number;
  costRatio: number | null;
  costRatioPct: number | null;
  economical: boolean;
  option: ApiPlanOption | null;
  options: { id: ApiPlanOption; label: string }[];
  approvals: { hospital: { id: string; code: string; name: string }; kind: ApiPlanPartyKind; decision: 'PENDING' | 'APPROVED' | 'REJECTED'; decidedAt: string | null; decidedBy: string | null; comment: string | null }[];
  myDecision: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  isOrigin: boolean;
  /** The viewer's hospital takes part; other hospitals of the region only see plans they may still object to. */
  involved: boolean;
  myKind: ApiPlanPartyKind | null;
  canObject: boolean;
  /** AGT-F2-001 run behind the plan (null = written by the owner pharmacist). */
  agent: { status: 'OK' | 'FALLBACK' | 'SKIPPED' | string; model: string | null; summary: string | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null; flags: string[] } | null;
  approvalDeadline: string | null;
  cancelRequestedBy: string | null;
  agentRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApiPlanPartyKind = 'ORIGIN' | 'RECEIVER' | 'OBJECTOR';

/** `GET /pool/{id}/candidates`: receivers the code finds for a pool lot, with the F-22 quantity each can use before expiry. */
export interface ApiPoolCandidates {
  poolEntryId: string;
  drug: { name: string; unit: string };
  lotNo: string;
  daysLeft: number;
  qtyAvailable: number;
  unitPrice: number;
  isOrigin: boolean;
  blocker: string | null;
  candidates: {
    hospital: { id: string; code: string; name: string };
    maxQty: number;
    deficit: number;
    usePerDay: number;
    daysOfStock: number;
    distanceKm: number;
    transitDays: number;
    transportCostThb: number;
    canUseBeforeExpiry: boolean;
  }[];
}

export interface ApiAgentPlanResult {
  plan: { planId: string; planNo: string; status: string };
  agent: { runId: string; status: 'OK' | 'FALLBACK' | 'SKIPPED'; model: string | null; summary: string | null; confidence: string | null; flags: string[] };
}

export interface ApiRepeatFlag {
  id: string;
  drug: { id: string; name: string; unit: string };
  level: 'WATCH' | 'RECOMMEND';
  lots12m: number;
  valueThb12m: number | null;
  suggestion: Record<string, unknown> | null;
  dismissedUntil: string | null;
}

export interface ApiValue {
  ok: true;
  months: number;
  totals: { transferredValueThb: number; transportCostThb: number; netSavedThb: number; completedPlans: number; expiredWriteOffThb: number; stockoutItemDays: number };
  byMonth: { period: string; transferredValueThb: number; expiredWriteOffThb: number; stockoutItemDays: number }[];
}

export interface ApiReport {
  ok: true;
  id: string;
  name: string;
  generatedAt: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}

type One<T> = { ok: true; id: string; version: number; data: T };
const post = <T>(path: string, body: unknown = {}) => apiJson<T>(path, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });

export const listNearExpiry = () => apiJsonAll<{ ok: true; items: ApiNearExpiry[]; nextCursor: string | null }>('/near-expiry?limit=200');
/** Runs the near-expiry scan now (the server also runs it on a timer): lots that entered the threshold show up for review. */
export const scanNearExpiryNow = () => post<{ ok: true; detected: number; reevaluated: number; refreshed: number; writeOffs: number; timedOutPlans: number; repeatFlags: number }>('/near-expiry/scan');
export const releaseNearExpiry = (id: string, qty: number, version?: number) => post<One<ApiNearExpiry>>(`/near-expiry/${id}/release`, { qty, version });
export const keepNearExpiry = (id: string, reason: string, version?: number) => post<One<ApiNearExpiry>>(`/near-expiry/${id}/keep`, { reason, version });
export const dismissNearExpiry = (id: string, reason: string) => post<One<ApiNearExpiry>>(`/near-expiry/${id}/dismiss`, { reason });
export const withdrawNearExpiry = (id: string, reason: string) => post<One<ApiNearExpiry>>(`/near-expiry/${id}/withdraw`, { reason });

export const listPool = () => apiJsonAll<{ ok: true; items: ApiPoolEntry[]; nextCursor: string | null }>('/pool?limit=200');
export const listPlans = () => apiJsonAll<{ ok: true; items: ApiPlan[]; nextCursor: string | null }>('/allocation-plans?limit=200');
export const decidePlan = (id: string, decision: 'APPROVED' | 'REJECTED', version: number, comment?: string, approveAll?: boolean, lines?: { receiver: string; qty: number }[]) => post<One<ApiPlan>>(`/allocation-plans/${id}/decision`, { decision, version, comment, approveAll, lines });
export const choosePlanOption = (id: string, option: ApiPlanOption, version: number, reason?: string) => post<One<ApiPlan>>(`/allocation-plans/${id}/option`, { option, version, reason });
export const getPoolCandidates = (id: string) => apiJson<{ ok: true; data: ApiPoolCandidates }>(`/pool/${id}/candidates`);
/** AGT-F2-001: the allocation agent proposes the split (the code checks it, or uses its own F-22 split as fallback). */
export const sendPoolToAgent = (id: string) => post<{ ok: true; data: ApiAgentPlanResult }>(`/pool/${id}/agent-plan`);
export const createAllocationPlan = (poolEntryId: string, lines: { receiverHospitalId: string; qty: number }[]) => post<One<ApiPlan>>('/allocation-plans', { poolEntryId, lines });
/** An involved pharmacist changes the split of an open plan; every hospital then approves again (the reviser's own approval is included). */
export const revisePlan = (id: string, version: number, lines: { receiverHospitalId: string; qty: number }[], note: string) => post<One<ApiPlan>>(`/allocation-plans/${id}/revise`, { version, lines, note });
export const objectPlan = (id: string, reason: string) => post<One<ApiPlan>>(`/allocation-plans/${id}/objection`, { reason });
export const cancelPlan = (id: string, reason: string) => post<One<ApiPlan> & { state: 'CANCEL_REQUESTED' | 'CANCELLED' }>(`/allocation-plans/${id}/cancel`, { reason });

export const listRepeatExpiry = () => apiJson<{ ok: true; items: ApiRepeatFlag[] }>('/repeat-expiry');
export const dismissRepeatExpiry = (id: string) => post<{ ok: true }>(`/repeat-expiry/${id}/dismiss`);
export const getValue = (months = 12) => apiJson<ApiValue>(`/value?months=${months}`);
export const getReport = (id: string, months = 12) => apiJson<ApiReport>(`/reports/${id}?months=${months}`);
