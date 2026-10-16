/** Mock data for the warehouse Dashboard (UI-01, WH view). Transport numbers derive from SHIPMENTS. */
import type { IconName } from '../../../components/common/icons';
import { FEATURE_META, INBOX_STATUS_META, OUTBOUND, PACKS, URGENT_SECONDS as INBOX_URGENT_SECONDS, inboxStats } from './inbox';
import { fmtQty, HOSPITALS, isOutbound, SHIPMENTS, STATUS_META } from './transport';
import type { Tone, TransportStatus } from './transport';
import type { WarehousePage } from './routes';

/** Seconds left on the urgent lender request when the page loads (spec: confirm within 3–5 min). */
export const URGENT_SECONDS = INBOX_URGENT_SECONDS;

export interface KitStock {
  key: string;
  th: string;
  en: string;
  ready: number;
  target: number;
}

/** Ready-set stock per patient-set (F3). View-only on the dashboard. */
export const KITS: KitStock[] = [
  { key: 'trauma', th: 'ชุดบาดเจ็บ', en: 'Trauma', ready: 6, target: 10 },
  { key: 'intubation', th: 'ชุดใส่ท่อช่วยหายใจ', en: 'Intubation', ready: 5, target: 6 },
  { key: 'iv', th: 'ชุดให้สารน้ำ', en: 'IV', ready: 15, target: 20 },
  { key: 'burn', th: 'ชุดแผลไฟไหม้', en: 'Burn', ready: 2, target: 6 },
];

export type TodoGroup = 'inbox' | 'transport';

export interface TodoItem {
  id: string;
  group: TodoGroup;
  icon: IconName;
  sevCls: string;
  title: string;
  detail: string;
  badge: { label: string; tone: Tone };
  cta: { label: string; primary: boolean; page: WarehousePage };
  /** Marks the urgent lender request so the page can show its live countdown. */
  urgent?: boolean;
}

const byId = (id: string) => SHIPMENTS.find((s) => s.id === id)!;

function transportTodo(): TodoItem[] {
  const arrived = byId('TR-2026-000334');
  const dispatch = byId('TR-2026-000338');
  const cancelReq = byId('TR-2026-000339');
  const pending = byId('TR-2026-000341');
  return [
    {
      id: arrived.id, group: 'transport', icon: 'checkc', sevCls: 'sev-norm',
      title: `ยืนยันรับของ ${arrived.id}`,
      detail: `${arrived.drug} · ${fmtQty(arrived.qty)} ${arrived.unit} · จาก ${HOSPITALS[arrived.from]} · ถึง ${arrived.updatedAt} น.`,
      badge: { label: 'ถึงปลายทาง · รอรับ', tone: 'green' },
      cta: { label: 'ยืนยันรับของ', primary: true, page: 'transport' },
    },
    {
      id: dispatch.id, group: 'transport', icon: 'hourglass', sevCls: 'sev-urg',
      title: `ขึ้นรถ + ถ่ายรูป ${dispatch.id}`,
      detail: `${dispatch.drug} · ${fmtQty(dispatch.qty)} ${dispatch.unit} → ${HOSPITALS[dispatch.to]} · ล็อตถูกกันไว้จนขึ้นรถ`,
      badge: { label: 'รอขึ้นรถ', tone: 'amber' },
      cta: { label: 'ขึ้นรถ', primary: true, page: 'transport' },
    },
    {
      id: cancelReq.id, group: 'transport', icon: 'hourglass', sevCls: 'sev-urg',
      title: `ขึ้นรถ ${cancelReq.id}`,
      detail: `${cancelReq.drug} · ${fmtQty(cancelReq.qty)} ${cancelReq.unit} → ${HOSPITALS[cancelReq.to]} · ${cancelReq.cancelRequest!.by}ขอยกเลิก รอเภสัชกรตอบ`,
      badge: { label: 'ขอยกเลิก', tone: 'orange' },
      cta: { label: 'ดูรายละเอียด', primary: false, page: 'transport' },
    },
    {
      id: pending.id, group: 'transport', icon: 'sync', sevCls: 'sev-norm',
      title: `ซิงก์รูปขึ้นรถ ${pending.id}`,
      detail: `${pending.drug} · ${fmtQty(pending.qty)} ${pending.unit} → ${HOSPITALS[pending.to]} · รูปที่ถ่ายตอนไม่มีสัญญาณยังไม่ถูกส่งขึ้นระบบ`,
      badge: { label: 'รอซิงก์ 1', tone: 'amber' },
      cta: { label: 'ซิงก์ตอนนี้', primary: false, page: 'transport' },
    },
  ];
}

