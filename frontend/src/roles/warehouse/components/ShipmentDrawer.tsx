import { Icon } from '../../../components/common/icons';
import { fmtQty, HOSPITALS, isOutbound, STEP_ORDER, STEPS } from '../data/transport';
import type { Shipment, TransportStatus } from '../data/transport';
import { ProxyStatusPanel } from './ProxyStatusPanel';
import type { ProxyEntry } from './ProxyStatusPanel';
import { ReceiptForm } from './ReceiptForm';
import { StatusBadge } from './StatusBadge';

export type CancelDecision = 'yes' | 'no' | undefined;
export type ReceiptState = 'open' | 'done' | undefined;

interface ShipmentDrawerProps {
  shipment: Shipment;
  status: TransportStatus;
  /** Photos / queue still waiting to sync. */
  pending: boolean;
  receipt: ReceiptState;
  counted: string;
  cancel: CancelDecision;
  onClose: () => void;
  onSync: () => void;
  onCounted: (v: string) => void;
  onOpenReceipt: () => void;
  onConfirmReceipt: () => void;
  onUndoReceipt: () => void;
  onCancelDecision: (d: 'yes' | 'no') => void;
  /** false = read-only role (pharmacist): no photo upload, status or receipt controls. */
  canOperate: boolean;
  /** Only the pharmacist decides on / requests cancellation (RBAC §4.4). */
  canCancel: boolean;
  /** Statuses set by the warehouse on behalf of the driver, with the audit reason. */
  proxies: ProxyEntry[];
  onProxy: (to: ProxyEntry['to'], reason: string) => void;
}

function returnNote(s: Shipment): string {
  if (s.kind === 'F1') {
    return s.ref.includes('EMERGENCY')
      ? 'ส่วนประกอบโลหิต: คืนผ่านธนาคารเลือด (BLOOD_REPLACEMENT)'
      : 'ยืม: ผู้ยืมต้องคืนเป็นยาตัวเดิมจำนวนเท่ากันภายใน 30 วันหลังรับ · ล็อตที่ให้ยืมอายุ > 180 วัน';
  }
  return 'โอนยาใกล้หมดอายุ (F2): โอนถาวร ไม่ต้องคืน · ล็อตถูกกันไว้ที่ต้นทางจนขึ้นรถ';
}

