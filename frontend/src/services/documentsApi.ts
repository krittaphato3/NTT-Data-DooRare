import { apiJson } from './apiFetch';

export type ApiDocKind = 'BORROW_SLIP' | 'RETURN_SLIP' | 'TRANSFER_SLIP' | 'INCIDENT_REPORT' | 'UCEP_REPORT';

export interface ApiDocParty {
  hospitalId: string;
  code: string;
  name: string;
  address: string | null;
}

export interface ApiDocLine {
  drugName: string | null;
  code: string | null;
  baseUnit: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
  coldChain: boolean;
}

export interface ApiDocPayload {
  docNo: string;
  kind: ApiDocKind;
  issuedAt: string;
  refLabel: string | null;
  partyA: ApiDocParty;
  partyB: ApiDocParty;
  lines: ApiDocLine[];
  delivery: { coldChain: boolean; instruction: string };
  returnTerms?: { mode: string; dueDate: string; text: string };
  signatures: string[];
}

export interface ApiDocument {
  id: string;
  docNo: string;
  kind: ApiDocKind;
  version: number;
  status: 'ISSUED' | 'VOID';
  refType: string;
  refId: string;
  hospital: { id: string; code: string } | null;
  counterparty: { id: string; code: string } | null;
  sha256: string;
  downloadUrl: string | null;
  createdAt: string;
  supersedesId: string | null;
  payload: ApiDocPayload;
}

export function listDocuments(params: { kind?: ApiDocKind; status?: 'ISSUED' | 'VOID'; limit?: number } = {}) {
  const q = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.kind) q.set('kind', params.kind);
  if (params.status) q.set('status', params.status);
  return apiJson<{ ok: true; items: ApiDocument[]; nextCursor: string | null }>(`/documents?${q}`);
}

/** API-XC-002: returns the existing document for the reference when it was already issued. */
export function createDocument(kind: ApiDocKind, refId: string) {
  return apiJson<{ ok: true; id: string; data: ApiDocument; existing: boolean }>('/documents', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ kind, refId }),
  });
}
