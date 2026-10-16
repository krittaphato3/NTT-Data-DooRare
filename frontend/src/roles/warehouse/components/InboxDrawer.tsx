import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { INBOX_STEPS } from '../data/inbox';
import type { InboxStatus, OutboundItem, PackTask } from '../data/inbox';
import { whHref } from '../data/routes';
import { fmtQty, HOSPITALS } from '../data/transport';
import { FeatureBadge, InboxStatusBadge } from './InboxBadges';

export type InboxSelection = { kind: 'out'; item: OutboundItem } | { kind: 'pack'; item: PackTask };

interface InboxDrawerProps {
  sel: InboxSelection;
  urgentLeft: string;
  /** Ids of pick lines already checked off. */
  picked: ReadonlySet<string>;
  onTogglePick: (lineId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onDecline: (reason: string) => void;
  onReady: () => void;
}

const DECLINE_REASONS = ['สต็อกจริงไม่พอ', 'ล็อตมีปัญหา (เสียหาย/ถูกเรียกคืน)', 'ล็อตอายุไม่ถึงเกณฑ์ (< 180 วัน)', 'อื่นๆ'];

interface Line {
  id: string;
  title: string;
  sub: string;
  qty: string;
  coldChain?: boolean;
}

function linesOf(sel: InboxSelection): Line[] {
  if (sel.kind === 'out') {
    return sel.item.pick.map((p) => ({
      id: `${sel.item.id}:${p.lot}`,
      title: p.lot,
      sub: `หมดอายุ ${p.expiry} (เหลือ ${p.daysLeft} วัน) · ${p.location}`,
      qty: `${fmtQty(p.qty)} ${sel.item.unit}`,
      coldChain: p.coldChain,
    }));
  }
  return sel.item.recipe.map((r) => ({
    id: `${sel.item.id}:${r.item}`,
    title: r.item,
    sub: `${r.perSet} ${r.unit} ต่อชุด × ${sel.item.qty} ชุด`,
    qty: `${r.perSet * sel.item.qty} ${r.unit}`,
    coldChain: r.coldChain,
  }));
}

function stepIndex(s: InboxStatus): number {
  return s === 'DECLINED' ? -1 : INBOX_STEPS.findIndex((x) => x.code === s);
}

/** Detail drawer for an inbox task: pick list, confirm / decline, mark ready. */
export function InboxDrawer({ sel, urgentLeft, picked, onTogglePick, onClose, onConfirm, onDecline, onReady }: InboxDrawerProps) {
  const [declining, setDeclining] = useState(false);
  const [reasonKind, setReasonKind] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const it = sel.item;
  const isPack = sel.kind === 'pack';
  const status = it.status;
  const idx = stepIndex(status);
  const lines = linesOf(sel);
  const allPicked = lines.every((l) => picked.has(l.id));
  const urgent = sel.kind === 'out' && sel.item.urgent && status === 'NEW';
  const canDecline = status === 'NEW' || status === 'PREPARING';
  const reasonOk = reasonKind !== 'อื่นๆ' || reasonNote.trim().length >= 5;

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดงานเข้า">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">กล่องงานเข้า · ยังไม่ใช่งานขนส่ง</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>{it.id}</h2>
          <InboxStatusBadge status={status} />
          <FeatureBadge feature={isPack ? 'F3' : sel.item.feature} />
          {urgent && (
            <span className="badge t-red" style={{ fontWeight: 600 }}>
              เร่งด่วน · <span className="ib-timer">{urgentLeft}</span>
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: '#0F2A5C' }}>
          {isPack ? (
            <>
              ชุด {sel.item.kit} {sel.item.qty} ชุด · <span className="code">{sel.item.incident}</span>
            </>
          ) : (
            <>
              รพ.สมุทรปราการ → {HOSPITALS[sel.item.to]} · <span className="code">{sel.item.ref}</span>
            </>
          )}
        </div>
      </div>

      <div className="tr-drawer-body">
        {status === 'DECLINED' && (
          <div role="alert" className="cancel-box">
            <div style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>
              <b style={{ fontWeight: 600 }}>เตรียมไม่ได้ · ส่งกลับให้เภสัชกรตัดสินใจแล้ว</b>
              <br />
              เหตุผล: “{it.declineReason}”
            </div>
          </div>
        )}

        <div>
          <h3 className="tr-h3">
            ขั้นตอน <span className="en">Inbox → Transport</span>
          </h3>
          <ol className="stepper">
            {INBOX_STEPS.map((st, i) => {
              const done = idx > i || status === 'READY';
              const cur = idx === i && status !== 'READY';
              return (
                <li key={st.code}>
                  <span className="step-rail">
                    <span className="step-dot" style={{ background: done ? '#1D4ED8' : cur ? '#FFFFFF' : '#F1F5F9', color: done ? '#FFFFFF' : cur ? '#1D4ED8' : '#475569', boxShadow: cur ? '0 0 0 2px #1D4ED8' : 'none' }}>
                      <Icon name={done ? 'check' : st.icon} className="ic14" />
                    </span>
                    <span className="step-line" style={{ background: done ? '#1D4ED8' : '#E2E8F0' }} />
                  </span>
                  <span className="step-body">
                    <span className="step-label" style={{ color: done || cur ? '#0F2A5C' : '#475569', fontWeight: cur ? 600 : 400 }}>{st.label}</span>
                    <span className="step-sub">{done ? 'เสร็จแล้ว' : cur ? 'ขั้นปัจจุบัน' : status === 'DECLINED' ? '—' : 'ยังไม่ถึง'}</span>
                  </span>
                </li>
              );
            })}
            <li>
              <span className="step-rail">
                <span className="step-dot" style={{ background: '#F1F5F9', color: '#475569' }}>
                  <Icon name="truck" className="ic14" />
                </span>
              </span>
              <span className="step-body">
                <span className="step-label" style={{ color: '#475569' }}>{isPack ? 'ใช้ในเหตุการณ์ (ไม่มีงานขนส่ง)' : 'ขึ้นรถ → ติดตามที่หน้าติดตามการขนส่ง'}</span>
              </span>
            </li>
          </ol>
        </div>

        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 6 }}>รายละเอียดงาน</h3>
          <dl className="dlr">
            {isPack ? (
              <>
                <dt>ชุดยา</dt>
                <dd>{sel.item.kit} ({sel.item.kitEn}) × {sel.item.qty}</dd>
                <dt>เหตุการณ์</dt>
                <dd className="code">{sel.item.incident}</dd>
                <dt>เซ็ตพร้อมใช้</dt>
                <dd>{sel.item.readyNow}/{sel.item.target} ชุด</dd>
              </>
            ) : (
              <>
                <dt>ยา</dt>
                <dd>{sel.item.drug}</dd>
                <dt>จำนวน</dt>
                <dd>{fmtQty(sel.item.qty)} {sel.item.unit}</dd>
                <dt>ผู้ขอ</dt>
                <dd>{sel.item.requestedBy}</dd>
                <dt>กำหนด</dt>
                <dd>{sel.item.due}</dd>
              </>
            )}
          </dl>
          {!isPack && sel.item.note && <div className="return-note">{sel.item.note}</div>}
          {isPack && <div className="return-note">ยืนยันแพ็กเสร็จแล้ว ระบบตัดสต็อกตามสูตรเซ็ตและเพิ่มเซ็ตพร้อมใช้</div>}
        </div>

        <div>
          <h3 className="tr-h3">
            {isPack ? 'รายการที่ต้องหยิบตามสูตรเซ็ต' : 'รายการหยิบ'} <span className="en">Pick list{isPack ? '' : ' · FEFO'}</span>
          </h3>
          <ul className="ib-pick">
            {lines.map((l) => {
              const on = picked.has(l.id) || status === 'READY';
              return (
                <li key={l.id}>
                  <label className={status === 'PREPARING' ? '' : 'ib-pick-static'}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={status !== 'PREPARING'}
                      onChange={() => onTogglePick(l.id)}
                      aria-label={`หยิบแล้ว ${l.title}`}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="code" style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 12.5 }}>{l.title}</span>
                      {l.coldChain && <span className="badge t-blue" style={{ marginLeft: 6, height: 18, fontSize: 11 }}>Cold chain</span>}
                      <span className="sub" style={{ display: 'block' }}>{l.sub}</span>
                    </span>
                    <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>{l.qty}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {status === 'READY' && (
          <div role="status" className="receipt-done">
            <Icon name="checkc" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>
              {isPack
                ? 'แพ็กเสร็จแล้ว · ตัดสต็อกตามสูตรเซ็ตและเพิ่มเซ็ตพร้อมใช้'
                : <>เตรียมเสร็จแล้ว · สร้างงานขนส่ง <span className="code">{(it as OutboundItem).transportId}</span> สถานะ "รอขึ้นรถ" ไปขึ้นรถและถ่ายรูปที่หน้าติดตามการขนส่ง</>}
            </span>
          </div>
        )}

        {declining && canDecline && (
          <section aria-label="เตรียมไม่ได้" className="proxy-box">
            <b style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 600 }}>เตรียมไม่ได้ · ส่งกลับให้เภสัชกรตัดสินใจ</b>
            <select className="sel" value={reasonKind} onChange={(e) => setReasonKind(e.target.value)} aria-label="เหตุผล">
              {DECLINE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <textarea className="inp" rows={2} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder={reasonKind === 'อื่นๆ' ? 'ระบุเหตุผล (บังคับ)' : 'หมายเหตุ (ถ้ามี)'} aria-label="หมายเหตุ" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                className="btn btn-p btn-sm"
                disabled={!reasonOk}
                onClick={() => {
                  onDecline(reasonNote.trim() ? `${reasonKind} · ${reasonNote.trim()}` : reasonKind);
                  setDeclining(false);
                  setReasonNote('');
                }}
              >
                ส่งกลับเภสัชกร
              </button>
              <button className="btn btn-g btn-sm" onClick={() => setDeclining(false)}>ยกเลิก</button>
            </div>
          </section>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {status === 'NEW' && (
            <button className="btn btn-p" onClick={onConfirm}>
              <Icon name="check" />
              ยืนยันจะเตรียม
            </button>
          )}
          {status === 'PREPARING' && (
            <button className="btn btn-p" onClick={onReady} disabled={!allPicked} title={allPicked ? undefined : 'ต้องติ๊กหยิบครบทุกรายการก่อน'}>
              <Icon name="checkc" />
              {isPack ? 'ยืนยันแพ็กเสร็จ · ตัดสต็อกตามสูตร' : 'เตรียมเสร็จ · สร้างงานขนส่ง'}
            </button>
          )}
          {status === 'READY' && !isPack && whHref('transport') && (
            <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
              <Icon name="truck" />
              ไปที่ติดตามการขนส่ง
            </a>
          )}
          {canDecline && !declining && (
            <button className="btn btn-g" onClick={() => setDeclining(true)}>เตรียมไม่ได้…</button>
          )}
        </div>
      </div>
    </aside>
  );
}
