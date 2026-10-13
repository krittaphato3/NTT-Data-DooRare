import { useState } from 'react';
import { EXPIRY, NEARBY, WORK } from '../data/dashboard';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';

export function MiddleRow() {
  const [released, setReleased] = useState<Record<string, boolean>>({});
  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
      <div className="card cardpad" data-part="nearby-hospitals" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            โรงพยาบาลใกล้เคียง <span className="en">Nearby Hospitals</span>
          </h3>
          <a href="#" className="link">ดูทั้งหมด</a>
        </div>
        <svg viewBox="0 0 320 132" role="img" aria-label="แผนที่: โรงพยาบาลสมุทรปราการ และโรงพยาบาลใกล้เคียง 4 แห่ง" style={{ width: '100%', height: 132, borderRadius: 8, border: '1px solid #E2E8F0', display: 'block' }} preserveAspectRatio="xMidYMid slice">
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
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {NEARBY.map((h) => (
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
              <span className="badge" style={{ background: '#DCFCE7', color: '#166534' }} title="จำนวนรายการยาที่ให้ยืมได้">
                ให้ยืมได้ <span className="num">{h.lend}</span> รายการ
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card cardpad" data-part="work-history" style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ประวัติการทำงานของฉัน <span className="en">My Work History · วันนี้</span>
          </h3>
          <a href="#" className="link">ดูทั้งหมด</a>
        </div>
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {WORK.map((w) => (
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
      </div>

      <div className="card cardpad" data-part="near-expiry" style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ยาใกล้หมดอายุ <span className="en">Near-expiry · 3 ล็อตแรก</span>
          </h3>
          <a href="#" className="link">
            ดูทั้งหมด (<span className="num">18</span>)
          </a>
        </div>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {EXPIRY.map((e) => (
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
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12 }}>
                    หมดอายุ {e.exp} · มูลค่า ฿<span className="num">{e.value}</span>
                  </span>
                  {!released[e.k] ? (
                    <button className="btn btn-s btn-sm" onClick={() => setReleased((v) => ({ ...v, [e.k]: true }))}>ปล่อยเข้าคลังกลาง</button>
                  ) : (
                    <span className="badge st-pending">
                      <Icon name="hourglass" className="ic14" />
                      รอคลังกลางยืนยัน
                    </span>
                  )}
                </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
