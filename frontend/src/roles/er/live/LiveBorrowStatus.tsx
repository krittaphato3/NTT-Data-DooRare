import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import type { ApiBorrowLeg, ApiBorrowLine } from '../../../services/incidentApi';
import { classMeta, clock, legStatusMeta, mmss, num, REJECT_TEXT } from './format';

interface Row {
  line: ApiBorrowLine;
  leg: ApiBorrowLeg;
}

function legDetail(line: ApiBorrowLine, leg: ApiBorrowLeg): string {
  const parts: string[] = [];
  const unit = line.item.unit;
  if (leg.status === 'SENT') parts.push(`ขอ ${num(leg.qtyAsked)} ${unit}${leg.round > 1 ? ` · รอบที่ ${leg.round}` : ''}`);
  if (leg.qtyAccepted !== null && ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT', 'RECEIVED'].includes(leg.status)) parts.push(`ยืนยัน ${num(leg.qtyAccepted)} ${unit}${leg.respondedAt ? ` (${clock(leg.respondedAt)})` : ''}`);
  if (leg.status === 'RECEIVED' && leg.qtyReceived !== null) parts.push(`รับแล้ว ${num(leg.qtyReceived)} ${unit}`);
  if (leg.task && ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(leg.status)) parts.push(`งานขนส่ง ${leg.task.taskNo}`);
  if (leg.rejectReason) parts.push(REJECT_TEXT[leg.rejectReason] ?? `เหตุผล: ${leg.rejectReason}`);
  if (leg.status === 'TIMED_OUT') parts.push(`ไม่ตอบภายในเวลา (${clock(leg.deadlineAt)})`);
  if (leg.lateForEta) parts.push('ของจะถึงหลัง ETA (LATE_FOR_ETA)');
  if (leg.mode === 'ETA_UNKNOWN') parts.push('ไม่มี ETA จึงส่งถึงแห่งที่ใกล้ที่สุด');
  return parts.join(' · ') || '—';
}

/**
 * Emergency borrowing of one incident organised lender hospital → items asked and how each answered (UI-11).
 * Lenders confirm themselves; the first to confirm gets the job, the rest are trimmed or cancelled at once.
 */
export function LiveBorrowStatus({ lines }: { lines: ApiBorrowLine[] }) {
  const tick = useTick();
  if (lines.length === 0) {
    return <div className="card" style={{ padding: '12px 16px', fontSize: 12.5, color: '#64748b' }}>ยังไม่ได้ส่งคำขอยืมให้โรงพยาบาลใด</div>;
  }
  const byLender = new Map<string, { lender: ApiBorrowLeg['lender']; transit: number | null; rows: Row[] }>();
  for (const line of lines) {
    for (const leg of line.legs) {
      const g = byLender.get(leg.lender.id) ?? { lender: leg.lender, transit: leg.transitMin, rows: [] };
      g.rows.push({ line, leg });
      byLender.set(leg.lender.id, g);
    }
  }
  const groups = [...byLender.values()].sort((a, b) => (a.transit ?? Infinity) - (b.transit ?? Infinity));
  const unsent = lines.filter((l) => l.legs.length === 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {lines.map((l) => (
          <span key={l.requestId} style={{ fontSize: 12.5, color: '#0f2a5c' }}>
            <b>{l.item.name}</b> {num(l.qtyConfirmed)}/{num(l.qtyRequested)} {l.item.unit}{' '}
            <span className={`badge ${l.status === 'ESCALATED' ? 'st-rejected' : l.qtyMissing <= 0 ? 'st-approved' : 'st-pending'}`} style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>
              {l.status === 'ESCALATED' ? 'ไม่มีผู้ให้ยืม' : l.status === 'CANCELLED' ? 'ยกเลิก' : l.qtyMissing <= 0 ? 'ครบ' : `ขาด ${num(l.qtyMissing)}`}
            </span>
          </span>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.lender.id} className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{g.lender.name}</span>
            {g.transit !== null && <span style={{ fontSize: 12, color: '#64748b' }}>เดินทาง {num(g.transit)} นาที</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th scope="col">รายการที่ขอยืม</th>
                  <th scope="col">สถานะ</th>
                  <th scope="col">รายละเอียด</th>
                  <th scope="col" className="r">เวลาที่เหลือ</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map(({ line, leg }) => {
                  const st = legStatusMeta(leg.status);
                  const cls = classMeta(line.item.class);
                  const left = leg.remainingSec !== null ? Math.max(0, leg.remainingSec - tick) : null;
                  return (
                    <tr key={leg.id}>
                      <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                        {line.item.name} × {num(line.qtyRequested)}{' '}
                        <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{cls.label}</span>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{line.requestNo}</div>
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>
                          {leg.status === 'SENT' && <Icon name="hourglass" className="ic12" />}
                          {(leg.status === 'LOADED' || leg.status === 'IN_TRANSIT') && <Icon name="truck" className="ic12" />}
                          {leg.status === 'REJECTED' && <Icon name="xc" className="ic12" />}
                          {(leg.status === 'ACCEPTED' || leg.status === 'PARTIAL') && <Icon name="checkc" className="ic12" />}
                          {st.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#334155' }}>{legDetail(line, leg)}</td>
                      <td className="r">
                        {left !== null ? <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#e11d48', fontSize: 13 }}>{mmss(left)}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {unsent.length > 0 && (
        <div className="card" style={{ padding: '10px 16px', fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' }}>
          ไม่มีโรงพยาบาลให้ยืม: {unsent.map((l) => l.item.name).join(', ')} — ติดต่อด้วยวิทยุ/โทรศัพท์
        </div>
      )}
    </div>
  );
}
