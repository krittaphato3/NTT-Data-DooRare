import { Icon } from '../../../components/common/icons';
import { fmtTime, useTick } from '../../../lib/time';
import { groupBatchesByHospital } from '../data/borrowView';
import { EMERGENCY_BORROWS } from '../data/incident';
import type { IncidentRecord } from '../data/incidentStore';
import { LENDERS } from '../data/stockCheck';

const th = (s: string, right = false) => (
  <th scope="col" className={right ? 'r' : undefined}>
    {s}
  </th>
);

/** Borrow status of one incident, organised by lender hospital: what we asked each one for and how it answered. */
export function IncidentBorrowStatus({ rec }: { rec: IncidentRecord }) {
  const tick = useTick();

  if (rec.seed === 'live') {
    // The live mock incident's data is item → hospitals; flip it to hospital → items.
    const hospitals = LENDERS.map((l) => ({
      ...l,
      rows: EMERGENCY_BORROWS.flatMap((b) => b.hospitals.filter((h) => h.hospital === l.name).map((h) => ({ b, h }))),
    })).filter((g) => g.rows.length > 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hospitals.map((g) => (
          <div key={g.name} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{g.name}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>เดินทาง {g.travelMin} นาที</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    {th('รายการที่ขอยืม')}
                    {th('สถานะ')}
                    {th('รายละเอียด')}
                    {th('เวลาที่เหลือ', true)}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(({ b, h }) => {
                    const left = h.countdownSecs !== undefined ? Math.max(0, h.countdownSecs - tick) : undefined;
                    return (
                      <tr key={b.name}>
                        <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                          {b.name} × {b.qty}{' '}
                          <span className={`badge ${b.tagCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{b.tag}</span>
                        </td>
                        <td>
                          <span className={`badge ${h.statusCls}`}>
                            {h.status === 'pending' && <Icon name="hourglass" className="ic12" />}
                            {(h.status === 'loaded' || h.status === 'in_transit') && <Icon name="truck" className="ic12" />}
                            {h.status === 'rejected' && <Icon name="xc" className="ic12" />}
                            {h.status === 'partial' && <Icon name="checkc" className="ic12" />}
                            {h.statusLabel}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#334155' }}>{h.detail}</td>
                        <td className="r">
                          {left !== undefined ? <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#e11d48' }}>{fmtTime(left)}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
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

  const groups = groupBatchesByHospital(rec.batches);
  if (groups.length === 0) {
    return <div className="card" style={{ padding: '12px 16px', fontSize: 12.5, color: '#64748b' }}>ยังไม่ได้ส่งคำขอยืมให้โรงพยาบาลใด</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((g) => (
        <div key={g.hospital} className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{g.hospital}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>เดินทาง {g.travelMin} นาที · ส่งล่าสุด {g.sentAt} น.</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  {th('รายการที่ขอยืม')}
                  {th('จำนวน', true)}
                  {th('ส่งเมื่อ')}
                  {th('สถานะ')}
                </tr>
              </thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={`${i.id}-${i.sentAt}`}>
                    <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                      {i.item}{' '}
                      <span className={`badge ${i.urgent ? 'ug-critical' : 'ug-normal'}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{i.urgent ? 'วิกฤต' : 'สนับสนุน'}</span>{' '}
                      <span style={{ fontFamily: 'Inter, monospace', fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{i.id}</span>
                    </td>
                    <td className="r">{i.qty} {i.unit}</td>
                    <td>{i.sentAt} น.</td>
                    <td>
                      <span className="badge st-pending">รอผู้ให้ยืมตอบ ({i.timeoutMin} นาที)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
