/** View types shared by the admin module (API-AD-001..004, -006, -007 + PATCH /users). */

export type ConfigScopeKind = 'HOSPITAL' | 'REGION' | 'GLOBAL' | 'DEFAULT';

export interface ConfigOverrideView {
  value: unknown;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface ConfigItemView {
  key: string;
  group: string;
  type: 'number' | 'boolean' | 'text';
  unit?: string;
  /** Where the effective value comes from. */
  scope: ConfigScopeKind;
  value: unknown;
  fileDefault: unknown;
  description: string;
  /** `true` when the default comes from code because the spec file has no entry. */
  defaultSource: 'FILE' | 'CODE';
  min?: number;
  max?: number;
  readOnly: boolean;
  readOnlyReason?: string;
  /** Whether the signed-in role may write this key at all (scope still applies). */
  editable: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
  overrides: {
    global?: ConfigOverrideView;
    region?: ConfigOverrideView;
    hospital?: ConfigOverrideView;
  };
}

export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface UserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: { code: string; isPrimary: boolean }[];
  primaryRole: string;
  status: UserStatus;
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  createdAt: string;
  loginCount: number;
  hospital: { id: string; code: string; name: string } | null;
  region: { id: string; code: string; name: string } | null;
}

export interface AuditLogItemView {
  id: string;
  occurredAt: string;
  actor: { id: string; name: string; email: string; role: string | null } | null;
  hospital: { id: string; code: string | null; name: string | null } | null;
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
