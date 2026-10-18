import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 80);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function parseBody(req) {
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

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function parseClientMeta(req) {
  const ua = req.headers['user-agent'] || '';
  const rawIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
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

function getRoleThai(role) {
  const map = {
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

function parsePgArray(arr) {
  if (Array.isArray(arr)) return arr;
  if (typeof arr === 'string') {
    const cleaned = arr.replace(/^{|}$/g, '').trim();
    if (!cleaned) return [];
    return cleaned.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  }
  return [];
}

const activeSessions = new Map();

const server = http.createServer(async (req, res) => {
  const [pathname, search] = (req.url || '/').split('?');

  // --- API ROUTES ---
  if (pathname.startsWith('/api/v1/')) {
    // 1. Health check
    if (pathname === '/api/v1/health') {
      const health = await checkDbHealth();
      return sendJson(res, health.ok ? 200 : 503, health);
    }

    // 2. Role demo accounts
    if (pathname === '/api/v1/auth/role-accounts' && req.method === 'GET') {
      try {
        const accounts = await getRoleDemoAccounts();
        return sendJson(res, 200, { ok: true, accounts });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 3. Recent logins
    if (pathname === '/api/v1/auth/recent-logins' && req.method === 'GET') {
      try {
        const queryParams = new URL(req.url, 'http://localhost').searchParams;
        const limit = Number(queryParams.get('limit') || 25);
        const hospitalId = queryParams.get('hospitalId') || undefined;
        const events = await getRecentLoginEvents(limit, hospitalId);
        const onlineCount = await getActiveOnlineUserCount();
        return sendJson(res, 200, { ok: true, events, onlineCount });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 4. Current user profile (/api/v1/me)
    if (pathname === '/api/v1/me' && req.method === 'GET') {
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
          additionalRoles: parsePgArray(user.additional_roles),
          allRoles: Array.from(new Set([user.role, ...parsePgArray(user.additional_roles)])),
          phone: user.phone,
          lastLoginAt: user.last_login_at,
          lastSeenAt: user.last_seen_at,
        },
      });
    }

    // 5. Login (/api/v1/auth/login)
    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = (body.password || '').trim();
      const otp = (body.otp || '').trim();
      const meta = parseClientMeta(req);

      if (!email) {
        return sendJson(res, 400, { ok: false, error: 'กรุณากรอกอีเมลผู้ใช้งาน' });
      }

      let user = null;
      try {
        user = await findUserByEmail(email);
      } catch (dbErr) {
        return sendJson(res, 503, {
          ok: false,
          code: 'DB_UNAVAILABLE',
          error: `ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้: ${dbErr.message || 'Port 5432/5442 offline'}`,
        });
      }

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

      if (user.mfa_enabled && !body.mfaVerified) {
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

      await recordLoginEvent({
        userId: user.id,
        email: user.email,
        success: true,
        failureReason: null,
        ...meta,
      });

      await updateUserLastLogin(user.id);

      const token = `sess_${user.id.slice(0, 8)}_${Date.now()}`;
      activeSessions.set(token, {
        userId: user.id,
        email: user.email,
        role: user.role,
        createdAt: Date.now(),
      });

      const addRoles = parsePgArray(user.additional_roles);
      const allRoles = Array.from(new Set([user.role, ...addRoles]));

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
          additionalRoles: addRoles,
          allRoles,
          phone: user.phone,
          lastLoginAt: new Date().toISOString(),
          scopeLabel: user.hospital_name ? `เห็นเฉพาะข้อมูล ${user.hospital_name}` : 'ทุกโรงพยาบาล (เขตสุขภาพที่ 6)',
          initial: user.display_name.charAt(0) || 'D',
        },
      });
    }

    // 6. Logout
    if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = activeSessions.get(token);
      if (session) {
        await updateUserLastSeen(session.userId);
        activeSessions.delete(token);
      }
      return sendJson(res, 200, { ok: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
    }

    return sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback to index.html
    filePath = path.join(DIST_DIR, 'index.html');
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(content);
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[DooRare Server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[DooRare Server] Connected to Postgres at ${process.env.DB_HOST || '127.0.0.1'}`);
});
