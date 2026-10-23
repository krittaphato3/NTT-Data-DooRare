import { apiJson, apiJsonAll } from './apiFetch';

export type ApiReturnStatus = 'OPEN' | 'REMINDED' | 'RETURNED' | 'OVERDUE' | 'WAIVED';

export interface ApiReturnObligation {
  id: string;
  legId: string;
  requestNo: string;
  roundNo: number | null;
  status: ApiReturnStatus;
  returnMode: 'IN_KIND' | 'BLOOD_REPLACEMENT';
  direction: 'OWE' | 'OWED' | null;
  drug: { id: string | null; name: string | null; baseUnit: string | null; ved: 'V' | 'E' | 'D' | null };
  /** Set when the obligation is a whole F3 kit (then `drug.id` is null). */
  kitTypeId?: string | null;
  qty: number;
  qtyReturned: number;
  qtyRemaining: number;
  dueDate: string;
  pastDue: boolean;
  returnedAt: string | null;
  waived: { reason: string | null; by: string | null; byName: string | null; at: string | null } | null;
  debtor: { id: string; code: string; name: string };
  creditor: { id: string; code: string; name: string };
  receipts: { id: string; qty: number; lotNo: string | null; expiryDate: string | null; receivedAt: string; receivedBy: string | null }[];
}

export function listReturnObligations(params: { direction?: 'all' | 'owe' | 'owed'; status?: ApiReturnStatus; limit?: number; requestId?: string; requestNo?: string } = {}) {
  const q = new URLSearchParams({ limit: String(params.limit ?? 200) });
  if (params.direction) q.set('direction', params.direction);
  if (params.status) q.set('status', params.status);
  if (params.requestId) q.set('requestId', params.requestId);
  if (params.requestNo) q.set('requestNo', params.requestNo);
  return apiJsonAll<{ ok: true; items: ApiReturnObligation[]; nextCursor: string | null }>(`/return-obligations?${q}`);
}

/** API-XC-004: record (part of) a return in kind; stock moves FEFO from the debtor to the creditor. */
export function recordReturn(id: string, qty: number) {
  return apiJson<{ ok: true; id: string; data: ApiReturnObligation }>(`/return-obligations/${id}/return`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ qty }),
  });
}

/** API-XC-005: waive the remaining quantity (reason is audited). */
export function waiveReturn(id: string, reason: string) {
  return apiJson<{ ok: true; id: string; data: ApiReturnObligation }>(`/return-obligations/${id}/waive`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
