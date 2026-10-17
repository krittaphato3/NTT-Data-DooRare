import { useRef, useState } from 'react';
import { EXPIRY, HELD_LOT, NEARBY, RETURNS_INBOUND, RETURNS_OWE, WORK } from '../data/dashboard';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, maySeePeerStock, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';

/** Visible rows before Load more is pressed (cards stay fixed-size, no scroll). */
const NEARBY_PAGE = 6;
const WORK_PAGE = 7;
const RETURNS_PAGE = 6;
const EXPIRY_PAGE = 3;

function MoreButton({ expanded, remaining, onClick }: { expanded: boolean; remaining: number; onClick: () => void }) {
  // Reserve the button slot even when hidden so the layout never jumps.
  if (!expanded && remaining <= 0) return <div aria-hidden="true" style={{ height: 32, marginTop: 8, flex: 'none' }} />;
  return (
    <button
      type="button"
      className="tab"
      aria-expanded={expanded ? 'true' : 'false'}
      onClick={onClick}
      style={{ width: '100%', justifyContent: 'center', borderColor: '#E2E8F0', marginTop: 8, flex: 'none' }}
    >
      {expanded ? (
        <span>แสดงน้อยลง <span style={{ color: '#94A3B8' }}>· Show less</span></span>
      ) : (
        <span>โหลดเพิ่มเติม (เหลือ {remaining}) <span style={{ color: '#94A3B8' }}>· Load more</span></span>
      )}
    </button>
  );
}

