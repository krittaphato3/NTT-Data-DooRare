/** Shared helpers of the F3 modules: incident rows, access, counts, ETA view, numbering. */
import type pg from 'pg';
import { emptyCounts, etaRemainingMin, resolveEta, TRIAGE_LEVELS } from '../../core/formulas/emergency.js';
import type { Counts, EtaFlag, EtaSource, Triage } from '../../core/formulas/emergency.js';
import { uuidParam } from '../../core/validate.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

export interface IncidentRow {
  id: string;
  incident_no: string;
  hospital_id: string;
  status: string;
  location_lat: number | null;
  location_lon: number | null;
  location_text: string | null;
  incident_type: string | null;
  description: string | null;
  eta_unsure: boolean;
  eta_minutes: number | null;
  eta_source: string | null;
  reported_eta_min: number | null;
  created_by: string;
  duplicate_of: string | null;
  cancel_reason: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

const COLUMNS = `id, incident_no, hospital_id, status::text AS status, location_lat::float8 AS location_lat, location_lon::float8 AS location_lon,
  location_text, incident_type, description, eta_unsure, eta_minutes, eta_source::text AS eta_source, reported_eta_min, created_by, duplicate_of,
  cancel_reason, closed_at, created_at, updated_at, version`;

/** Incident statuses in which staff can still change the plan, counts and requests. */
export const OPEN_STATUSES = ['OPEN', 'PLAN_REVIEW', 'ACTIVE'] as const;
/** Statuses that are still "running" for lists, dashboards and duplicate checks. */
export const RUNNING_STATUSES = ['OPEN', 'PLAN_REVIEW', 'ACTIVE', 'CLOSE_REQUESTED'] as const;

export const statusGroup = (status: string): 'active' | 'closed' | 'cancelled' => (status === 'CANCELLED' ? 'cancelled' : status === 'RECONCILED' ? 'closed' : 'active');

export async function loadIncident(db: Db, id: string, lock = false): Promise<IncidentRow | null> {
  const r = await db.query(`SELECT ${COLUMNS} FROM incident WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  return (r.rows[0] as IncidentRow | undefined) ?? null;
}

export function hospitalOf(user: AuthSessionUser): string {
  if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
  return user.hospitalId;
}

/** The incident of the caller's own hospital (SEC-002: other hospitals get 404, not 403). */
export async function ownIncident(db: Db, user: AuthSessionUser, rawId: unknown, lock = false): Promise<IncidentRow> {
  const id = uuidParam(rawId, 'id');
  const hospitalId = hospitalOf(user);
  const row = await loadIncident(db, id, lock);
  if (!row || row.hospital_id !== hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเหตุการณ์');
  return row;
}

export function assertOpen(incident: IncidentRow, allowed: readonly string[] = OPEN_STATUSES): void {
  if (!allowed.includes(incident.status)) {
    throw new HttpError(409, 'INVALID_STATE', `เหตุการณ์อยู่ในสถานะ ${incident.status} ทำรายการนี้ไม่ได้`, { status: incident.status });
  }
}

/** Optimistic lock: when the client sends `version` it must equal the stored one. */
export function assertVersion(incident: IncidentRow, version: number | undefined): void {
  if (version !== undefined && version !== Number(incident.version)) {
    throw new HttpError(409, 'VERSION_CONFLICT', 'เหตุการณ์ถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(incident.version) });
  }
}

export async function readCounts(db: Db, incidentId: string): Promise<Counts> {
  const r = await db.query(`SELECT triage::text AS triage, count FROM incident_patient_count WHERE incident_id = $1`, [incidentId]);
  const counts = emptyCounts();
  for (const row of r.rows) counts[row.triage as Triage] = Number(row.count);
  return counts;
}

export async function writeCounts(client: pg.PoolClient, incidentId: string, counts: Counts): Promise<void> {
  for (const level of TRIAGE_LEVELS) {
    await client.query(
      `INSERT INTO incident_patient_count (incident_id, triage, count) VALUES ($1, $2::triage_level, $3)
       ON CONFLICT (incident_id, triage) DO UPDATE SET count = EXCLUDED.count, updated_at = now()`,
      [incidentId, level, counts[level]],
    );
  }
}

/** Counts from a request body: RED / YELLOW / GREEN / BLACK / UNKNOWN whole numbers; missing levels keep `base`. */
export function parseCounts(raw: unknown, base: Counts = emptyCounts()): Counts {
  if (raw === undefined || raw === null) return { ...base };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'VALIDATION', 'counts ต้องเป็น object ของระดับคัดแยก');
  const out = { ...base };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TRIAGE_LEVELS as readonly string[]).includes(key)) throw new HttpError(400, 'VALIDATION', `ระดับคัดแยก ${key} ไม่ถูกต้อง (${TRIAGE_LEVELS.join(', ')})`);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new HttpError(400, 'VALIDATION', `จำนวน ${key} ต้องเป็นจำนวนเต็ม 0-100000`);
    out[key as Triage] = n;
  }
  return out;
}

export const totalPatients = (c: Counts): number => TRIAGE_LEVELS.reduce((s, l) => s + c[l], 0);

export interface EtaView {
  reportedMin: number | null;
  unsure: boolean;
  minutes: number | null;
  source: EtaSource;
  arrivalAt: string | null;
  remainingMin: number | null;
  remainingSec: number | null;
  flags: (EtaFlag | 'PATIENTS_ARRIVED')[];
}

/** ETA of an incident now. Seed incidents carry only the reported value, so the result is derived when `eta_minutes` is empty (F-26). */
export function etaView(row: IncidentRow, now = new Date()): EtaView {
  // the stored `eta_minutes` is the F-26 result; re-deriving it from the reported value (and the route time, when that is what was stored) keeps the flags
  const resolved = resolveEta({ reported: row.reported_eta_min, unsure: row.eta_unsure, route: row.eta_source === 'ROUTE' ? row.eta_minutes : null });
  const remaining = etaRemainingMin(resolved.minutes, new Date(row.created_at), now);
  const flags: EtaView['flags'] = [...resolved.flags];
  if (resolved.minutes !== null && remaining === 0 && (RUNNING_STATUSES as readonly string[]).includes(row.status)) flags.push('PATIENTS_ARRIVED');
  return {
    reportedMin: row.reported_eta_min === null ? null : Number(row.reported_eta_min),
    unsure: row.eta_unsure,
    minutes: resolved.minutes,
    source: resolved.source,
    arrivalAt: resolved.minutes === null ? null : new Date(new Date(row.created_at).getTime() + resolved.minutes * 60_000).toISOString(),
    remainingMin: remaining === null ? null : Math.round(remaining * 10) / 10,
    remainingSec: remaining === null ? null : Math.round(remaining * 60),
    flags,
  };
}

/** `INC-<yyyy>-<seq4>`, serialised per year. */
export async function nextIncidentNo(client: pg.PoolClient): Promise<string> {
  const prefix = `INC-${new Date().getFullYear()}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const last = await client.query(`SELECT max(substring(incident_no FROM '[0-9]+$')::int) AS n FROM incident WHERE incident_no LIKE $1`, [`${prefix}%`]);
  return `${prefix}${String(Number(last.rows[0].n ?? 0) + 1).padStart(4, '0')}`;
}

export const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

/** Display name of a user, or null. */
export async function userName(db: Db, id: string | null): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const r = await db.query(`SELECT id, display_name FROM app_user WHERE id = $1`, [id]);
  return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].display_name } : null;
}
