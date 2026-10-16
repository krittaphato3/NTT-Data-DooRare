import { Icon } from '../../../components/common/icons';
import type { RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import { fmtQty, HOSPITALS } from '../data/transport';
import { FeatureBadge, InboxStatusBadge } from './InboxBadges';

interface RequestsTableProps {
  rows: RequestItem[];
  activeId: string | null;
  urgentLeft: string;
  onOpen: (id: string) => void;
  onConfirm: (id: string) => void;
  /** Opens the drawer with the decline form ready. */
  onDecline: (id: string) => void;
}

/** Every request asking the warehouse to send goods out; answer it right in the row. */
export function RequestsTable({ rows, activeId, urgentLeft, onOpen, onConfirm, onDecline }: RequestsTableProps) {
  return (
    <div className="scroll-x">
      <table className="tbl ib-tbl" aria-label="คำขอรอยืนยัน">
        <thead>
          <tr>
            <th style={{ width: 190 }}>คำขอ</th>
            <th>ยา · จำนวน</th>
            <th style={{ width: 180 }}>ส่งไปที่</th>
            <th style={{ width: 160 }}>กำหนด</th>
            <th style={{ width: 160 }}>สถานะ</th>
            <th style={{ width: 210 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = r.status === 'NEW';
            return (
              <tr key={r.id} className={activeId === r.id ? 'r-active' : ''}>
                <td>
                  <button className="rowbtn code" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }} onClick={() => onOpen(r.id)}>
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
                    <span className="sub"> · {r.pick.map((p) => p.lot).join(', ')}</span>
                  </span>
                </td>
                <td style={{ fontSize: 12.5, color: '#0F2A5C' }}>
                  <Icon name="outArrow" className="ic14" style={{ verticalAlign: '-2px', color: '#9A3412' }} /> {HOSPITALS[r.to]}
                  <span className="sub" style={{ display: 'block' }}>{r.requestedBy}</span>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {r.urgent && open ? (
                    <span style={{ color: '#B91C1C', fontWeight: 600 }}>
                      เหลือ <span className="ib-timer">{urgentLeft}</span>
                    </span>
                  ) : (
                    r.due
                  )}
                </td>
                <td>
                  <InboxStatusBadge status={r.status} />
                  {r.status === 'DECLINED' && <span className="sub" style={{ display: 'block' }}>{r.declineReason}</span>}
                </td>
                <td className="r">
                  {open ? (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-sm btn-p" onClick={() => onConfirm(r.id)}>ยืนยัน</button>
                      <button className="btn btn-sm btn-g" onClick={() => onDecline(r.id)}>ปฏิเสธ…</button>
                    </span>
                  ) : r.status === 'CONFIRMED' && r.transportId ? (
                    <a className="btn btn-sm btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
                      ไปที่ขนส่ง <span className="code" style={{ fontSize: 11 }}>{r.transportId.slice(-6)}</span>
                    </a>
                  ) : (
                    <span className="sub">ส่งกลับเภสัชกรแล้ว</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>ไม่มีรายการ</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
