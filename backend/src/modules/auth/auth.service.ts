import { authRepository, AuthRepository } from './auth.repository.js';
import type { LoginDto, AuthSessionUser, RoleAccountDemo, LoginEventEntity } from './auth.types.js';
import type { ClientMeta } from '../../middleware/clientMeta.js';
import { config } from '../../config/env.js';

function getRoleThai(role: string): string {
  const map: Record<string, string> = {
    SYSTEM_ADMIN: 'ผู้ดูแลระบบกลาง (System Admin)',
    HOSPITAL_ADMIN: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)',
    PHARMACIST: 'เภสัชกร (Pharmacist)',
    PROCUREMENT_OFFICER: 'เจ้าหน้าที่จัดซื้อ (Procurement)',
    WAREHOUSE_OFFICER: 'เจ้าหน้าที่คลัง (Warehouse)',
    ER_STAFF: 'พยาบาลห้องฉุกเฉิน (ER Staff)',
    DRIVER: 'พนักงานขับรถขนส่ง (Driver)',
    AUDITOR: 'ผู้ตรวจสอบภายใน (Auditor)',
    REGION_ADMIN: 'ผู้บริหารเขตสุขภาพ (Region Admin)',
    DATA_ADMIN: 'ผู้ดูแลข้อมูลยา (Data Admin)',
  };
  return map[role] || role;
}

export class AuthService {
  private activeSessions = new Map<string, { userId: string; email: string; role: string; createdAt: number }>();

  constructor(private repo: AuthRepository = authRepository) {}

  async login(
    dto: LoginDto,
    meta?: ClientMeta
  ): Promise<{ ok: boolean; token?: string; user?: AuthSessionUser; requireMfa?: boolean; message?: string; error?: string; code?: string; status: number }> {
    const email = dto.email.trim().toLowerCase();
    const password = (dto.password || '').trim();
    const otp = (dto.otp || '').trim();

    if (!email) {
      return { ok: false, status: 400, code: 'VALIDATION', error: 'กรุณากรอกอีเมลผู้ใช้งาน' };
    }

    const user = await this.repo.findUserByEmail(email);

    if (!user) {
      await this.repo.recordLoginEvent({
        userId: null,
        email,
        success: false,
        failureReason: 'ไม่พบบัญชีผู้ใช้',
        meta,
      });
      return {
        ok: false,
        status: 401,
        code: 'USER_NOT_FOUND',
        error: `ไม่พบบัญชีผู้ใช้งาน "${email}" ในระบบ กรุณาตรวจสอบอีเมลอีกครั้ง`,
      };
    }

    if (!user.active) {
      await this.repo.recordLoginEvent({
        userId: user.id,
        email: user.email,
        success: false,
        failureReason: 'บัญชีถูกระงับการใช้งาน',
        meta,
      });
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_SUSPENDED',
        error: `บัญชีผู้ใช้งานนี้ (${user.display_name}) ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ`,
      };
    }

    const isMasterPass =
      password === config.security.masterPassword ||
      password === 'password' ||
      password === 'admin';

    if (!isMasterPass && !dto.skipPassword) {
      await this.repo.recordLoginEvent({
        userId: user.id,
        email: user.email,
        success: false,
        failureReason: 'รหัสผ่านไม่ถูกต้อง',
        meta,
      });
      return {
        ok: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        error: `รหัสผ่านไม่ถูกต้อง (สำหรับทดสอบสามารถใช้ ${config.security.masterPassword})`,
      };
    }

    if (user.mfa_enabled && !dto.mfaVerified) {
      if (otp) {
        if (otp.length !== 6 || !/^\d+$/.test(otp)) {
          await this.repo.recordLoginEvent({
            userId: user.id,
            email: user.email,
            success: false,
            failureReason: 'MFA ไม่ผ่าน',
            meta,
          });
          return {
            ok: false,
            status: 401,
            code: 'MFA_FAILED',
            error: 'รหัสยืนยันตัวตน MFA 6 หลักไม่ถูกต้อง',
          };
        }
      } else {
        return {
          ok: true,
          status: 200,
          requireMfa: true,
          message: 'บัญชีนี้เปิดใช้งาน MFA กรุณากรอกรหัส Authenticator 6 หลัก',
        };
      }
    }

    await this.repo.recordLoginEvent({
      userId: user.id,
      email: user.email,
      success: true,
      failureReason: null,
      meta,
    });

