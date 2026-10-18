export interface AppUserEntity {
  id: string;
  cognito_sub: string;
  email: string;
  display_name: string;
  role: string;
  hospital_id: string | null;
  region_id: string | null;
  phone: string | null;
  active: boolean;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date;
  hospital_code?: string | null;
  hospital_name?: string | null;
  region_code?: string | null;
  region_name?: string | null;
  additional_roles?: string[];
}

export interface LoginEventEntity {
  id: number;
  user_id: string | null;
  email: string;
  occurred_at: Date;
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

export interface LoginDto {
  email: string;
  password?: string;
  otp?: string;
  skipPassword?: boolean;
  mfaVerified?: boolean;
}

export interface AuthSessionUser {
  id: string;
  cognitoSub: string;
  email: string;
  name: string;
  role: string;
  roleTh: string;
  hospitalId: string | null;
  hospitalCode: string;
  hospitalName: string;
  regionId: string | null;
  mfaEnabled: boolean;
  additionalRoles: string[];
  allRoles: string[];
  phone?: string | null;
  lastLoginAt: string;
  scopeLabel: string;
  initial: string;
}

export interface RoleAccountDemo {
  id: string;
  email: string;
  display_name: string;
  role: string;
  mfa_enabled: boolean;
  hospital_code: string;
  hospital_name: string;
  tier?: string;
  all_roles: string[];
}
