import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import type { ApiBorrowLeg, ApiBorrowLine } from '../../../services/incidentApi';
import { classMeta, clock, legStatusMeta, mmss, num, REJECT_TEXT } from './format';

interface Row {
  line: ApiBorrowLine;
  leg: ApiBorrowLeg;
}

/** One short line about what this lender did; things that repeat on every row (no ETA, timer) are shown once elsewhere. */
function legDetail(line: ApiBorrowLine, leg: ApiBorrowLeg): string {
  const parts: string[] = [];
  const unit = line.item.unit;
  if (leg.qtyAccepted !== null && ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT', 'RECEIVED'].includes(leg.status)) parts.push(`ยืนยัน ${num(leg.qtyAccepted)} ${unit}${leg.respondedAt ? ` (${clock(leg.respondedAt)})` : ''}`);
  if (leg.status === 'RECEIVED' && leg.qtyReceived !== null) parts.push(`รับแล้ว ${num(leg.qtyReceived)} ${unit}`);
  if (leg.task && ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(leg.status)) parts.push(`งานขนส่ง ${leg.task.taskNo}`);
  if (leg.rejectReason) parts.push(REJECT_TEXT[leg.rejectReason] ?? `เหตุผล: ${leg.rejectReason}`);
  if (leg.status === 'TIMED_OUT') parts.push(`ไม่ตอบภายในเวลา (${clock(leg.deadlineAt)})`);
  if (leg.round > 1 && leg.status === 'SENT') parts.push(`รอบที่ ${leg.round}`);
  return parts.join(' · ') || '—';
}

const lineBadge = (l: ApiBorrowLine): { text: string; color: string } => {
  if (l.status === 'ESCALATED') return { text: 'ไม่มีผู้ให้ยืม', color: '#b91c1c' };
  if (l.status === 'CANCELLED') return { text: 'ยกเลิก', color: '#94a3b8' };
  if (l.qtyMissing <= 0) return { text: 'ครบแล้ว', color: '#15803d' };
  return { text: `ขาด ${num(l.qtyMissing)}`, color: '#b45309' };
};

/**
 * Emergency borrowing of one incident. Top: one line per item (confirmed of asked). Below: one table per lender hospital that is still
 * in play; hospitals that gave nothing are folded into one line. Lenders confirm themselves; the first to confirm gets the job.
 */
export function LiveBorrowStatus({ lines }: { lines: ApiBorrowLine[] }) {
  const tick = useTick();
  const [showDead, setShowDead] = useState(false);
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
  const isDead = (g: (typeof groups)[number]) => g.rows.every((r) => ['REJECTED', 'TIMED_OUT', 'CANCELLED'].includes(r.leg.status));
  const dead = groups.filter(isDead);
  const live = groups.filter((g) => !isDead(g));
  const unsent = lines.filter((l) => l.legs.length === 0);
  const noEta = lines.some((l) => l.legs.some((g) => g.mode === 'ETA_UNKNOWN'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: '6px 18px 10px' }}>
        <table className="qt" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th scope="col">รายการที่ต้องยืม</th>
              <th scope="col" className="r">ยืนยันแล้ว</th>
              <th scope="col">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const b = lineBadge(l);
              return (
                <tr key={l.requestId}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{l.item.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{l.requestNo}</div>
                  </td>
                  <td className="r"><b>{num(l.qtyConfirmed)}</b> <span style={{ color: '#64748b' }}>จาก {num(l.qtyRequested)} {l.item.unit}</span></td>
                  <td><span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {noEta && <div style={{ fontSize: 12, color: '#92400e' }}>ยังไม่มีเวลาที่ผู้ป่วยจะถึง (ETA) จึงขอไปยังโรงพยาบาลที่ใกล้ที่สุดก่อน</div>}
      {live.map((g) => {
        const waiting = g.rows.filter((r) => r.leg.status === 'SENT' && r.leg.remainingSec !== null);
        const left = waiting.length ? Math.max(0, Math.min(...waiting.map((r) => r.leg.remainingSec as number)) - tick) : null;
        return (
          <div key={g.lender.id} className="card" style={{ padding: '12px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{g.lender.name}</span>
                {g.transit !== null && <span style={{ fontSize: 12, color: '#64748b' }}>เดินทาง {num(Math.round(g.transit))} นาที</span>}
              </div>
              {left !== null && (
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  รอตอบอีก <b style={{ fontFamily: 'Inter, monospace', fontSize: 15, color: left < 60 ? '#b91c1c' : '#e11d48' }}>{mmss(left)}</b>
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 460 }}>
                <thead>
                  <tr>
                    <th scope="col">รายการที่ขอจากที่นี่</th>
                    <th scope="col">สถานะ</th>
                    <th scope="col">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(({ line, leg }) => {
                    const st = legStatusMeta(leg.status);
                    const cls = classMeta(line.item.class);
                    return (
                      <tr key={leg.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{line.item.name}</span>
                            <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>{cls.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>ขอ {num(leg.qtyAsked)} {line.item.unit} · {line.requestNo}</div>
                        </td>
                        <td>
                          <span className={`badge ${st.cls}`} style={{ whiteSpace: 'nowrap' }}>
                            {leg.status === 'SENT' && <Icon name="hourglass" className="ic12" />}
                            {(leg.status === 'LOADED' || leg.status === 'IN_TRANSIT') && <Icon name="truck" className="ic12" />}
                            {leg.status === 'REJECTED' && <Icon name="xc" className="ic12" />}
                            {(leg.status === 'ACCEPTED' || leg.status === 'PARTIAL') && <Icon name="checkc" className="ic12" />}
                            {st.label}
                          </span>
                          {leg.lateForEta && <div style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 3 }}>ของถึงหลังผู้ป่วย</div>}
                        </td>
                        <td style={{ fontSize: 12, color: '#475569' }}>{legDetail(line, leg)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {dead.length > 0 && (
        <div className="card" style={{ padding: '10px 18px' }}>
          <button type="button" aria-expanded={showDead} onClick={() => setShowDead((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: '#475569' }}>
            <Icon name="chev" className="ic14" style={{ transition: 'transform .15s', transform: showDead ? 'none' : 'rotate(-90deg)' }} />
            <span>โรงพยาบาลที่ไม่ได้ของ <b>{dead.length}</b> แห่ง (ไม่ตอบหรือปฏิเสธ)</span>
          </button>
          {showDead && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 24, fontSize: 12.5, color: '#475569', lineHeight: '22px' }}>
              {dead.map((g) => (
                <li key={g.lender.id}>
                  <b>{g.lender.name}</b>{g.transit !== null ? ` · ${num(Math.round(g.transit))} นาที` : ''} · {[...new Set(g.rows.map((r) => legStatusMeta(r.leg.status).label))].join(' / ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {unsent.length > 0 && (
        <div className="card" style={{ padding: '10px 16px', fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' }}>
          ไม่มีโรงพยาบาลให้ยืม: {unsent.map((l) => l.item.name).join(', ')} — ติดต่อด้วยวิทยุ/โทรศัพท์
        </div>
      )}
    </div>
  );
}