/** Inbox tasks that still need the warehouse (confirm to prepare / mark ready). */
function inboxTodo(): TodoItem[] {
  const items: TodoItem[] = [];
  for (const o of OUTBOUND) {
    if (o.status !== 'NEW' && o.status !== 'PREPARING') continue;
    const prep = o.status === 'PREPARING';
    items.push({
      id: o.id, group: 'inbox', urgent: !!o.urgent && o.status === 'NEW',
      icon: o.urgent ? 'siren' : prep ? 'box' : 'inbox', sevCls: o.urgent ? 'sev-crit' : 'sev-urg',
      title: `${prep ? 'เตรียมให้เสร็จ' : 'ยืนยันจะเตรียม'} ${o.drug} × ${fmtQty(o.qty)} ${o.unit}`,
      detail: `${FEATURE_META[o.feature].label} · ${o.ref} → ${HOSPITALS[o.to]} · ${o.urgent ? 'เร่งด่วน' : o.due}`,
      badge: { label: INBOX_STATUS_META[o.status].label, tone: o.urgent ? 'red' : INBOX_STATUS_META[o.status].tone },
      cta: { label: prep ? 'เตรียมเสร็จ' : 'ยืนยัน', primary: true, page: 'inbox' },
    });
  }
  for (const p of PACKS) {
    if (p.status !== 'NEW' && p.status !== 'PREPARING') continue;
    items.push({
      id: p.id, group: 'inbox', icon: 'box', sevCls: 'sev-urg',
      title: `แพ็ก${p.kit} × ${p.qty} ชุด`,
      detail: `${FEATURE_META.F3.label} · เหตุ ${p.incident} · ตัดสต็อกตามสูตรเซ็ตเมื่อยืนยันแพ็กเสร็จ`,
      badge: { label: INBOX_STATUS_META[p.status].label, tone: INBOX_STATUS_META[p.status].tone },
      cta: { label: p.status === 'NEW' ? 'ยืนยัน' : 'แพ็กเสร็จ', primary: true, page: 'inbox' },
    });
  }
  return items.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
}

export const TODOS: TodoItem[] = [...inboxTodo(), ...transportTodo()];

export const TODO_TABS: { key: 'all' | TodoGroup; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'inbox', label: 'กล่องงานเข้า' },
  { key: 'transport', label: 'ขนส่ง' },
];

/** Transport counts for the KPI cards and the status panel (own hospital only). */
export function transportStats() {
  const count = (pred: (s: (typeof SHIPMENTS)[number]) => boolean) => SHIPMENTS.filter(pred).length;
  const byStatus = (st: TransportStatus) => count((s) => s.status === st);
  return {
    waiting: count((s) => s.status === 'WAITING_DISPATCH' && isOutbound(s)),
    cancelRequested: count((s) => s.status === 'WAITING_DISPATCH' && !!s.cancelRequest),
    toReceive: count((s) => s.status === 'ARRIVED' && !isOutbound(s)),
    loaded: byStatus('LOADED'),
    inTransit: byStatus('IN_TRANSIT'),
    onTheWay: byStatus('LOADED') + byStatus('IN_TRANSIT'),
    pendingSync: count((s) => !!s.pending),
    inbox: inboxStats(),
    total: SHIPMENTS.length,
    byStatus,
  };
}

export const STATUS_ROWS: { code: TransportStatus; label: string; tone: Tone; icon: IconName }[] = (
  ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED'] as TransportStatus[]
).map((code) => ({ code, label: STATUS_META[code].label, tone: STATUS_META[code].tone, icon: STATUS_META[code].icon }));
