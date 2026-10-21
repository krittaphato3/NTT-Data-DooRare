import { useRef, useState } from 'react';
import { INCOMING, LENDING, ST_CLS, ST_ICON, UG_CLS, UG_ICON } from '../data/dashboard';
import { fmtTime, useTick } from '../../../lib/time';
import { useAuth } from '../../../context/AuthContext';
import { withRole } from '../../../data/navigation';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { lenderRowToRow, ownRequestToRow } from '../data/requestPanelLive';
import { useBorrowRequests } from '../data/useBorrowRequests';
import { useLenderQueue } from '../data/useLenderQueue';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';

const FLOW = [
  { key: 'pending', th: 'รอดำเนินการ', en: 'Pending' },
  { key: 'approved', th: 'อนุมัติแล้ว', en: 'Approved' },
  { key: 'transit', th: 'กำลังจัดส่ง', en: 'In Transit' },
  { key: 'delivered', th: 'ส่งถึงแล้ว', en: 'Delivered' },
];
const FAIL = [
  { key: 'rejected', th: 'ปฏิเสธ', en: 'Rejected' },
  { key: 'timeout', th: 'หมดเวลา', en: 'Timeout' },
];
const STEPS = ['ขึ้นรถแล้ว', 'กำลังจัดส่ง', 'ส่งถึงแล้ว'];
const ALL_HOSPITALS = 'ทุกโรงพยาบาล (12)';

interface RequestStatusPanelProps {
  query: string;
  hospital: string;
  /** Role viewing the panel; the request actions are gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/**
 * The row button performs a write action; map its label to the §5.2 action it needs so the gate can
 * name the role that owns it. Unrecognised primary labels fall to `approveBorrow`, the stricter one.
 */
function rowAction(label: string): Action {
  return label === 'พิจารณา' ? 'confirmLend' : 'approveBorrow';
}

export function RequestStatusPanel({ query, hospital, role = 'PHARMACIST' }: RequestStatusPanelProps) {
  const [reqTab, setReqTab] = useState<'in' | 'out'>('in');
  const [status, setStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);
  const listBody = useRef<HTMLDivElement>(null);
  /** Show more must not grow the card: freeze the list height at click, then scroll. */
  const [frozenBody, setFrozenBody] = useState<number | undefined>(undefined);
  const applyExpanded = (next: boolean) => {
    const el = listBody.current;
    setFrozenBody(next && el ? Math.round(el.getBoundingClientRect().height) : undefined);
    setExpanded(next);
  };
  const tick = useTick();
  const q = query.trim().toLowerCase();
  const h = hospital !== ALL_HOSPITALS ? hospital : '';

  const { user } = useAuth();
  const me = user?.hospitalName ?? '';
  const own = useBorrowRequests();
  const lend = useLenderQueue();
  const demo = mockFallbackEnabled() && (own.source === 'mock' || lend.source === 'mock');
  const incoming = demo ? INCOMING : own.requests.slice(0, 60).map((r) => ownRequestToRow(r, me));
  const lending = demo ? LENDING : lend.requests.slice(0, 60).map((r) => lenderRowToRow(r, me));
  const list = reqTab === 'in' ? incoming : lending;
  const rows = list.filter((r) => {
    if (status !== null && r.st !== status) return false;
    if (h !== '' && r.from !== h && r.to !== h) return false;
    if (q !== '' && !(r.id + r.drug + r.from + r.to).toLowerCase().includes(q)) return false;
    return true;
  });
  const count = (k: string) => list.filter((r) => r.st === k).length;
  const filterName = status !== null ? FLOW.concat(FAIL).find((f) => f.key === status)?.th ?? '' : '';
  const resetPage = () => applyExpanded(false);
  const PAGE = 3;
  const visible = expanded ? rows : rows.slice(0, PAGE);
  const remaining = rows.length - visible.length;

  return (
    <div className="card equal-card cardpad" data-part="request-status" style={{ flex: '2 1 420px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          สถานะคำขอ <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Request Status</span>
        </h2>
        <span style={{ fontSize: 12 }}>ล่าสุด</span>
      </div>
      <div role="tablist" aria-label="ประเภทคำขอ" style={{ display: 'flex', gap: 4, padding: 4, background: '#F1F5F9', borderRadius: 10, margin: '12px 0 14px' }}>
        {([
          { k: 'in', th: 'คำขอที่ฉันขอ', en: 'Incoming needs' },
          { k: 'out', th: 'คำขอที่ขอจากเรา', en: 'Lending requests' },
        ] as const).map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={reqTab === t.k ? 'true' : 'false'}
            onClick={() => { setReqTab(t.k); setStatus(null); resetPage(); }}
            style={{ flex: '1 1 0', height: 40, border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 13, lineHeight: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: reqTab === t.k ? '#FFFFFF' : 'transparent', color: reqTab === t.k ? '#0F2A5C' : '#475569', fontWeight: reqTab === t.k ? 600 : 500, boxShadow: reqTab === t.k ? '0 1px 2px rgba(15,42,92,.08)' : 'none' }}
          >
            <span>{t.th}</span>
            <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 400, color: '#475569' }}>{t.en}</span>
          </button>
        ))}
      </div>

