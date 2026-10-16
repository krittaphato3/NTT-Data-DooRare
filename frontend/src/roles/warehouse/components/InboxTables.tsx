import { Icon } from '../../../components/common/icons';
import { fmtQty, HOSPITALS } from '../data/transport';
import { whHref } from '../data/routes';
import type { InboundItem, OutboundItem, PackTask } from '../data/inbox';
import { FeatureBadge, InboxStatusBadge } from './InboxBadges';
import { StatusBadge } from './StatusBadge';

const idStyle = { fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 } as const;

function actionLabel(status: OutboundItem['status'] | PackTask['status'], pack = false): [string, string] {
  if (status === 'NEW') return [pack ? 'ยืนยันจะเตรียม' : 'ยืนยันจะเตรียม', 'btn-p'];
  if (status === 'PREPARING') return [pack ? 'ยืนยันแพ็กเสร็จ' : 'เตรียมเสร็จ', 'btn-p'];
  return ['ดูรายละเอียด', 'btn-s'];
}

interface OutProps {
  rows: OutboundItem[];
  activeId: string | null;
  urgentLeft: string;
  onOpen: (id: string) => void;
}

export function OutboundTable({ rows, activeId, urgentLeft, onOpen }: OutProps) {
  return (
    <div className="scroll-x">
      <table className="tbl ib-tbl" aria-label="งานที่ต้องเตรียมส่งออก">
        <thead>
          <tr>
            <th style={{ width: 190 }}>งาน</th>
            <th>ยา · จำนวน</th>
            <th style={{ width: 170 }}>ล็อตที่หยิบ (FEFO)</th>
            <th style={{ width: 170 }}>ปลายทาง</th>
            <th style={{ width: 170 }}>กำหนด</th>
            <th style={{ width: 170 }}>สถานะ</th>
            <th style={{ width: 140 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [label, cls] = actionLabel(r.status);
            return (
              <tr key={r.id} className={activeId === r.id ? 'r-active' : ''}>
                <td>
                  <button className="rowbtn code" style={idStyle} onClick={() => onOpen(r.id)}>
                    {r.id}
                  </button>
                  <span style={{ display: 'block', marginTop: 2 }}>
                    <FeatureBadge feature={r.feature} small />
                  </span>
                  <span className="code" style={{ display: 'block', fontSize: 11 }}>{r.ref}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                  <span style={{ display: 'block', fontSize: 12.5 }}>
                    <span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{fmtQty(r.qty)}</span> {r.unit}
                  </span>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {r.pick.map((p) => (
                    <div key={p.lot}>
                      <span className="code">{p.lot}</span> · <span className="num">{fmtQty(p.qty)}</span>
                    </div>
                  ))}
                </td>
                <td style={{ fontSize: 12.5, color: '#0F2A5C' }}>
                  <Icon name="outArrow" className="ic14" style={{ verticalAlign: '-2px', color: '#9A3412' }} /> {HOSPITALS[r.to]}
                  <span className="sub" style={{ display: 'block' }}>{r.requestedBy}</span>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {r.urgent && r.status === 'NEW' ? (
                    <span style={{ color: '#B91C1C', fontWeight: 600 }}>
                      เหลือ <span className="ib-timer">{urgentLeft}</span>
                    </span>
                  ) : (
                    r.due
                  )}
                </td>
                <td>
                  <InboxStatusBadge status={r.status} />
                  {r.status === 'READY' && r.transportId && (
                    <span className="code" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>→ {r.transportId}</span>
                  )}
                </td>
                <td className="r">
                  <button className={`btn btn-sm ${cls}`} onClick={() => onOpen(r.id)}>{label}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PackProps {
  rows: PackTask[];
  activeId: string | null;
  onOpen: (id: string) => void;
}

export function PackTable({ rows, activeId, onOpen }: PackProps) {
  return (
    <div className="scroll-x">
      <table className="tbl ib-tbl" aria-label="งานแพ็กเซ็ต F3">
        <thead>
          <tr>
            <th style={{ width: 190 }}>งาน</th>
            <th>ชุดยา · จำนวนที่ต้องแพ็ก</th>
            <th style={{ width: 200 }}>สต็อกเซ็ตพร้อมใช้</th>
            <th style={{ width: 190 }}>เหตุการณ์</th>
            <th style={{ width: 170 }}>สถานะ</th>
            <th style={{ width: 140 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [label, cls] = actionLabel(r.status, true);
            const pct = Math.round((r.readyNow / r.target) * 100);
            return (
              <tr key={r.id} className={activeId === r.id ? 'r-active' : ''}>
                <td>
                  <button className="rowbtn code" style={idStyle} onClick={() => onOpen(r.id)}>{r.id}</button>
                  <span style={{ display: 'block', marginTop: 2 }}>
                    <FeatureBadge feature="F3" small />
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.kit}</span> <span className="en">{r.kitEn}</span>
                  <span style={{ display: 'block', fontSize: 12.5 }}>
                    <span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{r.qty}</span> ชุด
                  </span>
                </td>
                <td>
                  <span className="num" style={{ fontSize: 12.5, color: '#0F2A5C' }}>{r.readyNow}/{r.target}</span>
                  <div className="wh-bar" role="img" aria-label={`พร้อมใช้ ${pct}%`} style={{ marginTop: 4 }}>
                    <span style={{ width: `${pct}%`, background: pct >= 80 ? '#166534' : pct >= 50 ? '#D97706' : '#B91C1C' }} />
                  </div>
                </td>
                <td className="code">{r.incident}</td>
                <td><InboxStatusBadge status={r.status} /></td>
                <td className="r">
                  <button className={`btn btn-sm ${cls}`} onClick={() => onOpen(r.id)}>{label}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InboundTable({ rows }: { rows: InboundItem[] }) {
  return (
    <div className="scroll-x">
      <table className="tbl ib-tbl" aria-label="ของที่กำลังจะเข้า">
        <thead>
          <tr>
            <th style={{ width: 190 }}>งาน</th>
            <th>ยา · จำนวน</th>
            <th style={{ width: 190 }}>มาจาก</th>
            <th style={{ width: 260 }}>สถานะต้นทาง</th>
            <th style={{ width: 150 }}>คาดว่าถึง</th>
            <th style={{ width: 150 }}>
              <span className="srt">ติดตาม</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="code" style={idStyle}>{r.id}</span>
                <span style={{ display: 'block', marginTop: 2 }}>
                  <FeatureBadge feature={r.feature} small />
                </span>
                <span className="code" style={{ display: 'block', fontSize: 11 }}>{r.ref}</span>
              </td>
              <td>
                <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                <span style={{ display: 'block', fontSize: 12.5 }}>
                  <span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{fmtQty(r.qty)}</span> {r.unit}
                </span>
              </td>
              <td style={{ fontSize: 12.5, color: '#0F2A5C' }}>
                <Icon name="inArrow" className="ic14" style={{ verticalAlign: '-2px', color: '#1D4ED8' }} /> {HOSPITALS[r.from]}
              </td>
              <td style={{ fontSize: 12.5 }}>
                {r.transportStatus ? <StatusBadge status={r.transportStatus} /> : r.stage}
                {r.transportStatus && <span className="code" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>{r.transportId}</span>}
              </td>
              <td className="num" style={{ fontSize: 12.5 }}>{r.eta}</td>
              <td className="r">
                {r.transportId ? (
                  <a className="btn btn-sm btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>ดูที่ติดตามการขนส่ง</a>
                ) : (
                  <span className="sub">ยังไม่ขึ้นรถ</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
