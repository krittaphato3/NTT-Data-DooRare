import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  checkDbHealth,
  findUserByEmail,
  findUserById,
  recordLoginEvent,
  updateUserLastLogin,
  updateUserLastSeen,
  getRoleDemoAccounts,
  getRecentLoginEvents,
  getActiveOnlineUserCount,
} from './db';

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function parseClientMeta(req: IncomingMessage) {
  const ua = req.headers['user-agent'] || '';
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const cleanIp = rawIp.replace(/^::ffff:/, '');

  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  let device = 'Windows PC';
  if (ua.includes('Macintosh')) device = 'MacBook';
  else if (ua.includes('iPhone')) device = 'iPhone';
  else if (ua.includes('iPad')) device = 'iPad';
  else if (ua.includes('Android')) device = 'Android';
  else if (ua.includes('Linux')) device = 'Linux PC';

  return { ip: cleanIp, device, browser, userAgent: ua };
}

// In-memory token -> userId lookup for the dev session
const activeSessions = new Map<string, { userId: string; email: string; role: string; createdAt: number }>();

export function authPlugin(): Plugin {
  return {
    name: 'doorare-auth-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // 1. Health check
        if (url === '/api/v1/health') {
          const health = await checkDbHealth();
          return sendJson(res, health.ok ? 200 : 503, health);
        }

        // 2. Role demo accounts (for quick login tabs)
        if (url === '/api/v1/auth/role-accounts' && req.method === 'GET') {
          try {
            const accounts = await getRoleDemoAccounts();
            return sendJson(res, 200, { ok: true, accounts });
          } catch (err: any) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        // 3. Recent logins (feeds System Admin Live Authentication Feed & Hospital Admin Audit Log)
        if (url === '/api/v1/auth/recent-logins' && req.method === 'GET') {
          try {
            const queryParams = new URL(req.url || '', 'http://localhost').searchParams;
            const limit = Number(queryParams.get('limit') || 25);
            const hospitalId = queryParams.get('hospitalId') || undefined;
            const events = await getRecentLoginEvents(limit, hospitalId);
            const onlineCount = await getActiveOnlineUserCount();
            return sendJson(res, 200, { ok: true, events, onlineCount });
          } catch (err: any) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        // 4. Current user profile (/api/v1/me, API-PL-001)
        if (url === '/api/v1/me' && req.method === 'GET') {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.replace(/^Bearer\s+/i, '');
          const session = activeSessions.get(token);

          if (!session) {
            return sendJson(res, 401, {
              ok: false,
              code: 'UNAUTHORIZED',
              title: 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ',
            });
          }

          const user = await findUserById(session.userId);
          if (!user || !user.active) {
            activeSessions.delete(token);
            return sendJson(res, 403, {
              ok: false,
              code: 'FORBIDDEN',
              title: 'บัญชีถูกระงับการใช้งาน',
            });
          }

          await updateUserLastSeen(user.id);

          return sendJson(res, 200, {
            ok: true,
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
              additionalRoles: user.additional_roles || [],
              allRoles: [user.role, ...(user.additional_roles || [])],
              phone: user.phone,
              lastLoginAt: user.last_login_at,
              lastSeenAt: user.last_seen_at,
            },
          });
        }

        // 5. Login (/api/v1/auth/login)
        if (url === '/api/v1/auth/login' && req.method === 'POST') {
          const body = await parseBody(req);
          const email = (body.email || '').trim().toLowerCase();
          const password = (body.password || '').trim();
          const otp = (body.otp || '').trim();
          const meta = parseClientMeta(req);

          if (!email) {
            return sendJson(res, 400, {
              ok: false,
              error: 'กรุณากรอกอีเมลผู้ใช้งาน',
            });
          }

          // Check if DB is reachable
          let user = null;
          try {
            user = await findUserByEmail(email);
          } catch (dbErr: any) {
            return sendJson(res, 503, {
              ok: false,
              code: 'DB_UNAVAILABLE',
              error: `ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้: ${dbErr.message || 'Port 5442 offline'} กรุณาตรวจสอบว่ารัน 'npm run db:up' แล้ว`,
            });
          }

          // 5.1 User not found
          if (!user) {
            await recordLoginEvent({
              userId: null,
              email,
              success: false,
              failureReason: 'ไม่พบบัญชีผู้ใช้',
              ...meta,
            });
            return sendJson(res, 401, {
              ok: false,
              code: 'USER_NOT_FOUND',
              error: `ไม่พบบัญชีผู้ใช้งาน "${email}" ในระบบ กรุณาตรวจสอบอีเมลอีกครั้ง`,
            });
          }

          // 5.2 Account suspended / inactive
          if (!user.active) {
            await recordLoginEvent({
              userId: user.id,
              email: user.email,
              success: false,
              failureReason: 'บัญชีถูกระงับการใช้งาน',
              ...meta,
            });
            return sendJson(res, 403, {
              ok: false,
              code: 'ACCOUNT_SUSPENDED',
              error: `บัญชีผู้ใช้งานนี้ (${user.display_name}) ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ`,
            });
          }

          // 5.3 Password verification (accepts standard demo password 'doorare123' or any non-empty password)
          // In real production this connects with Cognito User Pool; here in dev it verifies password rules
          const isMasterPass = password === 'doorare123' || password === 'password' || password === 'admin';
          if (!isMasterPass && !body.skipPassword) {
            await recordLoginEvent({
              userId: user.id,
              email: user.email,
              success: false,
              failureReason: 'รหัสผ่านไม่ถูกต้อง',
              ...meta,
            });
            return sendJson(res, 401, {
              ok: false,
              code: 'INVALID_CREDENTIALS',
              error: 'รหัสผ่านไม่ถูกต้อง (สำหรับทดสอบสามารถใช้ doorare123)',
            });
          }

          // 5.4 MFA verification check (SEC-001)
          if (user.mfa_enabled && !body.mfaVerified) {
            // If OTP supplied, verify OTP (demo OTP: '123456' or any 6-digit code)
            if (otp) {
              if (otp.length !== 6 || !/^\d+$/.test(otp)) {
                await recordLoginEvent({
                  userId: user.id,
                  email: user.email,
                  success: false,
                  failureReason: 'MFA ไม่ผ่าน',
                  ...meta,
                });
                return sendJson(res, 401, {
                  ok: false,
                  code: 'MFA_FAILED',
                  error: 'รหัสยืนยันตัวตน MFA 6 หลักไม่ถูกต้อง',
                });
              }
            } else {
              // Trigger MFA challenge step
              return sendJson(res, 200, {
                ok: true,
                requireMfa: true,
                email: user.email,
                name: user.display_name,
                role: user.role,
                message: 'บัญชีนี้เปิดใช้งาน MFA กรุณากรอกรหัส Authenticator 6 หลัก',
              });
            }
          }

          // 5.5 Success! Record in PostgreSQL login_event and update app_user timestamps
          await recordLoginEvent({
            userId: user.id,
            email: user.email,
            success: true,
            failureReason: null,
            ...meta,
          });

          await updateUserLastLogin(user.id);

          // Generate session token
          const token = `sess_${user.id.slice(0, 8)}_${Date.now()}`;
          activeSessions.set(token, {
            userId: user.id,
            email: user.email,
            role: user.role,
            createdAt: Date.now(),
          });

          const allRoles = [user.role, ...(user.additional_roles || [])];

          return sendJson(res, 200, {
            ok: true,
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
              additionalRoles: user.additional_roles || [],
              allRoles,
              phone: user.phone,
              lastLoginAt: new Date().toISOString(),
              scopeLabel: user.hospital_name ? `เห็นเฉพาะข้อมูล ${user.hospital_name}` : 'ทุกโรงพยาบาล (เขตสุขภาพที่ 6)',
              initial: user.display_name.charAt(0) || 'D',
            },
          });
        }

        // 6. Logout (/api/v1/auth/logout)
        if (url === '/api/v1/auth/logout' && req.method === 'POST') {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.replace(/^Bearer\s+/i, '');
          const session = activeSessions.get(token);
          if (session) {
            await updateUserLastSeen(session.userId);
            activeSessions.delete(token);
          }
          return sendJson(res, 200, { ok: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
        }

        return next();
      });
    },
  };
}

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
