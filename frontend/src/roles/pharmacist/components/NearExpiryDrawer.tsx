import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { fefoUsable, lotValue, releasable } from '../data/nearExpiry';
import type { NearExpiryItem, NearExpiryStatus } from '../data/nearExpiry';
import '../pipeline.css';

interface NearExpiryDrawerProps {
  item: NearExpiryItem;
  /** `status` RELEASED / KEPT (the two decisions of the mock) plus DISMISSED / PENDING (= withdraw from the pool) on live rows. */
  onDecide: (status: NearExpiryStatus, qty?: number, reason?: string) => void;
  /** Live rows: the API is called, so keep / dismiss / withdraw need a reason of 3+ characters. */
  live?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  /** Role viewing the drawer; the release/keep decision is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/** UI-07 detail drawer — FEFO math (F-22) and the release/keep decision (FR-F2a-002). */
export function NearExpiryDrawer({ item: i, onDecide, onClose, live = false, busy = false, error = null, role = 'PHARMACIST' }: NearExpiryDrawerProps) {
  /* Releasing a lot to the central pool is the owner hospital's decision (§4.2). */
  const mayRelease = mayActFor(role, 'PHARMACIST', 'releaseNearExpiry');
  const releaseHint = requiredRoleHint('releaseNearExpiry');
  const usable = fefoUsable(i);
  const canRelease = releasable(i);
  const [qty, setQty] = useState(canRelease);
  const [reason, setReason] = useState('');
  const decided = i.status !== 'PENDING';
  const reasonOk = reason.trim().length >= 3;

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
          {i.status === 'TRANSFERRED' && <span className="badge t-green">โอนให้ รพ.อื่นแล้ว</span>}
          {i.status === 'DISMISSED' && <span className="badge t-grey">ปิดรายการ</span>}
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

        {/* Split of the lot; the spec formula stays one click away */}
        <div className="tr-box" style={{ background: '#F8FAFC' }}>
          <h3 className="tr-h3">
            แบ่งยาล็อตนี้ <span className="en">FEFO · F-22</span>
          </h3>
          <div className="ne-split" title={`เก็บใช้เอง ${Math.min(i.qty, Math.max(0, usable))} · ปล่อยเข้าพูล ${canRelease}`}>
            <span className="ne-split-keep" style={{ flex: Math.min(i.qty, Math.max(0, usable)) }} />
            <span className="ne-split-rel" style={{ flex: canRelease }} />
          </div>
          <div className="ne-split-txt num">
            <span className="k">เก็บใช้เอง <b>{Math.min(i.qty, Math.max(0, usable))}</b> {i.unit}</span>
            <span className="r">ปล่อยเข้าคลังกลาง <b>{canRelease}</b> {i.unit}</span>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            ส่วนที่ใช้ทันก่อนหมดอายุเก็บไว้ที่ รพ.เรา ส่วนที่เหลือปล่อยเข้าคลังกลางได้โดยไม่เสียเปล่า
          </div>
          <details className="ne-calc">
            <summary>ดูวิธีคำนวณ</summary>
            <div className="ne-formula num">
              ใช้ได้ = floor(({i.daysLeft} − 1) × {i.usagePerDay}) = {usable} · ปล่อยได้ = {i.qty} − {usable} ={' '}
              <b>{canRelease} {i.unit}</b>
            </div>
          </details>
        </div>

        {decided ? (
          <>
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
              {i.status === 'TRANSFERRED' && <>โอนให้ รพ.อื่นแล้ว{i.planId ? ` · แผน ${i.planId}` : ''} · นับเป็นมูลค่าที่เลี่ยงการหมดอายุ</>}
              {i.status === 'DISMISSED' && <>ปิดรายการ · {i.note ?? ''}</>}
            </span>
          </div>
          {live && (i.status === 'RELEASED' || i.status === 'KEPT') && (
            <div className="ne-decide">
              {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
              <textarea className="ne-reason" placeholder="เหตุผล (อย่างน้อย 3 ตัวอักษร)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {i.status === 'RELEASED' && (
                  <button className="btn btn-g" disabled={!mayRelease || busy || !reasonOk} title={reasonOk ? undefined : 'ระบุเหตุผลก่อน'} onClick={() => onDecide('PENDING', undefined, reason)}>
                    ถอนออกจากคลังกลาง
                  </button>
                )}
                {i.status === 'KEPT' && (
                  <button className="btn btn-g" disabled={!mayRelease || busy || !reasonOk} title={reasonOk ? undefined : 'ระบุเหตุผลก่อน'} onClick={() => onDecide('DISMISSED', undefined, reason)}>
                    ปิดรายการ
                  </button>
                )}
              </div>
              <div className="sub">
                {i.status === 'RELEASED' ? 'ถอนได้เฉพาะเมื่อยังไม่มีแผนจัดสรรที่ดำเนินการอยู่ (ถ้ามีต้องยกเลิกแผนก่อน)' : i.reviewAfter ? `จะกลับมาให้ตัดสินใจใหม่วันที่ ${i.reviewAfter}` : ''}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="ne-decide">
            <h3 className="tr-h3">
              ตัดสินใจ <span className="en">FR-F2a-002</span>
            </h3>
            {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
            <label className="ne-qtyrow">
              <span>จำนวนที่จะปล่อย (≤ {canRelease} {i.unit})</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="ne-qtyinput num"
                  type="number"
                  min={0}
                  max={canRelease}
                  value={qty}
                  disabled={!mayRelease}
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
              <button
                className="btn btn-p"
                disabled={!mayRelease || qty <= 0 || busy}
                title={mayRelease ? undefined : releaseHint}
                onClick={() => onDecide('RELEASED', qty, reason)}
              >
                <Icon name="pkg" />
                ปล่อยเข้าคลังกลาง {qty} {i.unit}
              </button>
              <button
                className="btn btn-g"
                disabled={!mayRelease || busy || (live && !reasonOk)}
                title={mayRelease ? (live && !reasonOk ? 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษรก่อน' : undefined) : releaseHint}
                onClick={() => onDecide('KEPT', undefined, reason)}
              >
                เก็บไว้ใช้เอง
              </button>
              {live && (
                <button className="btn btn-g" disabled={!mayRelease || busy || !reasonOk} title={reasonOk ? undefined : 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษรก่อน'} onClick={() => onDecide('DISMISSED', undefined, reason)}>
                  ไม่ดำเนินการ (ปิดรายการ)
                </button>
              )}
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
