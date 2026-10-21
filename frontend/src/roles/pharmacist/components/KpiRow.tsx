import { Icon } from '../../../components/common/icons';
import { useDashboardTiles } from '../data/useDashboardTiles';

export function KpiRow() {
  const t = useDashboardTiles();
  const v = (n: number | undefined) => (n === undefined ? '–' : n.toLocaleString('en-US'));
  const inTransit = t ? t.transport.outInFlight + t.transport.inOnTheWay : undefined;
  return (
    <section aria-label="สรุปตัวชี้วัด" className="kpi-row" data-part="kpi-row">
      <div className="card kpi-card" style={{ borderColor: '#FECACA' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            ยารายการเสี่ยงขาด<span className="en" style={{ display: 'block' }}>At-risk items</span>
          </span>
          <span className="sev sev-crit" style={{ width: 32, height: 32 }}>
            <Icon name="tri" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#B91C1C' }}>{v(t?.stockAlerts.active)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#B91C1C' }}>
          <Icon name="trendUp" className="ic14" />
          เร่งด่วน <span className="num">{v(t?.stockAlerts.urgent)}</span> รายการ
        </div>
      </div>
      <div className="card kpi-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            คำขอรออนุมัติ<span className="en" style={{ display: 'block' }}>Pending approvals</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#FEF3C7', color: '#92400E' }}>
            <Icon name="hourglass" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{v(t?.borrowRequests.pendingApproval)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#92400E' }}>
          <Icon name="clock" className="ic14" />
          กำลังขอยืม <span className="num">{v(t?.borrowRequests.inProgress)}</span> · ส่งต่อผู้ดูแล <span className="num">{v(t?.borrowRequests.escalated)}</span>
        </div>
      </div>
      <div className="card kpi-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            กำลังจัดส่ง<span className="en" style={{ display: 'block' }}>In transit</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#DBEAFE', color: '#1E40AF' }}>
            <Icon name="truck" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{v(inTransit)}</div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#475569' }}>
          ขาเข้า <span className="num">{v(t?.transport.inOnTheWay)}</span> / ขาออก <span className="num">{v(t?.transport.outInFlight)}</span> · รอรับ <span className="num">{v(t?.transport.toReceive)}</span>
        </div>
      </div>
      <div className="card kpi-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            ยาใกล้หมดอายุ<span className="en" style={{ display: 'block' }}>Near-expiry lots</span>
          </span>
          <span className="sev sev-norm" style={{ width: 32, height: 32 }}>
            <Icon name="calx" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{v(t?.nearExpiry.detected)}</div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#475569' }}>
          ล็อตที่จะหมดอายุใน 90 วัน <span className="num">{v(t?.inventory.expiringWithin90Days)}</span> · หมดอายุแล้วแต่ยังมีของ <span className="num">{v(t?.inventory.expired)}</span> · ในคลังกลาง <span className="num">{v(t?.nearExpiry.inPool)}</span>
        </div>
      </div>
      <div className="card kpi-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 }}>
            อัตราขาดสต็อก<span className="en" style={{ display: 'block' }}>Stockout rate · ต.ค.</span>
          </span>
          <svg viewBox="0 0 64 24" width="64" height="24" role="img" aria-label="แนวโน้ม 6 เดือน ลดลง" style={{ flex: 'none' }}>
            <path d="M2 6 L14 8 L26 7 L38 12 L50 15 L62 19" fill="none" stroke="#166534" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="62" cy="19" r="2.5" fill="#166534" />
          </svg>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>–</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#166534' }}>
          ยังไม่มีข้อมูล (รอรายงานมูลค่า)
        </div>
      </div>
    </section>
  );
}
