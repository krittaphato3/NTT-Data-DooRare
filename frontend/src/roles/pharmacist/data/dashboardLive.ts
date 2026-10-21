/** Maps the live stock-alert rows onto the dashboard alert list (UI-01 alerts panel). */
import { ALERT_TYPE_META, SEVERITY_META } from './stockAlerts';
import type { StockAlertRow } from './stockAlerts';
import type { Alert } from './dashboard';

const SEV_CLS = { critical: 'sev-crit', urgent: 'sev-urg', normal: 'sev-norm' } as const;
const VED_LABEL = { V: 'Vital', E: 'Essential', D: 'Desirable' } as const;
const SHORTAGE = ['LOW_STOCK', 'MIN_MAX', 'ORDER_AHEAD', 'ORDER_EARLIER'];

export function alertRowToDashboard(r: StockAlertRow): Alert | null {
  const a = r.alert;
  if (!a) return null;
  const linked = a.status === 'linked';
  const create = a.type === 'LOW_STOCK' && !linked;
  return {
    type: linked ? 'request' : SHORTAGE.includes(a.type) ? 'shortage' : 'other',
    sevCls: SEV_CLS[a.severity],
    sevLabel: `ระดับ${SEVERITY_META[a.severity].labelTh}`,
    icon: linked ? 'inbox' : a.severity === 'critical' ? 'tri' : 'alertc',
    drug: r.drug,
    ved: r.ved,
    vedLabel: VED_LABEL[r.ved],
    typeLabel: ALERT_TYPE_META[a.type].th,
    msg: `${r.note} · คงเหลือ ${r.onHand.toLocaleString('en-US')} ${r.unit}`,
    msgCritical: r.noteTone === 'crit',
    time: a.time,
    action: linked ? 'ดูคำขอ' : create ? 'สร้างคำขอ' : 'ดูรายละเอียด',
    primary: create,
    ...(a.brNo ? { req: a.brNo } : {}),
    alertId: a.alertId,
    status: a.status,
  };
}