export function ShipmentDrawer(p: ShipmentDrawerProps) {
  const { shipment: s, status } = p;
  const out = isOutbound(s);
  const idx = status === 'CANCELLED' ? -1 : STEP_ORDER.indexOf(status);
  const cancelReq = s.cancelRequest;
  const op = p.canOperate;
  const showReceipt = op && !out && status === 'ARRIVED' && p.receipt === 'open';
  const canPhoto = op && ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT'].includes(status) && s.photos.length < 10;
  const primary = !op
    ? null
    : status === 'WAITING_DISPATCH' && out && !cancelReq
      ? { label: 'ยืนยันขึ้นรถ + ถ่ายรูป', onClick: undefined as (() => void) | undefined }
      : status === 'ARRIVED' && !out && !showReceipt
        ? { label: 'ยืนยันรับของ', onClick: p.onOpenReceipt }
        : null;
  const canRequestCancel = p.canCancel && status === 'WAITING_DISPATCH' && out && !cancelReq;
  const canProxy = op && out && (status === 'LOADED' || status === 'IN_TRANSIT');

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดงานขนส่ง">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">{out ? 'ส่งออกจากเรา' : 'รับเข้าเรา'} · งานขนส่ง · UI-14</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={p.onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
            {s.id}
          </h2>
          <StatusBadge status={status} />
          <span className={`badge ${s.kind === 'F1' ? 't-blue' : 't-teal'}`}>{s.kind === 'F1' ? 'ยืม (F1)' : 'โอนยาใกล้หมดอายุ (F2)'}</span>
          {p.pending && <span className="badge t-amber">รอซิงก์</span>}
        </div>
        <div style={{ fontSize: 14, color: '#0F2A5C' }}>
          {HOSPITALS[s.from]} → {HOSPITALS[s.to]} · <span className="code">{s.ref}</span>
        </div>
      </div>

      <div className="tr-drawer-body">
        {cancelReq && (
          <div role="alert" className="cancel-box">
            <div style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>
              <b style={{ fontWeight: 600 }}>
                {cancelReq.by} ขอยกเลิกงานนี้ {cancelReq.time} น.
              </b>
              <br />
              เหตุผล: “{cancelReq.reason}” · ยกเลิกได้เพราะยังไม่ขึ้นรถ ต้องได้ความยินยอมจากเรา (ผู้ส่ง)
            </div>
            {!p.canCancel ? (
              <div role="status" style={{ fontSize: 13, color: '#0F2A5C', background: '#FFFFFF', borderRadius: 8, padding: '8px 10px' }}>
                {p.cancel === 'yes' ? 'เภสัชกรยินยอมแล้ว · งานถูกยกเลิก (CANCELLED)' : p.cancel === 'no' ? 'เภสัชกรไม่ยินยอม · งานยังรอขึ้นรถตามแผน' : 'รอเภสัชกรตอบคำขอยกเลิก · การยกเลิกเป็นสิทธิ์ของเภสัชกร'}
              </div>
            ) : !p.cancel ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-p btn-sm" onClick={() => p.onCancelDecision('yes')}>
                  ยินยอมยกเลิก
                </button>
                <button className="btn btn-s btn-sm" onClick={() => p.onCancelDecision('no')}>
                  ไม่ยินยอม · ส่งตามแผน
                </button>
              </div>
            ) : (
              <div role="status" style={{ fontSize: 13, color: '#0F2A5C', background: '#FFFFFF', borderRadius: 8, padding: '8px 10px' }}>
                {p.cancel === 'yes'
                  ? `ยินยอมแล้ว 19:12 · งานถูกยกเลิก (CANCELLED) · ${s.drug.split(' ')[0]} ${fmtQty(s.qty)} ${s.unit.toLowerCase()} กลับเข้าคลังกลางเพื่อจัดสรรใหม่`
                  : `ไม่ยินยอม · แจ้ง ${cancelReq.by} แล้ว งานยังรอขึ้นรถตามแผน`}
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="tr-h3">
            ขั้นตอน <span className="en">SM-6</span>
          </h3>
          <ol className="stepper">
            {STEPS.map((st, i) => {
              const done = i < idx || status === 'RECEIVED';
              const cur = i === idx && status !== 'RECEIVED';
              const proxied = p.proxies.some((x) => x.to === st.code);
              const sub = proxied ? '19:12 · บันทึกแทนคนขับ โดย คุณประเสริฐ' : s.times[i] || (cur ? 'ขั้นปัจจุบัน' : status === 'CANCELLED' ? '—' : 'ยังไม่ถึง');
              return (
                <li key={st.code}>
                  <span className="step-rail">
                    <span className="step-dot" style={{ background: done ? '#1D4ED8' : cur ? '#FFFFFF' : '#F1F5F9', color: done ? '#FFFFFF' : cur ? '#1D4ED8' : '#475569', boxShadow: cur ? '0 0 0 2px #1D4ED8' : 'none' }}>
                      <Icon name={done ? 'check' : st.icon} className="ic14" />
                    </span>
                    <span className="step-line" style={{ background: i < 4 ? (done ? '#1D4ED8' : '#E2E8F0') : 'transparent' }} />
                  </span>
                  <span className="step-body">
                    <span className="step-label" style={{ color: done || cur ? '#0F2A5C' : '#475569', fontWeight: cur ? 600 : 400 }}>
                      {st.label} <span className="code" style={{ fontSize: 10.5 }}>{st.code}</span>
                    </span>
                    <span className="step-sub">{sub}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 6 }}>รายการในงานนี้</h3>
          <dl className="dlr">
            <dt>ยา</dt>
            <dd>{s.drug}</dd>
            <dt>จำนวน</dt>
            <dd>
              {fmtQty(s.qty)} {s.unit}
            </dd>
            <dt>ล็อต</dt>
            <dd>{s.lot}</dd>
            {s.coldChain && (
              <>
                <dt>Cold chain</dt>
                <dd>ใช่ · ต้องควบคุมอุณหภูมิระหว่างขนส่ง</dd>
              </>
            )}
            <dt>อ้างอิง</dt>
            <dd>{s.ref}</dd>
          </dl>
          <div className="return-note">{returnNote(s)}</div>
        </div>

        {canProxy && <ProxyStatusPanel key={status} status={status} onSubmit={p.onProxy} />}
        {p.proxies.map((x, i) => (
          <div key={i} role="status" className="proxy-done">
            บันทึกแทนคนขับ → {x.to} · เหตุผล: “{x.reason}” · บันทึกใน audit log
          </div>
        ))}

        {showReceipt && <ReceiptForm shipment={s} counted={p.counted} onCounted={p.onCounted} onConfirm={p.onConfirmReceipt} />}
        {op && !out && p.receipt === 'done' && (
          <div role="status" className="receipt-done">
            <Icon name="checkc" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>
              รับแล้ว 19:12 น. · สต็อก {s.drug.split(' ')[0]} เพิ่ม {p.counted} {s.unit} · สถานะ RECEIVED · แผน {s.ref.split(' · ')[0]} ปิดรายการนี้
            </span>
            <button className="link" onClick={p.onUndoReceipt}>
              เลิกทำ
            </button>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <h3 className="tr-h3" style={{ margin: 0 }}>
              รูปถ่าย <span className="en">{s.photos.length} / 10 · บีบอัด ≤ 1.5 MB</span>
            </h3>
            <span className="sub">ต้องมีรูปตอนขึ้นรถและถึงปลายทาง</span>
          </div>
          <div className="photo-grid">
            {s.photos.map((ph, i) => {
              const pend = !!ph.pending && p.pending;
              return (
                <div key={i} className="ph" role="img" aria-label={`รูปขั้น ${ph.stage} เวลา ${ph.time}`}>
                  <Icon name="camera" className="ic20" />
                  <span className="code" style={{ fontSize: 10 }}>{ph.stage}</span>
                  <span className="num" style={{ fontSize: 10.5 }}>{ph.time}</span>
                  {pend && (
                    <span className="badge t-amber ph-pend">รอซิงก์</span>
                  )}
                </div>
              );
            })}
            {canPhoto && (
              <button className="ph ph-add" aria-label="ถ่ายหรือเพิ่มรูป">
                <Icon name="plus" className="ic20" />
                <span>เพิ่มรูป</span>
              </button>
            )}
          </div>
        </div>

        {op && p.pending && (
          <div className="queue-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>คิวในเครื่อง · รอซิงก์ 1 รายการ</span>
              <button className="btn btn-s btn-sm" onClick={p.onSync}>
                ซิงก์ตอนนี้
              </button>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: '18px' }}>
              รูปขึ้นรถ #2 · ถ่าย <span className="num">16:29</span> น. ที่ลานโหลดชั้นใต้ดิน (ไม่มีสัญญาณ) · client_event_id <span className="code">a91f…</span> · ระบบใช้เวลาที่ถ่ายจริง (captured_at) และกันซ้ำเมื่อซิงก์
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {primary && (
            <button className="btn btn-p" onClick={primary.onClick}>
              {primary.label}
            </button>
          )}
          <button className="btn btn-s">
            <Icon name="printer" />
            {s.kind === 'F1' ? 'ใบยืม BORROW_SLIP' : 'ใบโอน TRANSFER_SLIP'}
          </button>
          {canRequestCancel && <button className="btn btn-g">ขอยกเลิก (ต้องได้ความยินยอม)</button>}
        </div>
      </div>
    </aside>
  );
}