    await this.repo.updateUserLastLogin(user.id);

    const token = `sess_${user.id.slice(0, 8)}_${Date.now()}`;
    this.activeSessions.set(token, {
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: Date.now(),
    });

    const addRoles = user.additional_roles || [];
    const allRoles = Array.from(new Set([user.role, ...addRoles]));

    return {
      ok: true,
      status: 200,
      token,
      user: {
        id: user.id,
        cognitoSub: user.cognito_sub,
        email: user.email,
        name: user.display_name,
        role: user.role,
        roleTh: getRoleThai(user.role),
        hospitalId: user.hospital_id,
        hospitalCode: user.hospital_code || 'HA',
        hospitalName: user.hospital_name || 'เขตสุขภาพที่ 6',
        regionId: user.region_id,
        mfaEnabled: user.mfa_enabled,
        additionalRoles: addRoles,
        allRoles,
        phone: user.phone,
        lastLoginAt: new Date().toISOString(),
        scopeLabel: user.hospital_name
          ? `เห็นเฉพาะข้อมูล ${user.hospital_name}`
          : 'ทุกโรงพยาบาล (เขตสุขภาพที่ 6)',
        initial: user.display_name.charAt(0) || 'D',
      },
    };
  }

  /** Resolve a token to its user without touching `last_seen_at` (used by the auth middleware on every request). */
  async getSessionUser(token: string): Promise<AuthSessionUser | null> {
    return this.getMe(token, false);
  }

  /** `touch` = also bump `last_seen_at` (the `/me` poll marks the user online). */
  async getMe(token: string, touch = true): Promise<AuthSessionUser | null> {
    let session = this.activeSessions.get(token);
    // DEMO ONLY (opt-in): tokens are `sess_<8 hex of user id>_<time>`, i.e. guessable. Never enable in a real deployment.
    const demoRecovery = process.env.DEMO_SESSION_RECOVERY === 'true';
    if (!session && demoRecovery && token.startsWith('sess_')) {
      const parts = token.split('_');
      if (parts[1] && parts[1].length === 8) {
        const recovered = await this.repo.findUserByIdPrefix(parts[1]);
        if (recovered && recovered.active) {
          session = {
            userId: recovered.id,
            email: recovered.email,
            role: recovered.role,
            createdAt: Date.now(),
          };
          this.activeSessions.set(token, session);
        }
      }
    }
    if (!session) return null;

    const user = await this.repo.findUserById(session.userId);
    if (!user || !user.active) {
      this.activeSessions.delete(token);
      return null;
    }

    if (touch) await this.repo.updateUserLastSeen(user.id);

    const addRoles = user.additional_roles || [];
    const allRoles = Array.from(new Set([user.role, ...addRoles]));

    return {
      id: user.id,
      cognitoSub: user.cognito_sub,
      email: user.email,
      name: user.display_name,
      role: user.role,
      roleTh: getRoleThai(user.role),
      hospitalId: user.hospital_id,
      hospitalCode: user.hospital_code || 'HA',
      hospitalName: user.hospital_name || 'เขตสุขภาพที่ 6',
      regionId: user.region_id,
      mfaEnabled: user.mfa_enabled,
      additionalRoles: addRoles,
      allRoles,
      phone: user.phone,
      lastLoginAt: user.last_login_at?.toISOString() || new Date().toISOString(),
      scopeLabel: user.hospital_name
        ? `เห็นเฉพาะข้อมูล ${user.hospital_name}`
        : 'ทุกโรงพยาบาล (เขตสุขภาพที่ 6)',
      initial: user.display_name.charAt(0) || 'D',
    };
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    const session = this.activeSessions.get(token);
    if (session) {
      await this.repo.updateUserLastSeen(session.userId);
      this.activeSessions.delete(token);
    }
  }

  async getRoleDemoAccounts(): Promise<RoleAccountDemo[]> {
    return this.repo.getRoleDemoAccounts();
  }

  async getRecentLogins(limit = 25, hospitalId?: string): Promise<{ events: LoginEventEntity[]; onlineCount: number }> {
    const events = await this.repo.getRecentLoginEvents(limit, hospitalId);
    const onlineCount = await this.repo.getActiveOnlineUserCount();
    return { events, onlineCount };
  }
}

export const authService = new AuthService();
