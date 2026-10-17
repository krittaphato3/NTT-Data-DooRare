import { Icon } from '../../../components/common/icons';
import { fmtTime, useTick } from '../../../lib/time';
import { EMERGENCY_BORROWS } from '../data/incident';

/** UI-11 emergency borrow: one card per item with the lender hospitals asked and their countdowns. */
export function BorrowPanel() {
  const tick = useTick();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#1e40af', fontSize: 13 }}>
              BR-2026-000134
            </span>
            <span className="badge ug-critical" style={{ height: 18, fontSize: 10.5 }}>
              EMERGENCY
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#1e3a8a' }}>
            ส่งพร้อมกันถึง รพ.ที่มีของและมาถึงทัน (เวลาเดินทาง ≤ ETA ที่เหลือ) · รายแรกที่ยืนยันได้จำนวนนั้น ที่เหลือถูกปรับ/ยกเลิกทันที · หมดเวลา: วิกฤต 3 นาที · สนับสนุน 5 นาที ไม่เกิน ETA
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', background: '#ffffff', padding: '4px 10px', borderRadius: 6, border: '1px solid #dbeafe' }}>
          ไม่มีการยืนยันจาก Agent — ผู้ให้ยืมยืนยันเอง
        </div>
      </div>

      {/* List of 5 Emergency Borrow Cards */}
      {EMERGENCY_BORROWS.map((item) => (
        <div key={item.name} className="card" style={{ padding: '14px 18px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                {item.name} × {item.qty}
              </span>
              <span className={`badge ${item.tagCls}`} style={{ height: 18, fontSize: 10.5 }}>
                {item.tag}
              </span>
              {item.extraBadge && (
                <span className={`badge ${item.extraBadgeCls || 'badge-blue'}`} style={{ height: 18, fontSize: 10.5 }}>
                  {item.extraBadge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.subHeader}</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th scope="col">โรงพยาบาล</th>
                  <th scope="col" style={{ width: 100 }}>เดินทาง</th>
                  <th scope="col" style={{ width: 130 }}>สถานะ</th>
                  <th scope="col">รายละเอียด</th>
                  <th scope="col" className="r" style={{ width: 100 }}>เวลาที่เหลือ</th>
                </tr>
              </thead>
              <tbody>
                {item.hospitals.map((hosp) => {
                  const hospLeft = hosp.countdownSecs !== undefined ? Math.max(0, hosp.countdownSecs - tick) : 0;
                  return (
                    <tr key={hosp.hospital}>
                      <td style={{ fontWeight: 600, color: '#0f2a5c', minWidth: 160 }}>
                        {hosp.hospital}
                      </td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{hosp.eta}</td>
                      <td>
                        <span className={`badge ${hosp.statusCls}`}>
                          {hosp.status === 'pending' && <Icon name="hourglass" className="ic12" />}
                          {hosp.status === 'loaded' && <Icon name="truck" className="ic12" />}
                          {hosp.status === 'in_transit' && <Icon name="truck" className="ic12" />}
                          {hosp.status === 'rejected' && <Icon name="xc" className="ic12" />}
                          {hosp.status === 'partial' && <Icon name="checkc" className="ic12" />}
                          {hosp.statusLabel}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#334155' }}>{hosp.detail}</td>
                      <td className="r">
                        {hosp.countdownSecs !== undefined ? (
                          <span
                            style={{
                              fontFamily: 'Inter, monospace',
                              fontWeight: 700,
                              color: '#e11d48',
                              fontSize: 13,
                            }}
                          >
                            {fmtTime(hospLeft)}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
