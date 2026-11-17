import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';
import {
  ALERT_STATUS_META,
  drugShort,
  isControlledDrug,
  NOTE_TONE_COLOR,
  SEVERITY_META,
} from '../data/stockAlerts';
import type { AlertStatus, StockAlertRow } from '../data/stockAlerts';

export type RowActionCond = 'request' | 'create' | 'ack' | 'snooze' | 'detail';

interface RowAction {
  kind: 'primary' | 'secondary';
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
  /** Rows whose borrow request is being created right now (button shows "กำลังสร้าง…" and cannot be pressed again). */
  busy?: ReadonlySet<string>;
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
 * Linked alerts offer the next step; open LOW_STOCK alerts create a request; the rest are informational.
 * Three fixed slots so every row lines up: [รายละเอียด link] [รับทราบ] [next step, primary when it moves the request on].
 */
interface RowActionSlots {
  detailLink: boolean;
  canAck: boolean;
  next: RowAction | null;
}

function actionsFor(row: StockAlertRow, status: AlertStatus, role: RoleCode): RowActionSlots {
  const controlled = isControlledDrug(row.drug);
  let next: RowAction | null = null;
  let detailLink = true;

  if (status === 'linked') {
    const isPending = !row.alert?.requestStatus || row.alert.requestStatus === 'DRAFT' || row.alert.requestStatus === 'PENDING_APPROVAL';
    next = isPending
      ? { kind: 'primary', label: 'อนุมัติคำขอ', cond: 'request', needs: 'approveBorrow' }
      : { kind: 'secondary', label: 'ติดตามคำขอ', cond: 'request' };
  } else if (status === 'open' && (row.alert?.type === 'LOW_STOCK' || row.alert?.type === 'MIN_MAX')) {
    if (controlled) {
      next = { kind: 'secondary', label: 'ดูระเบียบ', cond: 'detail' };
      detailLink = false; // the button already opens the details
    } else {
      next = {
        kind: 'primary',
        label: row.alert?.severity === 'critical' ? 'ขอยืมด่วน' : 'ขอยืม',
        cond: 'create',
        needs: 'createBorrowRequest',
      };
    }
  }
  /* Acknowledge is the authoring action for dismissing without borrowing */
  return { detailLink, canAck: status === 'open' && mayActFor(role, 'PHARMACIST', 'acknowledgeAlert'), next };
}

/** Forecast rows show "at least · target"; Min-Max rows show their limits; blood rows show nothing. */
function targetInfo(row: StockAlertRow): { range: string; target: number; mark: number } | null {
  if (row.totalTarget && row.totalTarget > 0) {
    return { range: `อย่างน้อย ${fmt(row.predict ?? 0)} · เป้า ${fmt(row.totalTarget)}`, target: row.totalTarget, mark: row.predict ?? 0 };
  }
  if (row.max) {
    return { range: `ขั้นต่ำ ${fmt(row.min ?? 0)} · สูงสุด ${fmt(row.max)}`, target: row.max, mark: row.min ?? 0 };
  }
  return null;
}

/** Stock-alert queue table — columns per spec §15.1 UI-02. */
export function StockAlertTable({ rows, acked, snoozed, created, busy, onAction, role = 'PHARMACIST' }: StockAlertTableProps) {
  return (
    <div className="scroll-x sa-scroll">
      <table className="qt sa-table">
        <thead>
          <tr>
            <th scope="col">ยา</th>
            <th scope="col" className="r"><span className="sa-n">คงเหลือ</span><span className="sa-u" /></th>
            <th scope="col" className="r"><span className="sa-n">ใช้ได้อีก</span><span className="sa-u sa-u-day" /></th>
            <th scope="col" style={{ minWidth: 190 }}>สต็อกเทียบเป้า</th>
            <th scope="col" style={{ minWidth: 130 }}>แจ้งเตือน</th>
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
            const { detailLink, canAck, next } = actionsFor(row, status, role);
            const stMeta = ALERT_STATUS_META[status];
            const short = drugShort(row.drug);
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
                <td style={{ minWidth: 240 }}>
                  <div className="sa-drug-cell">
                    <span
                      className={`ved ved-${row.ved} ved-sm`}
                      title={row.ved === 'V' ? 'Vital' : row.ved === 'E' ? 'Essential' : 'Desirable'}
                    >
                      {row.ved}
                    </span>
                    <div className="sa-drug-text">
                      <div className="sa-drug-line">
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }} title={row.drug}>{short.name}</span>
                        {isControlledDrug(row.drug) && (
                          <span
                            className="badge t-red"
                            style={{ fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            title="ยาเสพติดให้โทษ/วัตถุออกฤทธิ์ต่อจิตประสาทประเภท 2 — ห้ามยืมผ่านระบบอัตโนมัติ ต้องดำเนินการตามระเบียบ Manual สธ."
                          >
                            <Icon name="lock" className="ic12" /> ยาควบคุมพิเศษ
                          </span>
                        )}
                      </div>
                      <span className="sa-sub">
                        {short.strength}
                        {short.strength && ' · '}
                        <span className="code">{row.code}</span>
                      </span>
                    </div>
                  </div>
                </td>

                {/* คงเหลือ */}
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <span className="sa-n num sa-cell-num">{fmt(row.onHand)}</span>
                  <span className="sa-u">{row.unit}</span>
                </td>

                {/* ใช้ได้อีก — red while stock is low */}
                <td className="r" style={{ whiteSpace: 'nowrap' }} title={`ใช้เฉลี่ย ${fmt(row.dailyUse)}/วัน`}>
                  <span className="sa-n num sa-cell-num" style={daysLow ? { color: NOTE_TONE_COLOR.crit } : undefined}>
                    {fmt(row.daysLeft)}
                  </span>
                  <span className="sa-u sa-u-day">วัน</span>
                </td>

                {/* สต็อกเทียบเป้า */}
                <td>
                  {target ? (
                    <>
                      <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: '#0F2A5C', whiteSpace: 'nowrap' }}>{target.range}</span>
                      <div
                        className="sa-bar"
                        role="img"
                        aria-label={`คงเหลือ ${fmt(row.onHand)} จากเป้า ${fmt(target.target)}`}
                      >
                        <span style={{ width: `${pct}%`, background: belowPredict ? NOTE_TONE_COLOR.crit : '#16A34A' }} />
                        {/* blue tick = the "at least" level · green tick = the target */}
                        <i className="sa-bar-mark sa-bar-predict" style={{ left: `${markPct}%` }} />
                        <i className="sa-bar-mark sa-bar-target" />
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94A3B8' }}>—</span>
                  )}
                  <span className="sa-note" style={{ display: 'block', color: NOTE_TONE_COLOR[row.noteTone] }}>{row.note}</span>
                </td>

