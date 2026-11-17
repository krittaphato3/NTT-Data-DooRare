/**
 * Builds the stock-alert screen (UI-02) from three API reads: forecasts (`GET /forecasts`), usable stock (`GET /inventory`
 * summary) and the alert queue (`GET /alerts`). Alerts are decided on the server (alerts.evaluate.ts); nothing here raises one.
 */
import type { ApiAlert, ApiAlertStatus } from '../../../services/alertsApi';
import type { ForecastItem } from '../../../services/forecastApi';
import { fmtThaiTime } from '../../warehouse/data/transportLive';
import type { Abc, AlertRef, AlertStatus, AlertType, ForecastMethod, NoteTone, Severity, StockAlertRow, SummaryCard } from './stockAlerts';

const ABC_VALUES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'V'];
const METHOD_MAP: Record<string, ForecastMethod> = { QUANTILE_LGBM: 'QUANTILE_LGBM', FALLBACK_CLASSICAL: 'MA_ES', MA_ES: 'MA_ES', COLD_START: 'COLD_START', MIN_MAX: 'MIN_MAX' };
const SEVERITY: Record<ApiAlert['severity'], Severity> = { VERY_URGENT: 'critical', URGENT: 'urgent', NORMAL: 'normal' };
const STATUS: Partial<Record<ApiAlertStatus, AlertStatus>> = { OPEN: 'open', ACKNOWLEDGED: 'acknowledged', LINKED_TO_REQUEST: 'linked', SNOOZED: 'snoozed' };

