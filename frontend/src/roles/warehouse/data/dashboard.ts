/** Mock data for the warehouse Dashboard (UI-01, WH view). Transport numbers derive from SHIPMENTS. */
import type { IconName } from '../../../components/common/icons';
import { fmtQty, HOSPITALS, isOutbound, SHIPMENTS, STATUS_META } from './transport';
import type { Tone, TransportStatus } from './transport';
import type { WarehousePage } from './routes';

/** Seconds left on the urgent lender request when the page loads (spec: confirm within 3–5 min). */
export const URGENT_SECONDS = 160;

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

export type TodoGroup = 'transport' | 'f3';

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

const F3_TODO: TodoItem[] = [
  {
    id: 'BR-2026-000131', group: 'f3', icon: 'siren', sevCls: 'sev-crit', urgent: true,
    title: 'ยืนยันคำขอยืมเร่งด่วน BR-2026-000131',
    detail: 'ผู้ขอ รพ.บางพลี · Adrenaline 1 mg/mL · 30 AMP · เหตุ INC-2026-0007',
    badge: { label: 'เร่งด่วนมาก', tone: 'red' },
    cta: { label: 'ยืนยัน', primary: true, page: 'kit' },
  },
  {
    id: 'PK-2026-0012', group: 'f3', icon: 'box', sevCls: 'sev-urg',
    title: 'แพ็กชุดบาดเจ็บ × 4',
    detail: 'เหตุ INC-2026-0007 · ตัดสต็อกตามสูตรเซ็ตเมื่อยืนยันแพ็กเสร็จ',
    badge: { label: 'รอแพ็ก', tone: 'amber' },
    cta: { label: 'แพ็ก', primary: true, page: 'kit' },
  },
  {
    id: 'PK-2026-0013', group: 'f3', icon: 'box', sevCls: 'sev-urg',
    title: 'แพ็กชุดใส่ท่อช่วยหายใจ × 2',
    detail: 'เหตุ INC-2026-0007 · สต็อกเซ็ตพร้อมใช้ 5 ชุด',
    badge: { label: 'รอแพ็ก', tone: 'amber' },
    cta: { label: 'แพ็ก', primary: true, page: 'kit' },
  },
];

export const TODOS: TodoItem[] = [F3_TODO[0], ...transportTodo(), F3_TODO[1], F3_TODO[2]];

export const TODO_TABS: { key: 'all' | TodoGroup; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'transport', label: 'ขนส่ง' },
  { key: 'f3', label: 'เตรียมชุดยา F3' },
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
  };
}

export const STATUS_ROWS: { code: TransportStatus; label: string; tone: Tone; icon: IconName }[] = (
  ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED'] as TransportStatus[]
).map((code) => ({ code, label: STATUS_META[code].label, tone: STATUS_META[code].tone, icon: STATUS_META[code].icon }));
