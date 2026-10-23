import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import { fmtQty, HOSPITALS } from '../data/transport';
import { FeatureBadge, InboxStatusBadge } from './InboxBadges';

interface InboxDrawerProps {
  item: RequestItem;
  urgentLeft: string;
  /** Open with the decline form shown (when the row's "ปฏิเสธ…" was pressed). */
  startDeclining: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDecline: (reason: string) => void;
  kicker?: string;
  confirmLabel?: string;
  hideDecline?: boolean;
}

const DECLINE_REASONS = ['สต็อกจริงไม่พอ', 'ล็อตมีปัญหา (เสียหาย/ถูกเรียกคืน)', 'ล็อตอายุไม่ถึงเกณฑ์ (< 180 วัน)', 'อื่นๆ'];

/** Details of one request: what to send, which lots, and the answer. */
export function InboxDrawer({ item: it, urgentLeft, startDeclining, onClose, onConfirm, onDecline, kicker = 'คำขอเร่งด่วน F3 · ตอบแล้วงานจะไปที่ติดตามการขนส่ง', confirmLabel = 'ยืนยัน · เตรียมส่ง', hideDecline = false }: InboxDrawerProps) {
  const [declining, setDeclining] = useState(startDeclining);
  const [reasonKind, setReasonKind] = useState(DECLINE_REASONS[0]);
  const [note, setNote] = useState('');
  const open = it.status === 'NEW';
  const reasonOk = reasonKind !== 'อื่นๆ' || note.trim().length >= 5;

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดคำขอ">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">{kicker}</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>{it.id}</h2>
          <InboxStatusBadge status={it.status} />
          <FeatureBadge feature={it.feature} />
          {it.urgent && open && (
            <span className="badge t-red" style={{ fontWeight: 600 }}>
              เร่งด่วน · <span className="ib-timer">{urgentLeft}</span>
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: '#0F2A5C' }}>
          รพ.สมุทรปราการ → {HOSPITALS[it.to]} · <span className="code">{it.ref}</span>
        </div>
      </div>

      <div className="tr-drawer-body">
        {it.status === 'DECLINED' && (
          <div role="alert" className="cancel-box">
            <div style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>
              <b style={{ fontWeight: 600 }}>เตรียมไม่ได้ · ส่งกลับให้เภสัชกรตัดสินใจแล้ว</b>
              <br />
              เหตุผล: “{it.declineReason}”
            </div>
          </div>
        )}
        {it.status === 'CONFIRMED' && (
          <div role="status" className="receipt-done" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="checkc" style={{ marginTop: 2 }} />
              <span style={{ flex: 1 }}>
                ยืนยันจะแพ็กแล้ว · งานขนส่ง <span className="code">{it.transportId || it.id}</span> พร้อมไปเตรียมของและขึ้นรถ
              </span>
            </div>
            <a className="btn btn-p btn-sm" href={`${whHref('transport')}&task=${encodeURIComponent(it.transportId || it.id)}`} style={{ textDecoration: 'none' }}>
              <Icon name="truck" /> ไปที่หน้าติดตามการขนส่ง ({it.transportId || it.id})
            </a>
          </div>
        )}

        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 6 }}>ข้อมูลคำขอ</h3>
          <dl className="dlr">
            <dt>ยา</dt>
            <dd>{it.drug}</dd>
            <dt>จำนวน</dt>
            <dd>{fmtQty(it.qty)} {it.unit}</dd>
            <dt>ผู้ขอ</dt>
            <dd>{it.requestedBy}</dd>
            <dt>กำหนด</dt>
            <dd>{it.due}</dd>
          </dl>
          {it.note && <div className="return-note">{it.note}</div>}
        </div>

        <div>
          <h3 className="tr-h3">
            ล็อตที่จะหยิบ <span className="en">FEFO · พรีวิว</span>
          </h3>
          <ul className="ib-pick">
            {it.pick.map((p) => (
              <li key={p.lot}>
                <div className="ib-pick-static" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="code" style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 12.5 }}>{p.lot}</span>
                    {p.coldChain && <span className="badge t-blue" style={{ marginLeft: 6, height: 18, fontSize: 11 }}>Cold chain</span>}
                    <span className="sub" style={{ display: 'block' }}>หมดอายุ {p.expiry} (เหลือ {p.daysLeft} วัน)</span>
                  </span>
                  <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>{fmtQty(p.qty)} {it.unit}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="sub" style={{ marginTop: 6 }}>ติ๊กหยิบจริงที่หน้าติดตามการขนส่งหลังยืนยัน</div>
        </div>

        {!hideDecline && declining && open && (
          <section aria-label="เตรียมไม่ได้" className="proxy-box">
            <b style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 600 }}>เตรียมไม่ได้ · ส่งกลับให้เภสัชกรตัดสินใจ</b>
            <select className="sel" value={reasonKind} onChange={(e) => setReasonKind(e.target.value)} aria-label="เหตุผล">
              {DECLINE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={reasonKind === 'อื่นๆ' ? 'ระบุเหตุผล (บังคับ)' : 'หมายเหตุ (ถ้ามี)'} aria-label="หมายเหตุ" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-p btn-sm" disabled={!reasonOk} onClick={() => onDecline(note.trim() ? `${reasonKind} · ${note.trim()}` : reasonKind)}>
                ส่งกลับเภสัชกร
              </button>
              <button className="btn btn-g btn-sm" onClick={() => setDeclining(false)}>ยกเลิก</button>
            </div>
          </section>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {open && (
            <button className="btn btn-p" onClick={onConfirm}>
              <Icon name="check" />
              {confirmLabel}
            </button>
          )}
          {!hideDecline && open && !declining && (
            <button className="btn btn-g" onClick={() => setDeclining(true)}>ปฏิเสธ…</button>
          )}
          {it.status === 'CONFIRMED' && whHref('transport') && (
            <a className="btn btn-s" href={`${whHref('transport')}&task=${encodeURIComponent(it.transportId || it.id)}`} style={{ textDecoration: 'none' }}>
              <Icon name="truck" />
              ไปที่ติดตามการขนส่ง ({it.transportId || it.id})
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
