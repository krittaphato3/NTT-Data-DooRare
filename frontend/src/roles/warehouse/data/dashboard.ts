/** Mock data for the warehouse Dashboard (UI-01, WH view). Numbers derive from the other WH pages' data. */
import type { IconName } from '../../../components/common/icons';
import { KIT_DEFS, PACK_TASKS } from './f3';
import { FEATURE_META, INBOUND_TASKS, OUTBOUND_TASKS, outboundStats, REQUESTS, URGENT_SECONDS as INBOX_URGENT_SECONDS, inboxStats } from './inbox';
import { fmtQty, HOSPITALS, isOutbound, SHIPMENTS, STATUS_META } from './transport';
import type { Tone, TransportStatus } from './transport';
import type { WarehousePage } from './routes';

/** Seconds left on the urgent F3 request when the page loads (spec: confirm within 3–5 min). */
export const URGENT_SECONDS = INBOX_URGENT_SECONDS;

export interface KitStock {
  key: string;
  th: string;
  en: string;
  ready: number;
  target: number;
}

/** Ready-set stock per patient-set (F3), same source as the F3 page. View-only on the dashboard. */
export const KITS: KitStock[] = KIT_DEFS.map(({ key, th, en, ready, target }) => ({ key, th, en, ready, target }));

export type TodoGroup = 'inbox' | 'transport' | 'f3';

export interface TodoItem {
  id: string;
  group: TodoGroup;
  icon: IconName;
  sevCls: string;
  title: string;
  detail: string;
  badge: { label: string; tone: Tone };
  cta: { label: string; primary: boolean; page: WarehousePage };
  /** Marks the urgent request so the page can show its live countdown. */
  urgent?: boolean;
}

const byId = (id: string) => SHIPMENTS.find((s) => s.id === id)!;

/** 0) Work inbox: F1/F2/F3 tasks waiting for WH to confirm packing. */
function inboxTodo(): TodoItem[] {
  const outs = OUTBOUND_TASKS.filter((r) => r.status === 'NEW').map((r) => ({
    id: r.id, group: 'inbox' as const, icon: 'inbox' as IconName, sevCls: 'sev-urg',
    title: `ยืนยันจะแพ็ก ${r.drug} × ${fmtQty(r.qty)} ${r.unit}`,
    detail: `${FEATURE_META[r.feature].label} · ${r.ref} → ${HOSPITALS[r.to]} · ${r.due}`,
    badge: { label: 'รอยืนยัน', tone: 'amber' as Tone },
    cta: { label: 'ยืนยันจะแพ็ก', primary: true, page: 'inbox' as WarehousePage },
  }));
  const ins = INBOUND_TASKS.filter((t) => t.status === 'NEW').map((t) => ({
    id: t.id, group: 'inbox' as const, icon: 'inArrow' as IconName, sevCls: 'sev-norm',
    title: `รับทราบของที่จะเข้า ${t.drug} × ${fmtQty(t.qty)} ${t.unit}`,
    detail: `${FEATURE_META[t.feature].label} · ${t.ref} · จาก ${HOSPITALS[t.from]} · ${t.eta}`,
    badge: { label: 'รอรับทราบ', tone: 'blue' as Tone },
    cta: { label: 'รับทราบ', primary: true, page: 'inbox' as WarehousePage },
  }));
  return [...outs, ...ins];
}

/** 1) Urgent F3 requests from other hospitals the warehouse (as lender) still has to answer. */
function requestTodo(): TodoItem[] {
  return REQUESTS.filter((r) => r.status === 'NEW').map((r) => ({
    id: r.id, group: 'f3', urgent: !!r.urgent, icon: r.urgent ? 'siren' : 'inbox', sevCls: r.urgent ? 'sev-crit' : 'sev-urg',
    title: `ยืนยันคำขอเร่งด่วน ${r.drug} × ${fmtQty(r.qty)} ${r.unit}`,
    detail: `${FEATURE_META[r.feature].label} · ${r.ref} → ${HOSPITALS[r.to]} · ${r.urgent ? 'เร่งด่วน' : r.due}`,
    badge: { label: r.urgent ? 'เร่งด่วนมาก' : 'รอยืนยัน', tone: r.urgent ? 'red' : 'amber' },
    cta: { label: 'ยืนยัน', primary: true, page: 'kit' },
  }));
}

/** 2) Transport work: prepare (F1/F2 land here after the pharmacist approves) → load → receive → sync. */
function transportTodo(): TodoItem[] {
  const preparing = byId('TR-2026-000342');
  const dispatch = byId('TR-2026-000338');
  const cancelReq = byId('TR-2026-000339');
  const arrived = byId('TR-2026-000334');
  const pending = byId('TR-2026-000341');
  return [
    {
      id: preparing.id, group: 'transport', icon: 'box', sevCls: 'sev-urg',
      title: `ขึ้นรถ + ถ่ายรูป ${preparing.id}`,
      detail: `${preparing.drug} · ${fmtQty(preparing.qty)} ${preparing.unit} → ${HOSPITALS[preparing.to]} · เตรียมของตามล็อต FEFO แล้วขึ้นรถ`,
      badge: { label: 'รอขึ้นรถ', tone: 'amber' },
      cta: { label: 'ขึ้นรถ', primary: true, page: 'transport' },
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
      id: arrived.id, group: 'transport', icon: 'checkc', sevCls: 'sev-norm',
      title: `ยืนยันรับของ ${arrived.id}`,
      detail: `${arrived.drug} · ${fmtQty(arrived.qty)} ${arrived.unit} · จาก ${HOSPITALS[arrived.from]} · ถึง ${arrived.updatedAt} น.`,
      badge: { label: 'ถึงปลายทาง · รอรับ', tone: 'green' },
      cta: { label: 'ยืนยันรับของ', primary: true, page: 'transport' },
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

/** 3) Packing sets for our own incidents (F3). */
function kitTodo(): TodoItem[] {
  return PACK_TASKS.map((p) => {
    const k = KIT_DEFS.find((x) => x.key === p.kitKey)!;
    return {
      id: p.id, group: 'f3' as const, icon: 'box' as IconName, sevCls: 'sev-urg',
      title: `แพ็ก${k.th} × ${p.qty} ชุด`,
      detail: `${FEATURE_META.F3.label} · เหตุ ${p.incident} · ตัดสต็อกตามสูตรเซ็ตเมื่อยืนยันแพ็กเสร็จ`,
      badge: { label: 'รอแพ็ก', tone: 'amber' as Tone },
      cta: { label: 'แพ็ก', primary: true, page: 'kit' as WarehousePage },
    };
  });
}

export const TODOS: TodoItem[] = [...requestTodo().sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent)), ...inboxTodo(), ...transportTodo(), ...kitTodo()];

export const TODO_TABS: { key: 'all' | TodoGroup; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'inbox', label: 'กล่องงานเข้า' },
  { key: 'transport', label: 'ขนส่ง' },
  { key: 'f3', label: 'F3 ฉุกเฉิน' },
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
    total: SHIPMENTS.length,
    byStatus,
    inbox: inboxStats(),
    box: outboundStats(),
    packWaiting: PACK_TASKS.length,
  };
}

export const STATUS_ROWS: { code: TransportStatus; label: string; tone: Tone; icon: IconName }[] = (
  ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED'] as TransportStatus[]
).map((code) => ({ code, label: STATUS_META[code].label, tone: STATUS_META[code].tone, icon: STATUS_META[code].icon }));
