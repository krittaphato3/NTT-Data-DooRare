import { apiFetch } from './apiFetch';
import type { AuthUser, LoginCredentials, LoginResponse, RoleAccountDemo, LoginEventItem } from '../types/auth';

const API_BASE = '/api/v1';

export async function checkHealth(): Promise<{ ok: boolean; message: string; version?: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, message: data.message || 'Database not available' };
    }
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: 'Cannot reach API server' };
  }
}

export async function getRoleAccounts(): Promise<RoleAccountDemo[]> {
  try {
    const res = await fetch(`${API_BASE}/auth/role-accounts`);
    if (!res.ok) throw new Error('Failed to fetch role accounts');
    const data = await res.json();
    return data.accounts || [];
  } catch (err) {
    console.warn('[authApi] getRoleAccounts fallback to standard list', err);
    // Standard mock fallback if server not reachable
    return [
      { id: 'u-pharma', email: 'pharmacist1.ha@example.org', display_name: 'สมหญิง มั่นคง', role: 'PHARMACIST', mfa_enabled: false, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['PHARMACIST'] },
      { id: 'u-hosp-admin', email: 'hospital_admin1.ha@example.org', display_name: 'จิราพร พงษ์ไพบูลย์', role: 'HOSPITAL_ADMIN', mfa_enabled: true, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['HOSPITAL_ADMIN'] },
      { id: 'u-sys-admin', email: 'system_admin1.region@example.org', display_name: 'มานพ เจริญผล', role: 'SYSTEM_ADMIN', mfa_enabled: true, hospital_code: 'REGION', hospital_name: 'สปสช. เขตสุขภาพที่ 6', all_roles: ['SYSTEM_ADMIN'] },
      { id: 'u-wh', email: 'warehouse_officer1.ha@example.org', display_name: 'ประเสริฐ ใจงาม', role: 'WAREHOUSE_OFFICER', mfa_enabled: false, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['WAREHOUSE_OFFICER'] },
      { id: 'u-er', email: 'er_staff1.ha@example.org', display_name: 'กมลชนก ใจดี', role: 'ER_STAFF', mfa_enabled: false, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['ER_STAFF'] },
      { id: 'u-drv', email: 'driver1.ha@example.org', display_name: 'สมชาย แก้วกล้า', role: 'DRIVER', mfa_enabled: false, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['DRIVER'] },
      { id: 'u-aud', email: 'auditor1.region@example.org', display_name: 'วิชัย มั่นคง', role: 'AUDITOR', mfa_enabled: true, hospital_code: 'REGION', hospital_name: 'กลุ่มงานตรวจสอบภายใน', all_roles: ['AUDITOR'] },
      { id: 'u-reg', email: 'region_admin1.region@example.org', display_name: 'ชาญชัย พงษ์ไพบูลย์', role: 'REGION_ADMIN', mfa_enabled: true, hospital_code: 'REGION', hospital_name: 'สำนักงานเขตสุขภาพที่ 6', all_roles: ['REGION_ADMIN'] },
      { id: 'u-dat', email: 'data_admin1.region@example.org', display_name: 'นันทพร แสนสุข', role: 'DATA_ADMIN', mfa_enabled: true, hospital_code: 'REGION', hospital_name: 'กลุ่มงานข้อมูลยา', all_roles: ['DATA_ADMIN'] },
      { id: 'u-pro', email: 'procurement_officer1.ha@example.org', display_name: 'สุพรรณี สิทธิชัย', role: 'PROCUREMENT_OFFICER', mfa_enabled: false, hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', all_roles: ['PROCUREMENT_OFFICER'] },
    ];
  }
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return await res.json();
}

export async function loginWithCognito(payload: { email?: string; sub: string; idToken?: string }): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/cognito`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

export async function logout(token?: string | null): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    console.warn('[authApi] logout error', err);
  }
}

export async function getMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function getRecentLogins(limit = 20, hospitalId?: string): Promise<{ events: LoginEventItem[]; onlineCount: number }> {
  try {
    let url = `${API_BASE}/auth/recent-logins?limit=${limit}`;
    if (hospitalId) url += `&hospitalId=${encodeURIComponent(hospitalId)}`;
    const res = await apiFetch(url.replace(API_BASE, ''));
    if (!res.ok) throw new Error('Failed to fetch recent logins');
    const data = await res.json();
    return { events: data.events || [], onlineCount: data.onlineCount || 0 };
  } catch (err) {
    console.warn('[authApi] getRecentLogins fallback', err);
    return { events: [], onlineCount: 0 };
  }
}