const round = (n: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

function alertRef(a: ApiAlert | undefined): AlertRef | null {
  if (!a) return null;
  return {
    alertId: a.id,
    type: a.type as AlertType,
    severity: SEVERITY[a.severity],
    status: STATUS[a.status] ?? 'open',
    time: fmtThaiTime(a.updatedAt),
    ...(a.request ? { brNo: a.request.requestNo, requestStatus: a.request.status } : {}),
  };
}

function noteFor(a: ApiAlert | undefined, row: { onHand: number; daysLeft: number; predict: number | null; totalTarget: number | null }): { note: string; noteTone: NoteTone } {
  if (a) {
    /* The days left already have their own column, so the note only says why the alert exists. */
    switch (a.type) {
      case 'LOW_STOCK': return { note: 'ต่ำกว่าที่ควรมี', noteTone: 'crit' };
      case 'ORDER_AHEAD': return { note: 'ต่ำกว่าเป้า · เตรียมสั่งซื้อ', noteTone: 'warn' };
      case 'ORDER_EARLIER': return { note: 'ควรสั่งซื้อให้เร็วขึ้น', noteTone: 'warn' };
      case 'MIN_MAX': return { note: 'ต่ำกว่าระดับขั้นต่ำ', noteTone: 'crit' };
      case 'LOW_CONFIDENCE': return { note: 'ข้อมูลน้อย · พยากรณ์อาจคลาดเคลื่อน', noteTone: 'info' };
      default: return { note: row.daysLeft < 999 ? `ใช้ได้อีก ${row.daysLeft.toLocaleString('en-US', { maximumFractionDigits: 1 })} วัน` : 'ไม่มีข้อมูลการใช้', noteTone: 'info' };
    }
  }
  return { note: 'คงเหลือเพียงพอ', noteTone: 'ok' };
}

/** One row per forecast item (WEEK); alert-only listings (e.g. Min-Max items) get a row from the alert itself. */
export function buildStockAlertRows(forecasts: ForecastItem[], usable: Map<string, number>, alerts: ApiAlert[]): StockAlertRow[] {
  const byDrug = new Map<string, ApiAlert>();
  for (const a of alerts) {
    const key = a.hospitalDrug.id;
    const current = byDrug.get(key);
    if (!current || (a.granularity === 'WEEK' && current.granularity !== 'WEEK')) byDrug.set(key, a);
  }
  const rows: StockAlertRow[] = [];
  const seen = new Set<string>();
  for (const f of forecasts) {
    if (seen.has(f.hospitalDrugId)) continue;
    seen.add(f.hospitalDrugId);
    const a = byDrug.get(f.hospitalDrugId);
    const onHand = usable.get(f.hospitalDrugId) ?? a?.stockQty ?? 0;
    const dailyUse = f.uPerDay ?? 0;
    const daysLeft = dailyUse > 0 ? round(onHand / dailyUse, 2) : 999;
    const predict = f.p50 === null ? null : round(f.p50);
    const lowConfidence = f.flags.includes('LOW_CONFIDENCE') || f.flags.includes('COLD_START');
    rows.push({
      id: f.hospitalDrugId,
      drug: f.itemName ?? f.itemCode ?? f.hospitalDrugId,
      code: f.itemCode ?? '—',
      ved: f.ved ?? 'D',
      abc: (f.abc && ABC_VALUES.includes(f.abc) ? f.abc : '–') as Abc,
      onHand: round(onHand, 2),
      unit: f.baseUnit ?? a?.hospitalDrug.localUnit ?? '—',
      daysLeft,
      dailyUse: round(dailyUse, 2),
      predict,
      totalTarget: f.totalTarget,
      ...noteFor(a, { onHand, daysLeft, predict, totalTarget: f.totalTarget }),
      method: f.method ? (METHOD_MAP[f.method] ?? null) : null,
      methodNote: lowConfidence ? 'ข้อมูลพยากรณ์น้อย' : 'ปกติ',
      lowConfidence,
      alert: alertRef(a),
    });
  }
  for (const a of byDrug.values()) {
    if (seen.has(a.hospitalDrug.id)) continue;
    const onHand = usable.get(a.hospitalDrug.id) ?? a.stockQty ?? 0;
    rows.push({
      id: a.hospitalDrug.id,
      drug: a.drugName ?? a.hospitalDrug.localName,
      code: a.hospitalDrug.localCode,
      ved: a.hospitalDrug.ved,
      abc: (a.hospitalDrug.abc && ABC_VALUES.includes(a.hospitalDrug.abc) ? a.hospitalDrug.abc : '–') as Abc,
      onHand: round(onHand, 2),
      unit: a.baseUnit ?? a.hospitalDrug.localUnit,
      daysLeft: 999,
      dailyUse: 0,
      predict: null,
      totalTarget: null,
      ...noteFor(a, { onHand, daysLeft: 999, predict: null, totalTarget: null }),
      method: a.type === 'MIN_MAX' ? 'MIN_MAX' : null,
      methodNote: 'ปกติ',
      lowConfidence: false,
      alert: alertRef(a),
    });
  }
  return rows;
}

/** The five cards above the queue, counted from the active alerts (near-expiry comes from the dashboard). */
export function buildSummaryCards(alerts: ApiAlert[], nearExpiry: number | null): SummaryCard[] {
  const of = (...types: string[]) => alerts.filter((a) => types.includes(a.type));
  const low = of('LOW_STOCK');
  const sev = (s: string) => low.filter((a) => a.severity === s).length;
  return [
    { key: 'LOW_STOCK', labelTh: 'สต็อกต่ำ', count: low.length, subTh: `เร่งด่วนมาก ${sev('VERY_URGENT')} · เร่งด่วน ${sev('URGENT')} · ปกติ ${sev('NORMAL')}`, tone: 'crit' },
    { key: 'ORDER_AHEAD', labelTh: 'เตรียมสั่งซื้อ', count: of('ORDER_AHEAD', 'ORDER_EARLIER').length, subTh: 'ต่ำกว่าเป้า · เตรียมสั่งซื้อล่วงหน้า', tone: 'warn' },
    { key: 'MIN_MAX', labelTh: 'ต่ำกว่าระดับขั้นต่ำ', count: of('MIN_MAX').length, subTh: 'ยากลุ่ม D ที่ตั้งขั้นต่ำ–สูงสุด', tone: 'blue' },
    { key: 'LOW_CONFIDENCE', labelTh: 'พยากรณ์ไม่มั่นใจ', count: of('LOW_CONFIDENCE').length, subTh: 'ประวัติการใช้ยาไม่ถึง 90 วัน', tone: 'warn' },
    { key: 'NEAR_EXPIRY', labelTh: 'ใกล้หมดอายุ', count: nearExpiry ?? 0, subTh: 'ภายใน 180 วัน', tone: 'teal', href: '?page=expiry' },
  ];
}
