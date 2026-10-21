import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import { config } from '../../config/env.js';
import { auditContext } from '../../core/audit.js';
import { bodyObject, isUuid, optionalNumber, optionalStringArray, uuidParam } from '../../core/validate.js';
import { pool } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import { transportRepository } from './transport.repository.js';
import { applyTransition, loadTaskView, MOVE_STATUSES } from './transport.workflow.js';
import type { MoveStatus } from './transport.workflow.js';

const moveStatus = (value: unknown): MoveStatus => {
  if (typeof value !== 'string' || !(MOVE_STATUSES as readonly string[]).includes(value)) {
    throw new HttpError(400, 'VALIDATION', `toStatus ต้องเป็นหนึ่งใน ${MOVE_STATUSES.join(', ')}`);
  }
  return value as MoveStatus;
};

/** API-F2a-013: advance one task (version required, photos by key). Returns the TransportTask wrapper. */
export async function advanceStatus(req: Request, rawId: string) {
  const id = uuidParam(rawId, 'id');
  const body = bodyObject(req.body);
  const toStatus = moveStatus(body.toStatus);
  const version = optionalNumber(body.version, 'version', { min: 1 });
  if (version === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องส่ง version');
  const user = req.user!;
  const view = await withTransaction(async (client) => {
    await applyTransition(client, auditContext(req), user, {
      taskId: id,
      toStatus,
      version,
      photoKeys: optionalStringArray(body.photoKeys, 'photoKeys', 10),
      temperatureC: optionalNumber(body.temperatureC, 'temperatureC', { min: -50, max: 60 }),
      qtyReceived: optionalNumber(body.qtyReceived, 'qtyReceived', { min: 0.001 }),
      reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : undefined,
    });
    return loadTaskView(client, id, user);
  });
  return { ok: true, id: view.id, version: view.version, data: view };
}

const MAGIC: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { type: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** API-F2a-014 (local-disk variant): store one compressed photo and return its key for `photoKeys`. */
export async function uploadPhoto(req: Request, rawId: string) {
  const id = uuidParam(rawId, 'id');
  const body = bodyObject(req.body);
  const user = req.user!;
  const task = await transportRepository.getById(pool, id);
  const mine = user.hospitalId;
  if (!task || !mine || (task.from_hospital_id !== mine && task.to_hospital_id !== mine)) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบงานขนส่ง');
  if (user.role === 'DRIVER' && task.driver_id !== user.id) throw new HttpError(403, 'FORBIDDEN', 'งานนี้ไม่ได้มอบหมายให้คุณ');
  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) throw new HttpError(400, 'VALIDATION', 'ต้องส่ง dataBase64');
  const raw = Buffer.from(body.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (raw.length === 0) throw new HttpError(400, 'VALIDATION', 'ข้อมูลรูปไม่ถูกต้อง');
  if (raw.length > config.uploads.maxPhotoBytes) throw new HttpError(400, 'VALIDATION', 'รูปใหญ่เกิน 1.5 MB กรุณาบีบอัดก่อน');
  const kind = MAGIC.find((m) => m.test(raw));
  if (!kind) throw new HttpError(400, 'VALIDATION', 'รองรับเฉพาะ JPEG, PNG, WebP');
  const name = `${crypto.randomUUID()}.${kind.ext}`;
  const dir = path.join(config.uploads.dir, 'transport', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), raw);
  return { ok: true, photoKey: `transport/${id}/${name}`, contentType: kind.type, size: raw.length };
}

type Outcome = 'APPLIED' | 'DUPLICATE' | 'REJECTED_OUT_OF_ORDER' | 'REJECTED_INVALID_TRANSITION';

/** API-F2a-017: offline batch, idempotent by clientEventId; events are applied in `seq` order, each in its own transaction. */
export async function syncEvents(req: Request, rawId: string) {
  const id = uuidParam(rawId, 'id');
  const body = bodyObject(req.body);
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 200) {
    throw new HttpError(400, 'VALIDATION', 'events ต้องมี 1-200 รายการ');
  }
  const user = req.user!;
  const events = body.events.map((raw, index) => {
    const e = bodyObject(raw);
    if (!isUuid(e.clientEventId)) throw new HttpError(400, 'VALIDATION', `events[${index}].clientEventId ต้องเป็น UUID`);
    const seq = optionalNumber(e.seq, `events[${index}].seq`, { min: 0 });
    if (seq === undefined || !Number.isInteger(seq)) throw new HttpError(400, 'VALIDATION', `events[${index}].seq ต้องเป็นจำนวนเต็ม`);
    const capturedAt = new Date(String(e.capturedAt));
    if (Number.isNaN(capturedAt.getTime())) throw new HttpError(400, 'VALIDATION', `events[${index}].capturedAt ไม่ถูกต้อง`);
    return {
      clientEventId: e.clientEventId,
      seq,
      toStatus: moveStatus(e.toStatus),
      capturedAt,
      photoKeys: optionalStringArray(e.photoKeys, `events[${index}].photoKeys`, 10),
      temperatureC: optionalNumber(e.temperatureC, `events[${index}].temperatureC`, { min: -50, max: 60 }),
    };
  });
  events.sort((a, b) => a.seq - b.seq);

  const results: { clientEventId: string; outcome: Outcome; detail?: string }[] = [];
  for (const ev of events) {
    const outcome = await (async (): Promise<{ outcome: Outcome; detail?: string }> => {
      const seen = await pool.query(`SELECT 1 FROM transport_event WHERE task_id = $1 AND client_event_id = $2`, [id, ev.clientEventId]);
      if (seen.rowCount) return { outcome: 'DUPLICATE' };
      const last = await pool.query(`SELECT COALESCE(max(seq), -1) AS s FROM transport_event WHERE task_id = $1 AND applied`, [id]);
      if (ev.seq <= Number(last.rows[0].s)) {
        await recordRejected(id, ev, user.id, 'seq อยู่ก่อนเหตุการณ์ที่ซิงก์แล้ว');
        return { outcome: 'REJECTED_OUT_OF_ORDER', detail: 'seq อยู่ก่อนเหตุการณ์ที่ซิงก์แล้ว' };
      }
      try {
        await withTransaction(async (client) => {
          await applyTransition(client, auditContext(req), user, {
            taskId: id,
            toStatus: ev.toStatus,
            photoKeys: ev.photoKeys,
            capturedAt: ev.capturedAt,
            clientEventId: ev.clientEventId,
            seq: ev.seq,
            temperatureC: ev.temperatureC,
          });
        });
        return { outcome: 'APPLIED' };
      } catch (error) {
        if (error instanceof HttpError && (error.statusCode === 409 || error.statusCode === 400)) {
          await recordRejected(id, ev, user.id, error.message);
          return { outcome: 'REJECTED_INVALID_TRANSITION', detail: error.message };
        }
        throw error;
      }
    })();
    results.push({ clientEventId: ev.clientEventId, ...outcome });
  }
  return { ok: true, results };
}

async function recordRejected(
  taskId: string,
  ev: { clientEventId: string; seq: number; toStatus: MoveStatus; capturedAt: Date; photoKeys: string[]; temperatureC?: number },
  actorId: string,
  reason: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, actor_id, photo_keys, applied, reject_reason, temperature_c)
     VALUES ($1, $2, $3, $4::transport_status, $5::timestamptz, $6, $7::text[], false, $8, $9)
     ON CONFLICT (task_id, client_event_id) DO NOTHING`,
    [taskId, ev.clientEventId, ev.seq, ev.toStatus, ev.capturedAt.toISOString(), actorId, ev.photoKeys, reason, ev.temperatureC ?? null],
  );
}
