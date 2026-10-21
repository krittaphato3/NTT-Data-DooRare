import { useRef, useState } from 'react';
import { ALERTS, ALERT_TABS } from '../data/dashboard';
import type { Alert } from '../data/dashboard';
import { alertRowToDashboard } from '../data/dashboardLive';
import { useStockAlerts } from '../data/useStockAlerts';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { withRole } from '../../../data/navigation';
import { fmtTime, useTick } from '../../../lib/time';
import { AgentSuggestion } from './AgentSuggestion';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';

interface AlertsPanelProps {
  query: string;
  hospital: string;
  /** Role viewing the panel; the alert actions are gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/**
 * The primary alert button is a write action. Map its label to the §5.2 action it performs so the
 * gate can name the role that owns it. Anything not recognised falls to `approveBorrow`, the
 * stricter of the two.
 */
function primaryAction(label: string): Action {
  return label === 'สร้างคำขอ' ? 'createBorrowRequest' : 'approveBorrow';
}

const ALL_HOSPITALS = 'ทุกโรงพยาบาล (12)';

/** Visible rows before Load more is pressed (card stays nonscrollable by default). */
const ALERTS_PAGE = 6;

type AlertStatus = 'open' | 'linked' | 'acked' | 'snoozed';

const STATUS_META: Record<AlertStatus, { label: string; cls: string; icon: IconName }> = {
  open: { label: 'เปิด', cls: 't-amber', icon: 'bell' },
  linked: { label: 'ผูกคำขอแล้ว', cls: 't-green', icon: 'link' },
  acked: { label: 'รับทราบแล้ว', cls: 't-blue', icon: 'eye' },
  snoozed: { label: 'เลื่อนเตือน', cls: 't-grey', icon: 'moon' },
};

function statusOf(a: Alert, acked: boolean, snoozed: boolean): AlertStatus {
  if (a.status) return a.status === 'acknowledged' ? 'acked' : a.status;
  if (snoozed) return 'snoozed';
  if (acked) return 'acked';
  if (a.req) return 'linked';
  return 'open';
}

export function AlertsPanel({ query, hospital, role = 'PHARMACIST' }: AlertsPanelProps) {
  const [tab, setTab] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const tableWrap = useRef<HTMLDivElement>(null);
  /** Show more must not grow the card: freeze the table height at click, then scroll. */
  const [frozenBody, setFrozenBody] = useState<number | undefined>(undefined);
  const applyExpanded = (next: boolean) => {
    const el = tableWrap.current;
    setFrozenBody(next && el ? Math.round(el.getBoundingClientRect().height) : undefined);
    setExpanded(next);
  };
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
  const [snoozed, setSnoozed] = useState<ReadonlySet<string>>(new Set());
  const tick = useTick();
  const sa = useStockAlerts();
  const live = sa.source === 'live';
  const demo = !live && sa.source === 'mock' && mockFallbackEnabled();
  const [busyId, setBusyId] = useState<string | null>(null);
  const allAlerts: Alert[] = live ? sa.rows.map(alertRowToDashboard).filter((x): x is Alert => x !== null) : demo ? ALERTS : [];
  const tabs = live
    ? [
        { key: 'all', label: 'ทั้งหมด', count: allAlerts.length },
        { key: 'shortage', label: 'สต็อกต่ำ/เตรียมสั่ง', count: allAlerts.filter((a) => a.type === 'shortage').length },
        { key: 'request', label: 'ผูกคำขอแล้ว', count: allAlerts.filter((a) => a.type === 'request').length },
      ]
    : ALERT_TABS;
  const q = query.trim().toLowerCase();
  // Live alerts are already scoped to the signed-in hospital by the API; the name filter only makes sense on the multi-hospital mock.
  const h = live || hospital === ALL_HOSPITALS ? '' : hospital;

  const filtered = allAlerts.filter((a) => {
    if (tab !== 'all' && a.type !== tab) return false;
    if (h !== '' && !(a.drug + a.msg).includes(h)) return false;
    if (q !== '' && !(a.drug + a.msg + a.typeLabel).toLowerCase().includes(q)) return false;
    return true;
  });
  // The Agent suggestion is a fixture (no agent is connected yet): shown only in demo mode.
  const showAgent = mockFallbackEnabled() && (tab === 'all' || tab === 'shortage');
  /* Acknowledge / snooze are authoring actions the role either has or does not — they are hidden. */
  const mayAcknowledge = mayActFor(role, 'PHARMACIST', 'acknowledgeAlert');
  const visible = expanded ? filtered : filtered.slice(0, ALERTS_PAGE);
  const remaining = filtered.length - visible.length;

  return (
    <div className="card equal-card cardpad--alerts" data-part="alerts" style={{ flex: '3 1 560px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          การแจ้งเตือน <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Alerts</span>
        </h2>
        <span style={{ fontSize: 12, lineHeight: '16px' }}>เรียงตาม: ยา V ก่อน แล้วตามมูลค่าผลกระทบ</span>
      </div>
      <div role="tablist" aria-label="กรองการแจ้งเตือน" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '12px 0 16px' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={`tab ${tab === t.key ? 'tab-on' : ''}`}
            aria-selected={tab === t.key ? 'true' : 'false'}
            onClick={() => {
              setTab(t.key);
              applyExpanded(false);
            }}
          >
            {t.label} <span className="cnt">{t.count}</span>
          </button>
        ))}
      </div>

      {showAgent && <AgentSuggestion role={role} />}

      <div
        ref={tableWrap}
        className="scroll-x equal-scroll"
        style={{ maxHeight: 'none', height: expanded ? frozenBody : undefined }}
      >
        <table className="qt">
          <thead>
            <tr>
              <th scope="col">ยา</th>
              <th scope="col">เงื่อนไข</th>
              <th scope="col">คงเหลือ · ใช้ได้อีก</th>
              <th scope="col">สถานะ</th>
              <th scope="col" className="r"><span className="srt">การดำเนินการ</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const st = statusOf(a, acked.has(a.drug), snoozed.has(a.drug));
              const meta = STATUS_META[st];
              const showAck = st === 'open' && mayAcknowledge;
              const showSnooze = (st === 'open' || st === 'acked') && mayAcknowledge;
              /* Row decisions stay visible: a role that may not act sees them disabled with a hint. */
              const pa = a.primary ? primaryAction(a.action) : null;
              const mayAct = pa === null || mayActFor(role, 'PHARMACIST', pa);
              const hint = pa === null ? undefined : requiredRoleHint(pa);
              return (
                <tr key={a.alertId ?? a.drug}>
                  <td style={{ minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`sev ${a.sevCls}`} title={a.sevLabel}>
                        <Icon name={a.icon as IconName} className="ic20" />
                      </span>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{a.drug}</span>
                      <span className={`ved ved-${a.ved} ved-sm`} title={a.vedLabel}>{a.ved}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${a.sevCls}`} title={a.sevLabel}>
                      <Icon name={a.icon as IconName} className="ic14" />
                      {a.sevLabel}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{a.typeLabel}</span>
                  </td>
                  <td>
                    <span style={{ color: a.msgCritical ? '#B91C1C' : undefined }}>
                      {a.msg}
                      {a.liveSecs !== undefined && (
                        <> – เหลือ <span className="num">{fmtTime(a.liveSecs - tick)}</span></>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${meta.cls}`}>
                      <Icon name={meta.icon} className="ic14" />
                      {meta.label}
                    </span>
                    {a.req && (
                      <a href="#" className="code alert-req" style={{ color: '#1D4ED8' }} onClick={(e) => e.preventDefault()}>
                        {a.req}
                      </a>
                    )}
                  </td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className={`btn btn-sm ${a.primary ? 'btn-p' : 'btn-s'}`}
                      disabled={!mayAct}
                      title={mayAct ? undefined : hint}
                      onClick={() => {
                        if (a.alertId) window.location.search = withRole(a.req ? '?page=requests' : '?page=alerts', role);
                      }}
                    >
                      {a.action}
                    </button>
                    {(showAck || showSnooze) && (
                      <span className="alert-actions">
                        {showAck && (
                          <button
                            className="link"
                            style={{ fontSize: 12.5 }}
                            disabled={busyId === a.alertId}
                            onClick={() => {
                              if (!a.alertId) return setAcked((prev) => new Set(prev).add(a.drug));
                              setBusyId(a.alertId);
                              sa.ack(a.alertId).finally(() => setBusyId(null));
                            }}
                          >
                            รับทราบ
                          </button>
                        )}
                        {showSnooze && (
                          <button
                            className="link"
                            style={{ fontSize: 12.5 }}
                            title="เลื่อนการแจ้งเตือน 4 ชั่วโมง"
                            disabled={busyId === a.alertId}
                            onClick={() => {
                              if (!a.alertId) return setSnoozed((prev) => new Set(prev).add(a.drug));
                              setBusyId(a.alertId);
                              sa.snooze(a.alertId, 'เลื่อนจากหน้าภาพรวม', 4).finally(() => setBusyId(null));
                            }}
                          >
                            เลื่อน 4 ชม.
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', borderTop: '1px solid #E2E8F0' }}>ไม่มีการแจ้งเตือนในหมวดนี้</div>
      )}
      {filtered.length > ALERTS_PAGE && (
        <div style={{ paddingTop: 8 }}>
          <button
            type="button"
            className="tab"
            aria-expanded={expanded ? 'true' : 'false'}
            onClick={() => applyExpanded(!expanded)}
            style={{ width: '100%', justifyContent: 'center', borderColor: '#E2E8F0' }}
          >
            {expanded ? (
              <span>แสดงน้อยลง <span style={{ color: '#94A3B8' }}>· Show less</span></span>
            ) : (
              <span>โหลดเพิ่มเติม (เหลือ {remaining}) <span style={{ color: '#94A3B8' }}>· Load more</span></span>
            )}
          </button>
        </div>
      )}
      <div className="equal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '12px 0', display: 'flex', justifyContent: 'center' }}>
        <a href={withRole('?page=alerts', role)} className="link">
          ดูการแจ้งเตือนทั้งหมด (<span className="num">{live ? allAlerts.length : 14}</span>)
        </a>
      </div>
    </div>
  );
}
