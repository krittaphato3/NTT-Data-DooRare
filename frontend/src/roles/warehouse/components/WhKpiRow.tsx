import { Icon } from '../../../components/common/icons';
import { transportStats } from '../data/dashboard';

const labelStyle = { fontSize: 13, lineHeight: '18px', color: '#0F2A5C', fontWeight: 500 } as const;
const headStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const subStyle = { fontSize: 12, lineHeight: '16px', color: '#475569' } as const;

/** Five at-a-glance counters for the warehouse officer (no Value/model metrics: not in the WH role). */
export function WhKpiRow({ urgentLeft }: { urgentLeft: string }) {
  const t = transportStats();
  return (
    <section aria-label="สรุปงานคลัง" className="kpi-row" data-part="kpi-row">
      <div className="card kpi-card">
        <div style={headStyle}>
          <span style={labelStyle}>
            รอขึ้นรถ<span className="en" style={{ display: 'block' }}>Waiting dispatch</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#FEF3C7', color: '#92400E' }}>
            <Icon name="hourglass" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{t.waiting}</div>
        <div style={{ ...subStyle, color: '#92400E' }}>
          งานขาออก · มี <span className="num">{t.cancelRequested}</span> งานที่ปลายทางขอยกเลิก
        </div>
      </div>
      <div className="card kpi-card">
        <div style={headStyle}>
          <span style={labelStyle}>
            รอยืนยันรับของ<span className="en" style={{ display: 'block' }}>Awaiting receipt</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#DCFCE7', color: '#166534' }}>
            <Icon name="checkc" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{t.toReceive}</div>
        <div style={subStyle}>ถึงปลายทางแล้ว · สต็อกเพิ่มเมื่อยืนยันรับ</div>
      </div>
      <div className="card kpi-card">
        <div style={headStyle}>
          <span style={labelStyle}>
            อยู่ระหว่างจัดส่ง<span className="en" style={{ display: 'block' }}>On the way</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#DBEAFE', color: '#1E40AF' }}>
            <Icon name="truck" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{t.onTheWay}</div>
        <div style={subStyle}>
          ขึ้นรถแล้ว <span className="num">{t.loaded}</span> · กำลังเดินทาง <span className="num">{t.inTransit}</span>
        </div>
      </div>
      <div className="card kpi-card">
        <div style={headStyle}>
          <span style={labelStyle}>
            งานแพ็กเซ็ต F3<span className="en" style={{ display: 'block' }}>Pack tasks</span>
          </span>
          <span className="sev sev-norm" style={{ width: 32, height: 32 }}>
            <Icon name="box" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>2</div>
        <div style={subStyle}>
          ชุดบาดเจ็บ <span className="num">4</span> · ใส่ท่อช่วยหายใจ <span className="num">2</span>
        </div>
      </div>
      <div className="card kpi-card wh-kpi-urgent">
        <div style={headStyle}>
          <span style={labelStyle}>
            คำขอเร่งด่วนรอยืนยัน<span className="en" style={{ display: 'block' }}>Urgent lender requests</span>
          </span>
          <span className="sev sev-crit" style={{ width: 32, height: 32 }}>
            <Icon name="siren" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#B91C1C' }}>1</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#B91C1C' }}>
          <Icon name="clock" className="ic14" />
          เหลือ <span className="wh-timer">{urgentLeft}</span> · ฝั่งผู้ให้
        </div>
      </div>
    </section>
  );
}
