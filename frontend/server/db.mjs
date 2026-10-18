import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || (process.env.DB_HOST === 'db' ? 5432 : 5442)),
  database: process.env.DB_NAME || 'doorare',
  user: process.env.DB_USER || 'doorare',
  password: process.env.DB_PASSWORD || 'doorare_dev',
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => {
  console.warn('[DB Pool Warning]', err.message);
});

export async function checkDbHealth() {
  try {
    const res = await pool.query('SELECT version(), count(*) as user_count FROM app_user');
    return {
      ok: true,
      message: `PostgreSQL connected (${res.rows[0]?.user_count || 0} users in system)`,
      version: res.rows[0]?.version?.split(' ')?.[1] || '16',
    };
  } catch (err) {
    return {
      ok: false,
      message: `Database connection failed: ${err.message || 'Unable to connect to port 5442/5432'}`,
    };
  }
}

export async function findUserByEmail(email) {
  const query = `
    SELECT 
      u.*,
      h.code AS hospital_code,
      h.name_th AS hospital_name,
      r.code AS region_code,
      r.name_th AS region_name,
      coalesce(array_remove(array_agg(ur.role), NULL), '{}') AS additional_roles
    FROM app_user u
    LEFT JOIN hospital h ON h.id = u.hospital_id
    LEFT JOIN region r ON r.id = u.region_id
    LEFT JOIN app_user_role ur ON ur.user_id = u.id AND ur.role <> u.role
    WHERE lower(u.email) = lower($1)
    GROUP BY u.id, h.code, h.name_th, r.code, r.name_th
    LIMIT 1;
  `;
  const res = await pool.query(query, [email.trim()]);
  return res.rows[0] || null;
}

export async function findUserById(id) {
  const query = `
    SELECT 
      u.*,
      h.code AS hospital_code,
      h.name_th AS hospital_name,
      r.code AS region_code,
      r.name_th AS region_name,
      coalesce(array_remove(array_agg(ur.role), NULL), '{}') AS additional_roles
    FROM app_user u
    LEFT JOIN hospital h ON h.id = u.hospital_id
    LEFT JOIN region r ON r.id = u.region_id
    LEFT JOIN app_user_role ur ON ur.user_id = u.id AND ur.role <> u.role
    WHERE u.id = $1
    GROUP BY u.id, h.code, h.name_th, r.code, r.name_th
    LIMIT 1;
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0] || null;
}

export async function recordLoginEvent(params) {
  try {
    const query = `
      INSERT INTO login_event (
        user_id, email, occurred_at, success, failure_reason, ip, device, browser, user_agent
      )
      VALUES ($1, $2, now(), $3, $4, $5::inet, $6, $7, $8)
      RETURNING id;
    `;
    const safeIp = params.ip && params.ip.match(/^[0-9.]+$/) ? params.ip : '127.0.0.1';
    const res = await pool.query(query, [
      params.userId || null,
      params.email,
      params.success,
      params.failureReason || null,
      safeIp,
      params.device || 'Desktop',
      params.browser || 'Web Browser',
      params.userAgent || 'Mozilla/5.0',
    ]);
    return res.rows[0]?.id || null;
  } catch (err) {
    console.warn('[recordLoginEvent warning]', err.message);
    return null;
  }
}

export async function updateUserLastLogin(userId) {
  try {
    const query = `
      UPDATE app_user 
      SET last_login_at = now(), last_seen_at = now()
      WHERE id = $1;
    `;
    await pool.query(query, [userId]);
  } catch (err) {
    console.warn('[updateUserLastLogin warning]', err.message);
  }
}

export async function updateUserLastSeen(userId) {
  try {
    const query = `UPDATE app_user SET last_seen_at = now() WHERE id = $1;`;
    await pool.query(query, [userId]);
  } catch (err) {
    console.warn('[updateUserLastSeen warning]', err.message);
  }
}

export async function getRoleDemoAccounts() {
  const query = `
    SELECT DISTINCT ON (u.role)
      u.id,
      u.email,
      u.display_name,
      u.role,
      u.mfa_enabled,
      h.code AS hospital_code,
      coalesce(h.name_th, 'เขตสุขภาพที่ 6') AS hospital_name,
      h.tier,
      coalesce(array_remove(array_agg(ur.role) OVER (PARTITION BY u.id), NULL), '{}') AS all_roles
    FROM app_user u
    LEFT JOIN hospital h ON h.id = u.hospital_id
    LEFT JOIN app_user_role ur ON ur.user_id = u.id
    WHERE u.active = true
    ORDER BY u.role, u.created_at ASC;
  `;
  const res = await pool.query(query);
  return res.rows;
}

export async function getRecentLoginEvents(limit = 20, hospitalId) {
  try {
    let query = `
      SELECT 
        l.id,
        l.user_id,
        l.email,
        l.occurred_at,
        l.success,
        l.failure_reason,
        host(l.ip) as ip,
        l.device,
        l.browser,
        l.user_agent,
        u.display_name,
        u.role,
        coalesce(h.name_th, 'ส่วนกลาง เขต 6') as hospital_name
      FROM login_event l
      LEFT JOIN app_user u ON u.id = l.user_id
      LEFT JOIN hospital h ON h.id = u.hospital_id
    `;
    const params = [];
    if (hospitalId) {
      query += ` WHERE u.hospital_id = $1 `;
      params.push(hospitalId);
    }
    query += ` ORDER BY l.occurred_at DESC LIMIT $${params.length + 1}; `;
    params.push(limit);

    const res = await pool.query(query, params);
    return res.rows;
  } catch (err) {
    console.warn('[getRecentLoginEvents warning]', err.message);
    return [];
  }
}

export async function getActiveOnlineUserCount() {
  try {
    const query = `
      SELECT count(*) as count 
      FROM app_user 
      WHERE active = true AND last_seen_at >= now() - interval '15 minutes';
    `;
    const res = await pool.query(query);
    return Number(res.rows[0]?.count || 0);
  } catch {
    return 0;
  }
}
