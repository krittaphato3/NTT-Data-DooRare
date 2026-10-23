import { Icon } from '../../../components/common/icons';
import type { InboundTask } from '../data/inbox';
import { whHref } from '../data/routes';
import { fmtQty, HOSPITALS } from '../data/transport';
import { FeatureBadge } from './InboxBadges';

/** Goods other hospitals are sending us (heads-up). WH confirms receipt on Transport tracking when they arrive. */
interface InboundTableProps {
  rows: InboundTask[];
  /** Ids acknowledged in this session. */
  acked: ReadonlySet<string>;
  onAck: (id: string) => void;
}

export function InboundTable({ rows, acked, onAck }: InboundTableProps) {
  return (
    <div className="scroll-x">
      <table className="tbl ib-tbl" aria-label="ของที่จะรับเข้า">
        <thead>
          <tr>
            <th style={{ width: 190 }}>งาน</th>
            <th>ยา · จำนวน</th>
            <th style={{ width: 180 }}>มาจาก</th>
            <th style={{ width: 260 }}>สถานะ</th>
            <th style={{ width: 150 }}>คาดว่าถึง</th>
            <th style={{ width: 200 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const arrived = r.stage.startsWith('ถึงปลายทาง');
            const isAcked = acked.has(r.id) || r.status !== 'NEW';
            const isNew = !isAcked;
            const transportInHref = `${whHref('transport')}&dir=in&task=${encodeURIComponent(r.transportId || r.id)}`;
            return (
              <tr key={r.id}>
                <td>
                  <span className="code" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>{r.id}</span>
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
                  <span className={`badge ${arrived ? 't-green' : isNew ? 't-blue' : 't-grey'}`}>
                    {isAcked && !arrived ? 'รับทราบแล้ว · ต้นทางกำลังเตรียมของ' : r.stage}
                  </span>
                </td>
                <td className="num" style={{ fontSize: 12.5 }}>{r.eta}</td>
                <td className="r">
                  {isNew ? (
                    <button className="btn btn-sm btn-p" onClick={() => onAck(r.id)}>รับทราบ</button>
                  ) : arrived ? (
                    <a className="btn btn-sm btn-p" href={transportInHref} style={{ textDecoration: 'none' }}>ยืนยันรับของ</a>
                  ) : (
                    <a className="btn btn-sm btn-s" href={transportInHref} style={{ textDecoration: 'none' }}>ดูที่ติดตามการขนส่ง</a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