                {/* แจ้งเตือน — urgent levels and non-pending statuses only; routine + pending rows stay quiet */}
                <td>
                  {row.alert && sevMeta ? (() => {
                    let stBadgeLabel = stMeta.labelTh;
                    let stBadgeCls = stMeta.cls;
                    if (status === 'linked') {
                      stBadgeLabel = 'ขอยืมแล้ว';
                      if (row.alert.requestStatus === 'IN_PROGRESS') {
                        stBadgeLabel = 'กำลังยืม';
                        stBadgeCls = 't-blue';
                      } else if (row.alert.requestStatus === 'FULFILLED') {
                        stBadgeLabel = 'ได้รับยาแล้ว';
                        stBadgeCls = 't-green';
                      } else if (row.alert.requestStatus === 'PENDING_APPROVAL' || row.alert.requestStatus === 'DRAFT') {
                        stBadgeLabel = 'รออนุมัติ';
                        stBadgeCls = 't-amber';
                      }
                    }
                    const showSeverity = row.alert.severity !== 'normal';
                    const showStatus = status !== 'open';
                    if (!showSeverity && !showStatus && !row.alert.brNo) return <span style={{ color: '#94A3B8' }}>—</span>;
                    return (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                        {showSeverity && <Badge cls={sevMeta.cls} label={sevMeta.labelTh} en={sevMeta.labelEn} icon={sevMeta.icon} />}
                        {showStatus && <Badge cls={stBadgeCls} label={stBadgeLabel} en={stMeta.labelEn} />}
                        {row.alert.brNo && (
                          <button className="link code" style={{ fontSize: 11.5 }} onClick={() => onAction(row, 'request')}>
                            {row.alert.brNo}
                          </button>
                        )}
                      </span>
                    );
                  })() : (
                    <span style={{ color: '#94A3B8' }}>—</span>
                  )}
                </td>

                {/* Actions — one line: ack, detail link, then the main step; an empty ack slot stays on the far side so the link always sits next to the main button */}
                <td className="r">
                  <div className={`sa-actions${next ? '' : ' sa-actions-2'}`}>
                    {canAck ? (
                      <button
                        className="btn btn-sm btn-g sa-ack"
                        title="บันทึกว่ารับรู้แล้ว เช่น กำลังสั่งซื้อกับบริษัทยาอยู่แล้ว ไม่ต้องยืม"
                        disabled={busy?.has(row.id)}
                        onClick={() => onAction(row, 'ack')}
                      >
                        <Icon name="check" className="ic12" /> รับทราบ
                      </button>
                    ) : (
                      <span />
                    )}
                    {detailLink ? (
                      <button
                        className="link"
                        style={{ fontSize: 13 }}
                        title="ดูข้อมูลสต็อกและประวัติการพยากรณ์เชิงลึก"
                        onClick={() => onAction(row, 'detail')}
                      >
                        รายละเอียด
                      </button>
                    ) : (
                      <span />
                    )}
                    {next ? (
                      <button
                        className={`btn btn-sm ${next.kind === 'primary' ? 'btn-p' : 'btn-s'}`}
                        disabled={busy?.has(row.id) || (!!next.needs && !mayActFor(role, 'PHARMACIST', next.needs))}
                        aria-busy={busy?.has(row.id) || undefined}
                        title={next.needs && !mayActFor(role, 'PHARMACIST', next.needs) ? requiredRoleHint(next.needs) : undefined}
                        onClick={() => onAction(row, next.cond)}
                      >
                        {busy?.has(row.id) && next.cond === 'create' ? 'กำลังสร้างคำขอ…' : next.label}
                      </button>
                    ) : (
                      <span />
                    )}
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