      <div className="tiles4" style={{ display: 'grid', gap: 6, position: 'relative' }}>
        {FLOW.map((s) => (
          <button
            key={s.key}
            className={`tile tile-${s.key} ${status === s.key ? 'tile-on tab-on' : ''}`}
            aria-pressed={status === s.key ? 'true' : 'false'}
            onClick={() => { setStatus((v) => (v === s.key ? null : s.key)); resetPage(); }}
            title={`กรองตาม ${s.en}`}
          >
            <span className="n">{count(s.key)}</span>
            <span className={`tl c-${s.key}`}>
              <Icon name={ST_ICON[s.key] as IconName} className="ic14" />
              {s.th}
            </span>
            <span style={{ fontSize: 11, lineHeight: '14px', color: '#475569' }}>{s.en}</span>
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="tiles4" style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <span style={{ height: 3, borderRadius: 9999, background: '#FCD34D' }} />
        <span style={{ height: 3, borderRadius: 9999, background: '#86EFAC' }} />
        <span style={{ height: 3, borderRadius: 9999, background: '#93C5FD' }} />
        <span style={{ height: 3, borderRadius: 9999, background: '#5EEAD4' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <span style={{ fontSize: 12, marginRight: 2 }}>ไม่สำเร็จ:</span>
        {FAIL.map((s) => (
          <button
            key={s.key}
            className={`tab ${status === s.key ? 'tab-on' : ''}`}
            aria-pressed={status === s.key ? 'true' : 'false'}
            onClick={() => { setStatus((v) => (v === s.key ? null : s.key)); resetPage(); }}
            style={{ height: 30, borderColor: '#E2E8F0' }}
          >
            <span className={`tl c-${s.key}`}>
              <Icon name={ST_ICON[s.key] as IconName} className="ic14" />
              {s.th} · {s.en}
            </span>
            <span className="cnt">{count(s.key)}</span>
          </button>
        ))}
        {status !== null && (
          <button className="link" onClick={() => { setStatus(null); resetPage(); }} style={{ marginLeft: 'auto' }}>
            ล้างตัวกรอง ({filterName})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '18px 0 4px' }}>
        <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
          คำขอล่าสุด <span className="en">Recent requests</span>
        </h3>
        <a href={withRole(reqTab === 'in' ? '?page=requests' : '?page=lend', role)} className="link">ดูทั้งหมด</a>
      </div>
      <div aria-label="คำขอล่าสุด" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
        <div ref={listBody} className="equal-scroll" style={{ maxHeight: 'none', height: expanded ? frozenBody : undefined }}>
        {visible.map((r) => {
          const left = (r.secs ?? 0) - tick;
          const urgent = r.st === 'pending' && r.secs !== undefined && left < 1800;
          const stBadge = (
            <span className={`badge ${ST_CLS[r.st]}`} title={r.stEn}>
              <Icon name={ST_ICON[r.st] as IconName} className="ic14" />
              {r.stTh}
            </span>
          );
          const ugBadge = (
            <span className={`badge ${UG_CLS[r.ug]}`}>
              <Icon name={UG_ICON[r.ug] as IconName} className="ic14" />
              {r.ugLabel}
            </span>
          );
          return (
            <div
              key={r.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: urgent ? '#FFFBFB' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px' }}>
                <span className="num" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 500 }}>#{r.id}</span>
                {reqTab === 'in' ? stBadge : ugBadge}
                {reqTab === 'in' ? ugBadge : stBadge}
                <span style={{ flex: '1 1 0' }} />
                {r.st === 'pending' && r.secs !== undefined && (
                  <span className={`timer ${left < 1800 ? 'timer-crit' : 'timer-warn'}`}>
                    <Icon name="clock" className="ic14" />
                    เหลือ {fmtTime(left)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, color: '#0F2A5C' }}>
                {reqTab === 'out' ? <>{r.to} ขอ </> : null}
                <b style={{ fontWeight: 600 }}>{r.drug}</b>
                {' · '}<span className="num">{r.qty}</span> {r.unit}
              </div>
              <div style={{ fontSize: 12, lineHeight: '18px', display: 'flex', alignItems: 'center', gap: 4 }}>
                {r.from} <Icon name="arrow" className="ic14" /> {r.to}
              </div>
              {r.st === 'transit' && (
                <span style={{ display: 'block', minWidth: 150 }}>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {STEPS.map((_, i) => (
                      <span key={i} className={`seg ${i < (r.step ?? 1) - 1 ? 'seg-done' : i === (r.step ?? 1) - 1 ? 'seg-cur' : 'seg-todo'}`} />
                    ))}
                  </span>
                  <span style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    {STEPS.map((l, i) => (
                      <span key={l} className={`sl ${i < (r.step ?? 1) - 1 ? 'sl-done' : i === (r.step ?? 1) - 1 ? 'sl-cur' : 'sl-todo'}`}>{l}</span>
                    ))}
                  </span>
                </span>
              )}
              {r.note && (
                <div style={{ fontSize: 12.5, lineHeight: '18px', color: r.st === 'transit' ? '#1E40AF' : undefined }}>{r.note}</div>
              )}
              <div>
                {(() => {
                  /* A pending row needs a pharmacist decision: visible, but disabled with a hint. */
                  const needed = r.actionPrimary ? rowAction(r.action) : null;
                  const allowed = needed === null || mayActFor(role, 'PHARMACIST', needed);
                  return (
                    <button
                      className={`btn btn-sm ${r.actionPrimary ? 'btn-p' : 'btn-g'}`}
                      onClick={() => { window.location.search = withRole(reqTab === 'in' ? '?page=requests' : '?page=lend', role); }}
                      disabled={!allowed}
                      title={allowed || needed === null ? undefined : requiredRoleHint(needed)}
                    >
                      {r.action}
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13 }}>ไม่มีคำขอสถานะ “{filterName}” ในรายการล่าสุด</div>
        )}
        </div>
        {rows.length > PAGE && (
          <div className="equal-footer" style={{ paddingTop: 8 }}>
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
      </div>
    </div>
  );
}
