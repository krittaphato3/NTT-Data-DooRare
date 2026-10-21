/** Repeated-expiry flags (API-F2a-015 / -016, F-25): read the flags computed by JOB-07 and let the pharmacist silence one for `dismiss_days`. */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { hospitalForRead } from '../../core/scope.js';
import { uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { loadExpiryConfig } from './expiry.config.js';

const SELECT = `
  SELECT f.id, f.hospital_id, f.drug_master_id, f.level, f.lots_12m, f.value_12m_thb::float8 AS value_12m, f.suggestion, f.dismissed_until::text AS dismissed_until, f.created_at,
         concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form) AS drug_name, dm.base_unit
    FROM repeat_expiry_flag f JOIN drug_master dm ON dm.id = f.drug_master_id`;

const view = (r: Record<string, any>) => ({
  id: r.id,
  drug: { id: r.drug_master_id, name: r.drug_name, unit: r.base_unit },
  level: r.level as 'WATCH' | 'RECOMMEND',
  lots12m: Number(r.lots_12m),
  valueThb12m: r.value_12m,
  suggestion: r.suggestion,
  dismissedUntil: r.dismissed_until ?? null,
  createdAt: new Date(r.created_at).toISOString(),
});

export class RepeatService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const rows = (await query(`${SELECT} WHERE f.hospital_id = $1 AND (f.dismissed_until IS NULL OR f.dismissed_until < current_date) ORDER BY (f.level = 'RECOMMEND') DESC, f.value_12m_thb DESC NULLS LAST`, [hospitalId])).rows;
    return { ok: true, items: rows.map(view) };
  }

  async dismiss(req: Request, rawId: string) {
    const user = req.user!;
    if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
    const id = uuidParam(rawId, 'id');
    return withTransaction(async (client) => {
      const row = (await client.query(`${SELECT} WHERE f.id = $1 FOR UPDATE OF f`, [id])).rows[0];
      if (!row || row.hospital_id !== user.hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบการแจ้งเตือนยาหมดอายุซ้ำ');
      const cfg = await loadExpiryConfig(client, user.hospitalId);
      const updated = (await client.query(`UPDATE repeat_expiry_flag SET dismissed_until = current_date + $2::int WHERE id = $1 RETURNING id`, [id, cfg.repeat.dismissDays])).rows[0];
      await writeAudit(client, auditContext(req), { action: 'REPEAT_EXPIRY_DISMISSED', entityType: 'repeat_expiry_flag', entityId: id, after: { days: cfg.repeat.dismissDays } });
      const fresh = (await client.query(`${SELECT} WHERE f.id = $1`, [updated.id])).rows[0];
      return { ok: true, id, data: view(fresh) };
    });
  }
}

export const repeatService = new RepeatService();
export { pool };
