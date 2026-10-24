import { fmtTime } from '../../../lib/time';
import { ACTION_LABEL } from '../data/borrow';
import type { BorrowRequest } from '../data/borrow';
import { BorrowStatusBadge, ReturnBadge, UrgencyBadge } from './BorrowBadges';

interface BorrowTableProps {
  rows: BorrowRequest[];
  activeId: string | null;
  /** Seconds elapsed since mount — drives the response-window countdown. */
  tick: number;
  onOpen: (id: string) => void;
}

/** Stop-rule progress: confirmed / target with a thin bar. */
export function StopBar({ got, target }: { got: number; target: number }) {
  const pct = target ? Math.min(100, Math.round((got / target) * 100)) : 0;
  return (
    <span className="br-bar" role="img" aria-label={`ได้ยืนยัน ${got} จาก ${target}`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function BorrowTable({ rows, activeId, tick, onOpen }: BorrowTableProps) {
  return (
    <>
      <div className="scroll-x">
        <table className="tbl" aria-label="คำขอยืมของเรา">
          <thead>
            <tr>
              <th style={{ width: 150 }}>เลขคำขอ</th>
              <th>ยา</th>
              <th className="r" style={{ width: 96 }}>จำนวน</th>
              <th style={{ width: 190 }}>ผู้ให้ยืม</th>
              <th style={{ width: 120 }}>ความเร่งด่วน</th>
              <th style={{ width: 130 }}>สถานะ</th>
              <th style={{ width: 190 }}>ความคืบหน้า · เวลา</th>
              <th style={{ width: 136 }}>
                <span className="srt">การดำเนินการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={activeId === r.id ? 'r-active' : ''}>
                <td>
                  <button className="rowbtn code" onClick={() => onOpen(r.id)} style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>
                    {r.id}
                  </button>
                  <span className="code" style={{ display: 'block', fontSize: 11 }}>
                    {r.context} · {r.createdAt}
                  </span>
                </td>
                <td>
                  <span className="br-drug">
                    <span className={`ved ved-${r.ved} ved-sm`}>{r.ved}</span>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                  </span>
                </td>
                <td className="r">
                  <span className="num" style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 14 }}>
                    {r.qty}
                  </span>{' '}
                  <span style={{ fontSize: 11.5 }}>{r.unit}</span>
                </td>
                <td style={{ fontSize: 12.5, lineHeight: '18px', color: '#0F2A5C' }}>
                  {r.lender.map((l) => (
                    <span key={l} style={{ display: 'block' }}>
                      {l}
                    </span>
                  ))}
                </td>
                <td>
                  <UrgencyBadge urgency={r.urgency} />
                </td>
                <td>
                  <BorrowStatusBadge status={r.status} kit={r.isKit} />
                  {r.returnState && (
                    <span style={{ display: 'block', marginTop: 4 }}>
                      <ReturnBadge state={r.returnState} />
                    </span>
                  )}
                </td>
                <td style={{ fontSize: 12, lineHeight: '17px' }}>
                  {r.countdownSec !== undefined && (
                    <span style={{ display: 'block', color: '#92400E', fontWeight: 600 }}>
                      เหลือ <span className="num">{fmtTime(r.countdownSec - tick)}</span>
                    </span>
                  )}
                  {r.stop && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                      <StopBar got={r.stop.got} target={r.stop.target} />
                      <span className="num" style={{ color: '#0F2A5C' }}>
                        {r.stop.got} / {r.stop.target}
                      </span>
                    </span>
                  )}
                  {r.note}
                </td>
                <td className="r">
                  <button className={`btn btn-sm ${r.action === 'approve' ? 'btn-p' : 'btn-s'}`} onClick={() => onOpen(r.id)}>
                    {ACTION_LABEL[r.action]}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>
          แสดง <span className="num">{rows.length}</span> รายการ
        </span>
        <span>คืนเป็นยาตัวเดิมภายใน 30 วัน · ส่งพร้อมกัน ≤ 3 แห่งเฉพาะเร่งด่วนมาก</span>
      </div>
    </>
  );
}
