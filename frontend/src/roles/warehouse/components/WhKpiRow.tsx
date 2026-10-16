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
            กล่องงานเข้า รอยืนยัน<span className="en" style={{ display: 'block' }}>Work inbox</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#FEF3C7', color: '#92400E' }}>
            <Icon name="inbox" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{t.box.newTotal}</div>
        <div style={subStyle}>
          ยืนยันจะแพ็ก · F1 <span className="num">{t.box.f1}</span> · F2 <span className="num">{t.box.f2}</span> · F3 <span className="num">{t.box.f3}</span>
        </div>
      </div>
      <div className="card kpi-card">
        <div style={headStyle}>
          <span style={labelStyle}>
            เตรียมของ<span className="en" style={{ display: 'block' }}>To prepare</span>
          </span>
          <span className="sev" style={{ width: 32, height: 32, background: '#FFEDD5', color: '#9A3412' }}>
            <Icon name="box" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#0F2A5C' }}>{t.preparing}</div>
        <div style={subStyle}>งานใหม่จากเภสัชกร (F1/F2) และ F3 ที่ยืนยันแล้ว</div>
      </div>
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
          เตรียมเสร็จแล้ว · มี <span className="num">{t.cancelRequested}</span> งานที่ปลายทางขอยกเลิก
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
      <div className="card kpi-card wh-kpi-urgent">
        <div style={headStyle}>
          <span style={labelStyle}>
            คำขอเร่งด่วนรอยืนยัน<span className="en" style={{ display: 'block' }}>Urgent lender requests</span>
          </span>
          <span className="sev sev-crit" style={{ width: 32, height: 32 }}>
            <Icon name="siren" />
          </span>
        </div>
        <div className="num kpi-num" style={{ color: '#B91C1C' }}>{t.inbox.newTotal}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '16px', color: '#B91C1C' }}>
          <Icon name="clock" className="ic14" />
          เหลือ <span className="wh-timer">{urgentLeft}</span> · F3 ฝั่งผู้ให้
        </div>
      </div>
    </section>
  );
}