interface MiddleRowProps {
  /** Role viewing the row; the near-expiry release action is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

export function MiddleRow({ role = 'PHARMACIST' }: MiddleRowProps) {
  const mayRelease = mayActFor(role, 'PHARMACIST', 'releaseNearExpiry');
  const releaseHint = requiredRoleHint('releaseNearExpiry');
  const [released, setReleased] = useState<Record<string, boolean>>({});
  const [histTab, setHistTab] = useState<'activity' | 'returns'>('activity');
  const overdueCount = RETURNS_OWE.filter((o) => o.overdue).length;
  /** FEFO pick order: fewest days-left first (pharmacy best practice). */
  const fefoOrder = [...EXPIRY].sort((a, b) => Number(a.days) - Number(b.days));
  /** Load-more state per card: collapsed bodies are clipped, expanded bodies scroll. */
  const [more, setMore] = useState<Record<string, boolean>>({});
  /** Show-more must not grow the card: freeze the body's height at click and scroll instead. */
  const nearbyBody = useRef<HTMLDivElement>(null);
  const workBody = useRef<HTMLDivElement>(null);
  const expiryBody = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState<Record<string, number | undefined>>({});
  const toggleMore = (k: string) => {
    const next = !more[k];
    const el = (k === 'nearby' ? nearbyBody : k === 'work' ? workBody : expiryBody).current;
    setFrozen((f) => ({ ...f, [k]: next && el ? Math.round(el.getBoundingClientRect().height) : undefined }));
    setMore((v) => ({ ...v, [k]: next }));
  };
  /** Expanded body keeps its collapsed height (scrollable); collapsed body flex-fills. */
  const bodyStyle = (k: string) => (more[k] ? { height: frozen[k], maxHeight: 'none' } : undefined);
  const nearbyVisible = more.nearby ? NEARBY : NEARBY.slice(0, NEARBY_PAGE);
  const nearbyRemaining = NEARBY.length - nearbyVisible.length;
  const activityVisible = more.work ? WORK : WORK.slice(0, WORK_PAGE);
  const oweVisible = more.work ? RETURNS_OWE : RETURNS_OWE.slice(0, RETURNS_PAGE);
  const workRemaining =
    histTab === 'activity'
      ? WORK.length - activityVisible.length
      : RETURNS_OWE.length - oweVisible.length;
  const expiryVisible = more.expiry ? EXPIRY : EXPIRY.slice(0, EXPIRY_PAGE);
  const expiryRemaining = EXPIRY.length - expiryVisible.length;
  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
      <div className="card cardpad card-fixed" data-part="nearby-hospitals" style={{ flex: '1 1 320px', minWidth: 0, gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            โรงพยาบาลใกล้เคียง <span className="en">Nearby Hospitals</span>
          </h3>
          <a href="#" className="link">ดูทั้งหมด</a>
        </div>
        <svg viewBox="0 0 320 132" role="img" aria-label="แผนที่: โรงพยาบาลสมุทรปราการ และโรงพยาบาลใกล้เคียง 4 แห่ง" style={{ width: '100%', height: 132, borderRadius: 8, border: '1px solid #E2E8F0', display: 'block', flex: 'none' }} preserveAspectRatio="xMidYMid slice">
          <rect x="0" y="0" width="320" height="132" fill="#EFF6FF" />
          <path d="M0 116 C80 108 160 120 320 112 L320 132 L0 132 Z" fill="#DBEAFE" />
          <path d="M92 -4 C104 30 78 52 98 78 C112 96 96 110 104 120" fill="none" stroke="#BFDBFE" strokeWidth="10" strokeLinecap="round" />
          <path d="M0 44 L320 30" stroke="#FFFFFF" strokeWidth="5" fill="none" />
          <path d="M120 0 L150 132" stroke="#FFFFFF" strokeWidth="4" fill="none" />
          <path d="M120 90 L320 76" stroke="#FFFFFF" strokeWidth="4" fill="none" />
          <path d="M210 0 L240 132" stroke="#FFFFFF" strokeWidth="3" fill="none" />
          <circle cx="132" cy="96" r="12" fill="#1D4ED8" fillOpacity="0.15" />
          <circle cx="132" cy="96" r="7" fill="#1D4ED8" stroke="#FFFFFF" strokeWidth="2.5" />
          <g fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" textAnchor="middle">
            <circle cx="70" cy="88" r="9" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" /><text x="70" y="91.5" fill="#1D4ED8">1</text>
            <circle cx="196" cy="30" r="9" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" /><text x="196" y="33.5" fill="#1D4ED8">2</text>
            <circle cx="246" cy="56" r="9" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" /><text x="246" y="59.5" fill="#1D4ED8">3</text>
            <circle cx="292" cy="96" r="9" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" /><text x="292" y="99.5" fill="#1D4ED8">4</text>
          </g>
          <text x="144" y="114" fontSize="10" fill="#0F2A5C" fontFamily="Noto Sans Thai, sans-serif" fontWeight="600">รพ.สมุทรปราการ (คุณ)</text>
        </svg>
        <div ref={nearbyBody} className={more.nearby ? 'card-scroll' : 'card-locked'} style={bodyStyle('nearby')}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {nearbyVisible.map((h) => (
            <li key={h.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #E2E8F0' }}>
              <span className="num" style={{ width: 22, height: 22, borderRadius: 9999, border: '1.5px solid #1D4ED8', color: '#1D4ED8', fontSize: 11, fontWeight: 600, display: 'grid', placeItems: 'center', flex: 'none' }}>
                {h.n}
              </span>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>{h.name}</div>
                <div style={{ fontSize: 12, lineHeight: '16px' }}>
                  <span className="num">{h.km}</span> กม. · <span className="num">{h.min}</span> นาที
                </div>
              </div>
              {/* Another hospital's lendable stock is Agent-internal (rbac.md §3) — own-hospital
                  scope shows only the hospital name and travel time. */}
              {maySeePeerStock(role) ? (
                <span className="badge" style={{ background: '#DCFCE7', color: '#166534' }} title="จำนวนรายการยาที่ให้ยืมได้">
                  ให้ยืมได้ <span className="num">{h.lend}</span> รายการ
                </span>
              ) : (
                <span className="badge t-grey" title="ซ่อนจำนวนยาให้ยืมของโรงพยาบาลอื่น · เห็นเฉพาะข้อมูลโรงพยาบาลตนเอง (rbac.md §3)">
                  เห็นเฉพาะ รพ.ตนเอง
                </span>
              )}
            </li>
          ))}
        </ul>
        </div>
        <MoreButton expanded={!!more.nearby} remaining={nearbyRemaining} onClick={() => toggleMore('nearby')} />
      </div>

      <div className="card cardpad card-fixed" data-part="work-history" style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ประวัติการทำงานของฉัน <span className="en">My Work History · วันนี้</span>
          </h3>
          <a href="#" className="link">ดูทั้งหมด</a>
        </div>
        <div role="tablist" aria-label="ประวัติการทำงาน" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '12px 0 0' }}>
          <button
            role="tab"
            className={`tab ${histTab === 'activity' ? 'tab-on' : ''}`}
            aria-selected={histTab === 'activity' ? 'true' : 'false'}
            onClick={() => setHistTab('activity')}
          >
            กิจกรรมล่าสุด <span className="cnt">{WORK.length}</span>
          </button>
          <button
            role="tab"
            className={`tab ${histTab === 'returns' ? 'tab-on' : ''}`}
            aria-selected={histTab === 'returns' ? 'true' : 'false'}
            onClick={() => setHistTab('returns')}
          >
            ภาระคืนยา{' '}
            {overdueCount > 0 ? (
              <span className="badge t-red" style={{ height: 20 }} title={`${overdueCount} รายการเกินกำหนด`}>
                เกินกำหนด <span className="num">{overdueCount}</span>
              </span>
            ) : (
              <span className="cnt">{RETURNS_OWE.length}</span>
            )}
          </button>
        </div>
        <div ref={workBody} className={more.work ? 'card-scroll' : 'card-locked'} style={bodyStyle('work')}>
        {histTab === 'activity' ? (
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {activityVisible.map((w) => (
            <li key={w.time + w.text.slice(0, 8)} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: 16 }}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                <span className={`av ${w.cls}`} style={{ width: 28, height: 28 }}>
                  <Icon name={w.icon as IconName} className="ic14" />
                </span>
                <span style={{ flex: '1 1 auto', width: 1, background: '#E2E8F0', marginTop: 4, minHeight: 12 }} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>{w.text}</div>
                <div style={{ fontSize: 12, lineHeight: '16px' }}>
                  <span className="num">{w.time}</span> น. · {w.sub}
                </div>
              </div>
            </li>
          ))}
        </ol>
        ) : (
        <div>
        <div style={{ fontSize: 12, lineHeight: '16px', marginTop: 12 }}>คืนเป็นยาตัวเดิม จำนวนเท่าเดิมภายใน 30 วัน (คืนเป็นเงินไม่ได้)</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F2A5C', marginTop: 10 }}>เราต้องคืน</div>
        {oweVisible.map((o) => (
          <div key={o.ref + o.drug + o.qty} className="listrow" style={{ padding: '10px 0' }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: '#0F2A5C' }}>
                <b style={{ fontWeight: 600 }}>{o.drug}</b> <span className="num">{o.qty}</span> {o.unit} → {o.to}
              </span>
              <span style={{ display: 'block', fontSize: 12 }}>
                {o.ref} · {o.mode} · ครบกำหนด{' '}
                <span className="num" style={o.overdue ? { fontWeight: 600, color: '#B91C1C' } : undefined}>{o.due}</span>
              </span>
            </span>
            <span className={`badge ${o.overdue ? 't-red' : 't-amber'}`} style={{ flex: 'none' }}>
              <Icon name={o.overdue ? 'tri' : 'undo'} className="ic14" />
              {o.overdue ? 'เกินกำหนด' : 'รอคืน'}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F2A5C', marginTop: 10, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>รอรับคืน</div>
        <div className="listrow" style={{ padding: '10px 0 0', borderTop: 0 }}>
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: '#0F2A5C' }}>
              <b style={{ fontWeight: 600 }}>{RETURNS_INBOUND.drug}</b> <span className="num">{RETURNS_INBOUND.qty}</span> {RETURNS_INBOUND.unit} ← {RETURNS_INBOUND.from}
            </span>
            <span style={{ display: 'block', fontSize: 12 }}>{RETURNS_INBOUND.ref} · คืนเป็นยาเดิม · ครบกำหนด <span className="num">{RETURNS_INBOUND.due}</span></span>
          </span>
          <span className="badge t-amber" style={{ flex: 'none' }}>
            <Icon name="undo" className="ic14" />
            รอคืน
          </span>
        </div>
        </div>
        )}
        </div>
        <MoreButton expanded={!!more.work} remaining={workRemaining} onClick={() => toggleMore('work')} />
      </div>

      <div className="card cardpad card-fixed" data-part="near-expiry" style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ยาใกล้หมดอายุ <span className="en">Near-expiry · 3 ล็อตแรก</span>
          </h3>
          <a href="#" className="link">
            ดูทั้งหมด (<span className="num">18</span>)
          </a>
        </div>
        <div ref={expiryBody} className={more.expiry ? 'card-scroll' : 'card-locked'} style={bodyStyle('expiry')}>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {expiryVisible.map((e) => {
            const fefoRank = fefoOrder.findIndex((x) => x.k === e.k) + 1;
            return (
            <li key={e.k} style={{ padding: '14px 0', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>{e.drug}</span>
                    <span className={`ved ved-${e.ved}`}>{e.ved}</span>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: '18px' }}>
                    Lot <span className="num">{e.lot}</span> · <span className="num">{e.qty}</span> · {e.where}
                  </div>
                </div>
                <span className={`badge ${e.urgent ? 'st-pending' : 'st-timeout'}`} style={{ flex: 'none' }}>
                  <Icon name="clock" className="ic14" />
                  เหลือ <span className="num">{e.days}</span> วัน
                </span>
              </div>
              <div
                title="First Expired, First Out — จ่ายล็อตที่หมดอายุก่อนออกก่อน"
                style={{ fontSize: 12, lineHeight: '18px', marginTop: 6, fontWeight: fefoRank === 1 ? 600 : 400, color: fefoRank === 1 ? '#166534' : '#475569' }}
              >
                {fefoRank === 1 ? 'จ่ายล็อตนี้ก่อน (FEFO)' : `จ่ายตามคิว FEFO · ลำดับที่ ${fefoRank}`}
              </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12 }}>
                    หมดอายุ {e.exp} · มูลค่า ฿<span className="num">{e.value}</span>
                  </span>
                  {!released[e.k] ? (
                    <button
                      className="btn btn-s btn-sm"
                      disabled={!mayRelease}
                      title={mayRelease ? undefined : releaseHint}
                      onClick={() => setReleased((v) => ({ ...v, [e.k]: true }))}
                    >
                      ปล่อยเข้าคลังกลาง
                    </button>
                  ) : (
                    <span className="badge st-pending">
                      <Icon name="hourglass" className="ic14" />
                      รอคลังกลางยืนยัน
                    </span>
                  )}
                </div>
            </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: '18px', background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
          <Icon name="lock" className="ic14" style={{ marginTop: 2, flex: 'none' }} />
          <span style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 600, color: '#0F2A5C' }}>{HELD_LOT.drug}</b> ล็อต <span className="code">{HELD_LOT.lot}</span>{' '}
            <span className="num">{HELD_LOT.qty}</span> {HELD_LOT.unit} <b style={{ fontWeight: 600, color: '#0F2A5C' }}>ถูกกันไว้</b>{' '}
            · อยู่ในแผน <span className="num">{HELD_LOT.plan}</span> ({HELD_LOT.note} · ไม่นับเป็นสต็อกใช้ได้/ให้ยืมได้)
          </span>
        </div>
        </div>
        <MoreButton expanded={!!more.expiry} remaining={expiryRemaining} onClick={() => toggleMore('expiry')} />
      </div>
    </section>
  );
}
