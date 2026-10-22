import { apiJson } from './apiFetch';

export interface ApiUserRole {
  code: string;
  isPrimary: boolean;
}

export interface ApiHospital {
  id: string;
  code: string;
  name: string;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: ApiUserRole[];
  primaryRole: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  createdAt: string;
  loginCount: number;
  hospital: ApiHospital | null;
  region: { id: string; code: string; name: string } | null;
}

export interface ApiUsersListResponse {
  ok: boolean;
  items: ApiUser[];
  nextCursor: string | null;
}

export interface ApiUserCreateResponse {
  ok: boolean;
  id: string;
  data: ApiUser;
}

export interface ApiUserUpdateResponse {
  ok: boolean;
  id: string;
  data: ApiUser;
}

export interface ApiConfigOverride {
  value: unknown;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface ApiConfigItem {
  key: string;
  group: string;
  type: 'number' | 'boolean' | 'text';
  unit?: string;
  scope: 'HOSPITAL' | 'REGION' | 'GLOBAL' | 'DEFAULT';
  value: unknown;
  fileDefault: unknown;
  description: string;
  defaultSource: 'FILE' | 'CODE';
  min?: number;
  max?: number;
  readOnly: boolean;
  readOnlyReason?: string;
  editable: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
  overrides: {
    global?: ApiConfigOverride;
    region?: ApiConfigOverride;
    hospital?: ApiConfigOverride;
  };
}

export interface ApiConfigListResponse {
  ok: boolean;
  items: ApiConfigItem[];
  nextCursor: string | null;
}

export interface ApiConfigUpdateResponse {
  ok: boolean;
  data: {
    key: string;
    scope: string;
    value: unknown;
    previousValue: unknown;
    effectiveValue: unknown;
    type: 'number' | 'boolean' | 'text';
    updatedBy: { id: string; name: string };
    updatedAt: string;
  };
}

export interface ApiKillSwitchResponse {
  ok: boolean;
  data: {
    key: 'agent.enabled';
    scope: 'GLOBAL';
    enabled: boolean;
    previousEnabled: boolean | null;
    updatedBy: { id: string; name: string };
    updatedAt: string;
    reason: string;
  };
}

export interface ApiAuditActor {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface ApiAuditHospital {
  id: string;
  code: string | null;
  name: string | null;
}

export interface ApiAuditItem {
  id: string;
  occurredAt: string;
  actor: ApiAuditActor | null;
  hospital: ApiAuditHospital | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  agentRunId: string | null;
  requestId: string | null;
  prevHash: string | null;
  rowHash: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ApiAuditListResponse {
  ok: boolean;
  items: ApiAuditItem[];
  nextCursor: string | null;
}

export interface ApiAuditVerifyResponse {
  ok: boolean;
  data: {
    problems: number;
    intact: boolean;
    checkedAt: string;
  };
}

function appendCursor(path: string, cursor?: string | null): string {
  if (!cursor) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}cursor=${encodeURIComponent(cursor)}`;
}

export async function listUsers(params: Record<string, string> = {}, cursor?: string | null): Promise<ApiUsersListResponse> {
  const query = new URLSearchParams(params);
  let path = '/users';
  const qs = query.toString();
  if (qs) path += `?${qs}`;
  path = appendCursor(path, cursor);
  return apiJson<ApiUsersListResponse>(path);
}

export async function createUser(body: Record<string, unknown>, idempotencyKey: string): Promise<ApiUserCreateResponse> {
  return apiJson<ApiUserCreateResponse>('/users', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export async function updateUser(id: string, body: Record<string, unknown>): Promise<ApiUserUpdateResponse> {
  return apiJson<ApiUserUpdateResponse>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function listConfig(params: Record<string, string> = {}, cursor?: string | null): Promise<ApiConfigListResponse> {
  const query = new URLSearchParams(params);
  let path = '/config';
  const qs = query.toString();
  if (qs) path += `?${qs}`;
  path = appendCursor(path, cursor);
  return apiJson<ApiConfigListResponse>(path);
}

/** Follows `nextCursor` and returns every config item (the API caps a page at 200 rows). */
export async function listAllConfig(params: Record<string, string> = {}, maxPages = 10): Promise<ApiConfigItem[]> {
  const items: ApiConfigItem[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res: ApiConfigListResponse = await listConfig(params, cursor);
    items.push(...res.items);
    cursor = res.nextCursor;
    pages += 1;
  } while (cursor && pages < maxPages);
  return items;
}

export async function updateConfig(key: string, body: Record<string, unknown>, ifMatch?: string): Promise<ApiConfigUpdateResponse> {
  const headers: Record<string, string> = {};
  if (ifMatch) {
    headers['If-Match'] = ifMatch;
  }
  return apiJson<ApiConfigUpdateResponse>(`/config/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

export async function killSwitch(body: { enabled: boolean; reason: string }): Promise<ApiKillSwitchResponse> {
  return apiJson<ApiKillSwitchResponse>('/agent/kill-switch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listAudit(params: Record<string, string> = {}, cursor?: string | null): Promise<ApiAuditListResponse> {
  const query = new URLSearchParams(params);
  let path = '/audit-log';
  const qs = query.toString();
  if (qs) path += `?${qs}`;
  path = appendCursor(path, cursor);
  return apiJson<ApiAuditListResponse>(path);
}

export async function verifyAudit(): Promise<ApiAuditVerifyResponse> {
  return apiJson<ApiAuditVerifyResponse>('/audit-log/verify');
}
