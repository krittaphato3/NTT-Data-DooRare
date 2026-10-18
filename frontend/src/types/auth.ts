import type { RoleCode } from '../lib/rbac';

export interface AuthUser {
  id: string;
  cognitoSub: string;
  email: string;
  name: string;
  role: RoleCode;
  roleTh: string;
  hospitalId: string | null;
  hospitalCode: string;
  hospitalName: string;
  regionId: string | null;
  mfaEnabled: boolean;
  additionalRoles: RoleCode[];
  allRoles: RoleCode[];
  phone?: string | null;
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  scopeLabel: string;
  initial: string;
}

export interface RoleAccountDemo {
  id: string;
  email: string;
  display_name: string;
  role: RoleCode;
  mfa_enabled: boolean;
  hospital_code: string;
  hospital_name: string;
  tier?: string;
  all_roles: RoleCode[];
}

export interface LoginEventItem {
  id: number;
  user_id: string | null;
  email: string;
  occurred_at: string;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  device: string | null;
  browser: string | null;
  user_agent: string | null;
  display_name?: string | null;
  role?: string | null;
  hospital_name?: string | null;
}

export interface LoginCredentials {
  email: string;
  password?: string;
  otp?: string;
  skipPassword?: boolean;
  mfaVerified?: boolean;
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  user?: AuthUser;
  requireMfa?: boolean;
  email?: string;
  name?: string;
  role?: string;
  error?: string;
  code?: string;
  message?: string;
}
