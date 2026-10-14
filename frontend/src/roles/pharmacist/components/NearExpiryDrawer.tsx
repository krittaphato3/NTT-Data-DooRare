import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { fefoUsable, lotValue, releasable } from '../data/nearExpiry';
import type { NearExpiryItem, NearExpiryStatus } from '../data/nearExpiry';

interface NearExpiryDrawerProps {
  item: NearExpiryItem;
  onDecide: (status: NearExpiryStatus, qty?: number) => void;
  onClose: () => void;
}

/** UI-07 detail drawer — FEFO math (F-22) and the release/keep decision (FR-F2a-002). */
export function NearExpiryDrawer({ item: i, onDecide, onClose }: NearExpiryDrawerProps) {
  const usable = fefoUsable(i);
  const canRelease = releasable(i);
  const [qty, setQty] = useState(canRelease);
  const [reason, setReason] = useState('');
  const decided = i.status !== 'PENDING';

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดยาใกล้หมดอายุ">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">หน้าใกล้หมดอายุ · UI-07 · รายละเอียด</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <h2 style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
          {i.drug}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge t-grey code">รหัส {i.code}</span>
          <span className="ved ved-E ved-sm">{i.ved}</span>
          {i.repeatFlag && (
            <span className="badge t-red" style={{ fontWeight: 700 }}>
              ประวัติหมดอายุซ้ำ · {i.repeatFlag}
            </span>
          )}
          {i.status === 'KEPT' && <span className="badge t-blue">เก็บไว้ใช้เอง</span>}
          {i.status === 'RELEASED' && <span className="badge t-green">ปล่อยเข้าคลังกลางแล้ว</span>}
          {i.status === 'ALLOCATED' && <span className="badge t-teal">อยู่ในแผน {i.planId}</span>}
          {i.status === 'EXPIRED' && <span className="badge t-grey">หมดอายุแล้ว · รอตัดบัญชี</span>}
        </div>
      </div>

      <div className="tr-drawer-body">
        <dl className="dlr">
          <dt>คงคลัง</dt>
          <dd>
            <span className="num">
              {i.qty} {i.unit} · ฿{lotValue(i).toLocaleString()}
            </span>
          </dd>
          <dt>หมดอายุ</dt>
          <dd>
            {i.expiry} ·{' '}
            <span className="num" style={{ color: i.daysLeft < 0 ? '#B91C1C' : '#B45309', fontWeight: 600 }}>
              {i.daysLeft >= 0 ? `เหลือ ${i.daysLeft} วัน` : 'หมดอายุแล้ว'}
            </span>
          </dd>
          <dt>เกณฑ์ใกล้หมดอายุ</dt>
          <dd>
            <span className="num">{i.thresholdDays} วัน</span> (ตั้งค่าต่อรายการ · ASM-14)
          </dd>
          <dt>ใช้ต่อวัน</dt>
          <dd>
            <span className="num">{i.usagePerDay}</span> {i.unit}/วัน (เฉลี่ย 3 เดือน)
          </dd>
        </dl>

        {/* FEFO box — formula shown verbatim from the spec */}
        <div className="tr-box" style={{ background: '#F8FAFC' }}>
          <h3 className="tr-h3">
            คำนวณตามอายุที่ใช้ได้จริง <span className="en">FEFO · F-22</span>
          </h3>
          <div className="ne-formula num">
            ใช้ได้ = floor(({i.daysLeft} − 1) × {i.usagePerDay}) = {usable} · ปล่อยได้ = {i.qty} − {usable} ={' '}
            <b>{canRelease} {i.unit}</b>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            เก็บใช้ที่ รพ.เรา {usable} {i.unit} · ส่วนที่เหลือ {canRelease} {i.unit} ปล่อยเข้าคลังกลางได้โดยไม่เสียเปล่า
          </div>
        </div>

        {decided ? (
          <div className="ne-done" role="status">
            <Icon name="checkc" className="ic20" style={{ color: '#166534' }} />
            <span>
              {i.status === 'RELEASED' && (
                <>
                  ปล่อยเข้าคลังกลางแล้ว <b className="num">{i.releasedQty} {i.unit}</b> · ถูกกันไว้ (held)
                  รอ Agent วางแผนจัดสรรรอบถัดไป (JOB-06)
                </>
              )}
              {i.status === 'KEPT' && <>เก็บไว้ใช้เอง · {i.keptReason}</>}
              {i.status === 'ALLOCATED' && <>อยู่ในแผน {i.planId} · รอเอกสารและขนส่ง (UI-14)</>}
              {i.status === 'EXPIRED' && <>หมดอายุจริง · ระบบบันทึกตัดบัญชีและนับเป็นเหตุการณ์ F2b</>}
            </span>
          </div>
        ) : (
          <div className="ne-decide">
            <h3 className="tr-h3">
              ตัดสินใจ <span className="en">FR-F2a-002</span>
            </h3>
            <label className="ne-qtyrow">
              <span>จำนวนที่จะปล่อย (≤ {canRelease} {i.unit})</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="ne-qtyinput num"
                  type="number"
                  min={0}
                  max={canRelease}
                  value={qty}
                  onChange={(e) => setQty(Math.max(0, Math.min(canRelease, Number(e.target.value))))}
                />
                {i.unit}
              </span>
            </label>
            <textarea
              className="ne-reason"
              placeholder="เหตุผลเพิ่มเติม (ถ้ามี) เช่น ยาตัวนี้ใช้ช้า รพ.อื่นน่าจะใช้ทันกว่า"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-p" disabled={qty <= 0} onClick={() => onDecide('RELEASED', qty)}>
                <Icon name="pkg" />
                ปล่อยเข้าคลังกลาง {qty} {i.unit}
              </button>
              <button className="btn btn-g" onClick={() => onDecide('KEPT')}>
                เก็บไว้ใช้เอง
              </button>
            </div>
            <div className="sub" style={{ marginTop: 2 }}>
              ปล่อยแล้วเป็นการจองข้อมูล (held) · สินค้าจริงยังอยู่ที่ รพ.สมุทรปราการ จนกว่าแผนจัดสรรจะอนุมัติ
              และมีการขนส่งจริง · ถอนได้ก่อนแผนอนุมัติ
            </div>
          </div>
        )}

        {/* Repeat-expiry history (F2b) */}
        <div>
          <h3 className="tr-h3">
            ประวัติล็อตของยารายนี้ <span className="en">12 เดือน · F2b</span>
          </h3>
          {i.history.length === 0 ? (
            <div className="sub">ไม่มีประวัติหมดอายุหรือปล่อยเข้าคลังใน 12 เดือน</div>
          ) : (
            <ul className="ne-hist">
              {i.history.map((h) => (
                <li key={h.lot}>
                  <span className="code" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                    {h.lot}
                  </span>
                  <span className="sub">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
