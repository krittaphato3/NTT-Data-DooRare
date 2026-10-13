import { Icon } from './icons';

export function KpiRow() {
  return (
    <section aria-label="สรุปตัวชี้วัด" className="kpi-row">
      <div className="card" style={{ flex: '1 1 190px', padding: '16px 18px', borderColor: '#FECACA' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            ยารายการเสี่ยงขาด<span className="en" style={{ display: 'block' }}>At-risk items</span>
          </span>
          <span className="sev sev-crit" style={{ width: 32, height: 32 }}>
            <Icon name="tri" />
          </span>
        </div>
        <div className="num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: '#B91C1C', marginTop: 6 }}>12</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#B91C1C' }}>
          <Icon name="trendUp" className="ic14" />
          <span className="num">+3</span> จากเมื่อวาน · V <span className="num">4</span> รายการ
        </div>
      </div>
      <div className="card" style={{ flex: '1 1 190px', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            คำขอรออนุมัติ<span className="en" style={{ display: 'block' }}>Pending approvals</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#FEF3C7', color: '#92400E' }}>
            <Icon name="hourglass" />
          </span>
        </div>
        <div className="num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C', marginTop: 6 }}>5</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#92400E' }}>
          <Icon name="clock" className="ic14" />
          <span className="num">2</span> รายการเหลือ &lt; 1 ชม.
        </div>
      </div>
      <div className="card" style={{ flex: '1 1 190px', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            กำลังจัดส่ง<span className="en" style={{ display: 'block' }}>In transit</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#DBEAFE', color: '#1E40AF' }}>
            <Icon name="truck" />
          </span>
        </div>
        <div className="num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C', marginTop: 6 }}>3</div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#475569' }}>
          ถึงภายในวันนี้ <span className="num">2</span> · ขาเข้า <span className="num">1</span> / ขาออก <span className="num">2</span>
        </div>
      </div>
      <div className="card" style={{ flex: '1 1 190px', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            ยาใกล้หมดอายุ<span className="en" style={{ display: 'block' }}>Near-expiry lots</span>
          </span>
          <span className="sev sev-norm" style={{ width: 32, height: 32 }}>
            <Icon name="calx" />
          </span>
        </div>
        <div className="num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C', marginTop: 6 }}>18</div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#475569' }}>
          ภายใน <span className="num">90</span> วัน · มูลค่า ฿<span className="num">46,200</span>
        </div>
      </div>
      <div className="card" style={{ flex: '1 1 190px', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            อัตราขาดสต็อก<span className="en" style={{ display: 'block' }}>Stockout rate · ต.ค.</span>
          </span>
          <svg viewBox="0 0 64 24" width="64" height="24" role="img" aria-label="แนวโน้ม 6 เดือน ลดลง" style={{ flex: 'none' }}>
            <path d="M2 6 L14 8 L26 7 L38 12 L50 15 L62 19" fill="none" stroke="#166534" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="62" cy="19" r="2.5" fill="#166534" />
          </svg>
        </div>
        <div className="num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C', marginTop: 6 }}>2.1%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#166534' }}>
          <Icon name="trendDown" className="ic14" />↓ <span className="num">14%</span> vs เดือนที่แล้ว · ลด over/understock ฿<span className="num">184k</span>
        </div>
      </div>
    </section>
  );
}
