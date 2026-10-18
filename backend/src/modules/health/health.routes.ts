import { Router } from 'express';
import { query } from '../../db/client.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const dbRes = await query('SELECT version(), count(*) as user_count FROM app_user');
    res.status(200).json({
      ok: true,
      message: `PostgreSQL connected (${dbRes.rows[0]?.user_count || 0} users in system)`,
      version: dbRes.rows[0]?.version?.split(' ')?.[1] || '16',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      message: `Database connection failed: ${err.message || 'Offline'}`,
      timestamp: new Date().toISOString(),
    });
  }
});
