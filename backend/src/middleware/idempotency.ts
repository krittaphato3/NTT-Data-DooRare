/**
 * `Idempotency-Key` for side-effecting POSTs (spec §13.1, rows marked Idem = Y):
 *   - header missing                      -> 400 VALIDATION
 *   - same key + same request             -> replays the stored 2xx response (header `Idempotent-Replay: true`)
 *   - same key + different request        -> 422 IDEMPOTENCY_KEY_REUSED
 *   - same key while the first is running -> 409 REQUEST_IN_PROGRESS
 * Only 2xx responses are stored; after a 4xx/5xx the key is released so the client can retry with a fixed request.
 * Keys are per user (table PK is key + user_id) so mount it AFTER `requireAuth`:
 *   router.post('/x', requireAuth, requireRole(...), idempotent(), handler)
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { query } from '../db/client.js';
import { HttpError } from './httpError.js';

const KEY_MAX_LENGTH = 200;
/** A first attempt with no stored response older than this is treated as abandoned (server crashed mid-request). */
const ABANDONED_AFTER_MINUTES = 5;

/** JSON with sorted keys, so two bodies that differ only in key order hash the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function requestHash(req: Request): string {
  const payload = `${req.method} ${req.baseUrl}${req.path}\n${stableStringify(req.body ?? {})}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function idempotent(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.header('Idempotency-Key')?.trim();
      if (!key) throw new HttpError(400, 'VALIDATION', 'ต้องส่ง header Idempotency-Key');
      if (key.length > KEY_MAX_LENGTH) throw new HttpError(400, 'VALIDATION', 'Idempotency-Key ยาวเกินไป');
      const userId = req.user?.id;
      if (!userId) throw new HttpError(401, 'UNAUTHORIZED', 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ');
      const hash = requestHash(req);

      await query(
        `DELETE FROM idempotency_key
          WHERE key = $1 AND user_id = $2 AND response IS NULL
            AND created_at < now() - make_interval(mins => $3)`,
        [key, userId, ABANDONED_AFTER_MINUTES],
      );
      const claimed = await query(
        `INSERT INTO idempotency_key (key, user_id, request_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING key`,
        [key, userId, hash],
      );

      if (claimed.rowCount === 0) {
        const existing = await query<{ request_hash: string; response: { status: number; body: unknown } | null }>(
          `SELECT request_hash, response FROM idempotency_key WHERE key = $1 AND user_id = $2`,
          [key, userId],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== hash) {
          throw new HttpError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key นี้ถูกใช้กับคำขออื่นแล้ว');
        }
        if (row.response) {
          res.setHeader('Idempotent-Replay', 'true');
          res.status(row.response.status).json(row.response.body);
          return;
        }
        throw new HttpError(409, 'REQUEST_IN_PROGRESS', 'คำขอนี้กำลังประมวลผลอยู่');
      }

      // First time: let the handler run, then store a 2xx response (or release the key on failure).
      const sendJson = res.json.bind(res);
      res.json = (body?: unknown): Response => {
        const status = res.statusCode;
        const settle =
          status >= 200 && status < 300
            ? query(`UPDATE idempotency_key SET response = $3::jsonb WHERE key = $1 AND user_id = $2`, [
                key,
                userId,
                JSON.stringify({ status, body: body ?? null }),
              ])
            : query(`DELETE FROM idempotency_key WHERE key = $1 AND user_id = $2`, [key, userId]);
        settle.catch((error) => console.warn('[idempotency] could not settle key', error?.message)).finally(() => sendJson(body));
        return res;
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
