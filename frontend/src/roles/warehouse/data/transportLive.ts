/** Maps `GET /transport-tasks` onto the Shipment shape the transport screens already render (UI-14). */
import type { ApiTransportEvent, ApiTransportTask } from '../../../services/transportApi';
import type { HospitalCode, PickLot, Shipment, TransportPhoto } from './transport';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const ROLE_TH: Record<string, string> = { WAREHOUSE_OFFICER: 'คลัง', DRIVER: 'คนขับ', PHARMACIST: 'เภสัชกร' };
const TZ = 'Asia/Bangkok';

const bkk = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), hh: String(get('hour') % 24).padStart(2, '0'), mm: String(get('minute')).padStart(2, '0') };
};

/** `HH:MM` today (Bangkok), otherwise `D ม.ค. HH:MM`. */
export function fmtThaiTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const t = bkk(iso);
  const n = bkk(now.toISOString());
  return t.y === n.y && t.m === n.m && t.d === n.d ? `${t.hh}:${t.mm}` : `${t.d} ${MONTHS[t.m - 1]} ${t.hh}:${t.mm}`;
}

export function fmtThaiDate(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}

const who = (name: string | null, role: string | null) => (name ? (role && ROLE_TH[role] ? `${name} (${ROLE_TH[role]})` : name) : 'ระบบ');

function lastActor(events: ApiTransportEvent[]): string {
  const applied = events.filter((e) => e.applied);
  const last = applied[applied.length - 1];
  return last ? who(last.actorName, last.actorRole) : 'ระบบ';
}

function stepActor(events: ApiTransportEvent[], status: string): string {
  const e = [...events].reverse().find((x) => x.applied && x.toStatus === status);
  return e ? who(e.actorName, e.actorRole) : '';
}

export function taskToShipment(t: ApiTransportTask, now = new Date()): Shipment {
  const first = t.lines[0];
  const qty = t.lines.reduce((sum, l) => sum + l.qty, 0);
  const lotLines = t.lines.filter((l) => l.lotNo);
  const earliest = lotLines.map((l) => l.expiryDate).filter(Boolean).sort()[0];
  const daysLeft = (date: string) => Math.round((new Date(date).getTime() - now.getTime()) / 86400000);
  const step = (iso: string | null, status: string, fallback = '') => {
    if (!iso) return '';
    const actor = stepActor(t.events, status) || fallback;
    return actor ? `${fmtThaiTime(iso, now)} · ${actor}` : fmtThaiTime(iso, now);
  };
  const photos: TransportPhoto[] = [];
  for (const e of t.events) {
    if (e.toStatus !== 'LOADED' && e.toStatus !== 'ARRIVED' && e.toStatus !== 'RECEIVED') continue;
    for (let i = 0; i < e.photoKeys.length; i += 1) {
      const key = e.photoKeys[i];
      photos.push({
        stage: e.toStatus,
        time: fmtThaiTime(e.capturedAt, now),
        pending: !e.applied,
        key,
        url: key ? `/api/v1/uploads/${key}` : undefined,
      });
    }
  }
  const pick: PickLot[] | undefined =
    t.status === 'WAITING_DISPATCH' && t.direction === 'OUT' && lotLines.length
      ? lotLines.map((l) => ({ lot: l.lotNo!, expiry: fmtThaiDate(l.expiryDate), daysLeft: l.expiryDate ? daysLeft(l.expiryDate) : 0, qty: l.qty, coldChain: l.coldChain || undefined }))
      : undefined;
  return {
    id: t.taskNo ?? t.id,
    taskId: t.id,
    version: t.version,
    outbound: t.direction === 'OUT',
    lastSeq: t.events.reduce((max, e) => Math.max(max, e.seq), 0),
    vehiclePlate: t.vehicle?.plate,
    refType: t.refType,
    refId: t.refId,
    kind: t.kind,
    ref: t.refLabel ?? '',
    drug: first?.drugName ?? '–',
    qty,
    unit: first?.baseUnit ?? '',
    from: t.from.code as HospitalCode,
    to: t.to.code as HospitalCode,
    status: t.status,
    updatedAt: fmtThaiTime(t.updatedAt, now),
    updatedBy: lastActor(t.events),
    driver: t.driver?.name,
    pending: t.pendingSync || undefined,
    coldChain: t.coldChain || undefined,
    cancelRequest: t.cancel?.requestedBy && t.status === 'WAITING_DISPATCH' && !t.cancel.consentBy ? { by: `รพ.${t.cancel.requestedBy}`, time: fmtThaiTime(t.updatedAt, now), reason: t.cancel.reason ?? '' } : undefined,
    photos,
    times: [
      step(t.createdAt, 'WAITING_DISPATCH', t.kind === 'F1' ? 'ตอบรับคำขอ' : 'แผนอนุมัติ'),
      step(t.loadedAt, 'LOADED'),
      step(t.departedAt, 'IN_TRANSIT'),
      step(t.arrivedAt, 'ARRIVED'),
      step(t.receivedAt, 'RECEIVED'),
    ],
    pick,
    lot: lotLines.length ? lotLines.map((l) => l.lotNo).join(' + ') + (earliest ? ` · หมดอายุ ${fmtThaiDate(earliest)} (${daysLeft(earliest)} วัน)` : '') : '–',
    lotCode: lotLines.length ? lotLines.map((l) => l.lotNo).join(' + ') : '–',
    expiry: earliest ? `หมดอายุ ${fmtThaiDate(earliest)}` : undefined,
  };
}

export interface HistoryItem {
  t: string;
  who: string;
  role: string;
  tone: 'orange' | 'blue';
  text: string;
  code: string;
}

const EVENT_CODE: Record<string, string> = { LOADED: 'TRANSPORT_LOADED', IN_TRANSIT: 'TRANSPORT_DEPARTED', ARRIVED: 'TRANSPORT_ARRIVED', RECEIVED: 'TRANSPORT_RECEIVED' };
const STATUS_TH: Record<string, string> = { LOADED: 'ขึ้นรถแล้ว', IN_TRANSIT: 'ออกเดินทาง', ARRIVED: 'ถึงปลายทาง', RECEIVED: 'รับของแล้ว' };

/** Latest applied events across the loaded tasks (the screen's audit-history drawer). */
export function buildHistory(tasks: ApiTransportTask[], now = new Date(), limit = 12): HistoryItem[] {
  return tasks
    .flatMap((t) => t.events.filter((e) => e.applied).map((e) => ({ t, e })))
    .sort((a, b) => b.e.capturedAt.localeCompare(a.e.capturedAt))
    .slice(0, limit)
    .map(({ t, e }) => ({
      t: fmtThaiTime(e.capturedAt, now),
      who: e.actorName ?? 'ระบบ',
      role: e.actorRole ?? 'SYSTEM',
      tone: e.actorRole === 'DRIVER' ? 'orange' : 'blue',
      text: `${t.taskNo ?? t.id} ${STATUS_TH[e.toStatus] ?? e.toStatus}`,
      code: EVENT_CODE[e.toStatus] ?? 'TRANSPORT_UPDATED',
    }));
}
