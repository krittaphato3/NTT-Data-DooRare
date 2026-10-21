/** In-app notifications (table `notification`, channel IN_APP). One row per recipient user. */
import type { Db } from '../db/tx.js';

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  refType?: string | null;
  refId?: string | null;
}

/** Notifies every active user of `hospitalId` that has one of `roles` (their primary role). Returns how many were notified. */
export async function notifyRoles(db: Db, hospitalId: string, roles: string[], n: NotificationInput): Promise<number> {
  const result = await db.query(
    `INSERT INTO notification (user_id, hospital_id, channel, kind, title, body, ref_type, ref_id, sent_at)
     SELECT u.id, $1, 'IN_APP', $3, $4, $5, $6, $7, now()
       FROM app_user u WHERE u.hospital_id = $1 AND u.active AND u.role::text = ANY($2::text[])`,
    [hospitalId, roles, n.kind, n.title, n.body ?? null, n.refType ?? null, n.refId ?? null],
  );
  return result.rowCount ?? 0;
}
