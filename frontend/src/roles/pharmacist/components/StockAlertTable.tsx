import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';
import {
  ALERT_STATUS_META,
  ALERT_TYPE_META,
  NOTE_TONE_COLOR,
  SEVERITY_META,
} from '../data/stockAlerts';
import type { AlertStatus, StockAlertRow } from '../data/stockAlerts';

export type RowActionCond = 'request' | 'create' | 'ack' | 'snooze' | 'detail';

interface RowAction {
  kind: 'primary' | 'secondary' | 'link';
  label: string;
  cond: RowActionCond;
  /** Action the button performs; when the viewer lacks it the button renders disabled with a hint. */
  needs?: Action;
}

interface StockAlertTableProps {
  rows: StockAlertRow[];
  /** Rows the pharmacist acknowledged / snoozed / already turned into a request (local demo state). */
  acked: ReadonlySet<string>;
  snoozed: ReadonlySet<string>;
  created: ReadonlySet<string>;
  onAction: (row: StockAlertRow, cond: RowActionCond) => void;
  /** Role viewing the table; every row action is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Badge with an optional leading glyph (`title` keeps the English gloss off-screen). */
function Badge({ cls, label, en, icon }: { cls: string; label: string; en?: string; icon?: IconName }) {
  return (
    <span
      className={`badge ${cls}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title={en ? `${label} / ${en}` : label}
    >
      {icon && <Icon name={icon} className="ic14" />}
      {label}
    </span>
  );
}

/**
 * Row actions (spec §15.1 UI-02: ack / snooze / create borrow request).
 * Linked alerts offer the next step; open LOW_STOCK alerts create a request;
 * overstock and low-confidence alerts are informational only (BR-F1a-010/015).
 * Button weight follows the spec: สร้างคำขอ / ตรวจสอบและอนุมัติ = primary (blue),
 * ดูคำขอ = secondary (white + gray border).
 */
function actionsFor(row: StockAlertRow, status: AlertStatus, role: RoleCode): RowAction[] {
  const out: RowAction[] = [];
  if (status === 'linked') {
    const critical = row.alert?.severity === 'critical';
    out.push(
      critical
        ? { kind: 'primary', label: 'ตรวจสอบและอนุมัติ', cond: 'request', needs: 'approveBorrow' }
        : { kind: 'secondary', label: 'ดูคำขอ', cond: 'request' },
    );
  } else if (status === 'open' && row.alert?.type === 'LOW_STOCK') {
    out.push({ kind: 'primary', label: 'สร้างคำขอ', cond: 'create', needs: 'createBorrowRequest' });
  }
  /* Acknowledge / snooze are authoring actions the role either has or does not — they are hidden. */
  if (mayActFor(role, 'PHARMACIST', 'acknowledgeAlert')) {
    if (status === 'open') {
      out.push({ kind: 'link', label: 'รับทราบ', cond: 'ack' });
      out.push({ kind: 'link', label: 'เลื่อน', cond: 'snooze' });
    } else if (status === 'acknowledged') {
      out.push({ kind: 'link', label: 'เลื่อน', cond: 'snooze' });
    }
  }
  out.push({ kind: 'link', label: 'รายละเอียด', cond: 'detail' });
  return out;
}

/** Predict/TT rows show the P50 · target range; Min-Max rows show min/max; blood rows show nothing. */
function targetInfo(row: StockAlertRow): { range: string; target: number; mark: number } | null {
  if (row.totalTarget && row.totalTarget > 0) {
    return { range: `${fmt(row.predict ?? 0)} · ${fmt(row.totalTarget)}`, target: row.totalTarget, mark: row.predict ?? 0 };
  }
  if (row.max) {
    return { range: `Min ${fmt(row.min ?? 0)} · Max ${fmt(row.max)}`, target: row.max, mark: row.min ?? 0 };
  }
  return null;
}

/** Stock-alert queue table — columns per spec §15.1 UI-02. */
export function StockAlertTable({ rows, acked, snoozed, created, onAction, role = 'PHARMACIST' }: StockAlertTableProps) {
  return (
    <div className="scroll-x sa-scroll">
      <table className="qt">
        <thead>
          <tr>
            <th scope="col">ยา</th>
            <th scope="col">ABC</th>
            <th scope="col" className="r">คงเหลือ</th>
            <th scope="col" className="r">ใช้ได้อีก</th>
            <th scope="col" style={{ minWidth: 170 }}>Predict · Total Target</th>
            <th scope="col">วิธีพยากรณ์</th>
            <th scope="col" style={{ minWidth: 190 }}>แจ้งเตือน</th>
            <th scope="col" className="r"><span className="srt">การดำเนินการ</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status: AlertStatus = snoozed.has(row.id)
              ? 'snoozed'
              : acked.has(row.id)
                ? 'acknowledged'
                : created.has(row.id)
                  ? 'linked'
                  : (row.alert?.status ?? 'open');
            const actions = actionsFor(row, status, role);
            const buttons = actions.filter((a) => a.kind !== 'link');
            const links = actions.filter((a) => a.kind === 'link');
            const stMeta = ALERT_STATUS_META[status];
            const typeMeta = row.alert ? ALERT_TYPE_META[row.alert.type] : null;
            const sevMeta = row.alert ? SEVERITY_META[row.alert.severity] : null;
            const target = targetInfo(row);
            const pct = target ? Math.max(0, Math.min(1, row.onHand / target.target)) * 100 : 0;
            const markPct = target ? Math.max(0, Math.min(1, target.mark / target.target)) * 100 : 0;
            /* Fill colour follows stock vs Predict (design): red below, green otherwise. */
            const belowPredict = target ? row.onHand < target.mark : false;
            const daysLow = row.noteTone === 'crit';

            return (
              <tr key={row.id}>
                {/* ยา — V/E badge, then name + HIS code */}
                <td style={{ minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={`ved ved-${row.ved} ved-sm`}
                      title={row.ved === 'V' ? 'Vital' : row.ved === 'E' ? 'Essential' : 'Desirable'}
                    >
                      {row.ved}
                    </span>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{row.drug}</span>
                  </div>
                  <span className="code">{row.code}</span>
                </td>

                {/* ABC */}
                <td><span className="code">{row.abc}</span></td>

                {/* คงเหลือ */}
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <span className="num sa-cell-num">{fmt(row.onHand)}</span>{' '}
                  <span style={{ fontSize: 12 }}>{row.unit}</span>
                </td>

                {/* ใช้ได้อีก — red while stock is low */}
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <span className="num sa-cell-num" style={daysLow ? { color: NOTE_TONE_COLOR.crit } : undefined}>
                    {fmt(row.daysLeft)}
                  </span>{' '}
                  <span style={{ fontSize: 12 }}>วัน</span>
                  <span style={{ display: 'block', fontSize: 12 }}>ใช้ {fmt(row.dailyUse)}/วัน</span>
                </td>

                {/* Predict · Total Target */}
                <td>
                  {target ? (
                    <>
                      <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: '#0F2A5C' }}>{target.range}</span>
                      <div
                        className="sa-bar"
                        role="img"
                        aria-label={`คงเหลือ ${fmt(row.onHand)} จากเป้า ${fmt(target.target)}`}
                      >
                        <span style={{ width: `${pct}%`, background: belowPredict ? NOTE_TONE_COLOR.crit : '#16A34A' }} />
                        {/* blue tick = Predict · green tick = Total Target */}
                        <i className="sa-bar-mark sa-bar-predict" style={{ left: `${markPct}%` }} />
                        <i className="sa-bar-mark sa-bar-target" />
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94A3B8' }}>—</span>
                  )}
                  <span className="sa-note" style={{ display: 'block', color: NOTE_TONE_COLOR[row.noteTone] }}>{row.note}</span>
                </td>

                {/* วิธีพยากรณ์ */}
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className="code" style={{ display: 'block', color: '#0F2A5C' }}>{row.method ?? '—'}</span>
                  <span className={`badge ${row.lowConfidence ? 't-red' : 't-grey'}`}>{row.methodNote}</span>
                </td>

                {/* แจ้งเตือน */}
                <td>
                  {row.alert && sevMeta && stMeta && typeMeta ? (
                    <>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        <Badge cls={sevMeta.cls} label={sevMeta.labelTh} en={sevMeta.labelEn} icon={sevMeta.icon} />
                        <Badge cls={stMeta.cls} label={stMeta.labelTh} en={stMeta.labelEn} />
                      </span>
                      <span className="sa-alert-meta">
                        {typeMeta.th} · {row.alert.time}
                        {row.alert.brNo && (
                          <>
                            {' '}
                            <button className="link code" style={{ fontSize: 11.5 }} onClick={() => onAction(row, 'request')}>
                              {row.alert.brNo}
                            </button>
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#94A3B8' }}>—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="r">
                  <div className="sa-actions">
                    {buttons.map((a) => {
                      const allowed = !a.needs || mayActFor(role, 'PHARMACIST', a.needs);
                      const hint = a.needs ? requiredRoleHint(a.needs) : undefined;
                      return (
                        <button
                          key={a.cond}
                          className={`btn btn-sm ${a.kind === 'primary' ? 'btn-p' : 'btn-s'}`}
                          disabled={!allowed}
                          title={allowed ? undefined : hint}
                          onClick={() => onAction(row, a.cond)}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                    <span className="sa-links">
                      {links.map((a) => (
                        <button
                          key={a.cond}
                          className="link"
                          style={{ fontSize: 12.5 }}
                          title={a.cond === 'snooze' ? 'ซ่อนแจ้งเตือนนี้ชั่วคราว (1-168 ชม. พร้อมเหตุผล) · ครบเวลาแล้วกลับมาเป็น “เปิด” เอง' : undefined}
                          onClick={() => onAction(row, a.cond)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="sa-empty">ไม่พบรายการที่ตรงกับตัวกรอง</p>}
    </div>
  );
}
