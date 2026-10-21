import { Router } from 'express';
import { parsePage, toPage } from '../../core/pagination.js';
import { uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/httpError.js';

/** API-PL-004 / API-PL-005: the signed-in user's in-app notifications. */
export const notificationsRouter = Router();

const view = (n: Record<string, any>) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  refType: n.ref_type,
  refId: n.ref_id,
  read: n.read_at !== null,
  readAt: n.read_at ? new Date(n.read_at).toISOString() : null,
  createdAt: new Date(n.created_at).toISOString(),
});

notificationsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const page = parsePage(req.query);
  const unreadOnly = req.query.unread === 'true';
  const result = await query(
    `SELECT id, kind, title, body, ref_type, ref_id, read_at, created_at FROM notification
      WHERE user_id = $1 AND channel = 'IN_APP' ${unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
    [req.user!.id, page.limit + 1, page.offset],
  );
  const unread = await query(`SELECT count(*)::int AS n FROM notification WHERE user_id = $1 AND channel = 'IN_APP' AND read_at IS NULL`, [req.user!.id]);
  const slice = toPage(result.rows, page);
  res.status(200).json({ ok: true, items: slice.items.map(view), nextCursor: slice.nextCursor, unreadCount: unread.rows[0].n });
}));

notificationsRouter.post('/:id/read', requireAuth, asyncHandler(async (req, res) => {
  const id = uuidParam(req.params.id, 'id');
  const result = await query(
    `UPDATE notification SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2
     RETURNING id, kind, title, body, ref_type, ref_id, read_at, created_at`,
    [id, req.user!.id],
  );
  if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบการแจ้งเตือน');
  res.status(200).json({ ok: true, id, data: view(result.rows[0]) });
}));
