import { useEffect, useState } from 'react';
import { createAllocationPlan, getPoolCandidates } from '../../../services/expiryApi';
import type { ApiPoolCandidates } from '../../../services/expiryApi';
import { Modal } from '../../hospital-admin/components/Modal';

/**
 * F2 hand-made allocation plan: the owner pharmacist splits a pool lot among the receivers the code found (`GET /pool/{id}/candidates`).
 * Each receiver is capped by the F-22 quantity it can use before expiry; the server checks the same before storing the plan.
 */
export function ManualPlanDialog({ poolId, lotLabel, onClose, onCreated }: { poolId: string; lotLabel: string; onClose: () => void; onCreated: (planNo: string, status: string) => void }) {
  const [data, setData] = useState<ApiPoolCandidates | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPoolCandidates(poolId)
      .then((r) => setData(r.data))
      .catch((e: Error) => setError(e.message));
  }, [poolId]);

  const unit = data?.drug.unit ?? '';
  const lines = (data?.candidates ?? []).map((c) => ({ c, n: Number(qty[c.hospital.id] || 0) })).filter((l) => l.n > 0);
  const total = lines.reduce((s, l) => s + l.n, 0);
  const over = lines.find((l) => l.n > l.c.maxQty || !Number.isInteger(l.n));
  const valid = Boolean(data) && !data?.blocker && lines.length > 0 && !over && total <= (data?.qtyAvailable ?? 0);

  const submit = () => {
    setBusy(true);
    setError(null);
    createAllocationPlan(poolId, lines.map((l) => ({ receiverHospitalId: l.c.hospital.id, qty: l.n })))
      .then((r) => onCreated(r.data.planNo, r.data.status))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <Modal label="สร้างแผนจัดสรรเอง / Manual allocation plan" onClose={onClose}>
      <h2 className="sec-h">สร้างแผนจัดสรรเอง <span className="en">F2a · F-22 / F-23</span></h2>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', color: '#475569' }}>
        {lotLabel}
        {data && (
          <>
            {' '}· เหลือให้จัดสรร <b className="num">{data.qtyAvailable.toLocaleString()} {unit}</b> · หมดอายุในอีก <span className="num">{data.daysLeft}</span> วัน
          </>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
        ระบบแสดงเฉพาะ รพ.ในเขตที่จับคู่ยานี้แล้วและมีผลพยากรณ์ · “สูงสุด” คือจำนวนที่ รพ.นั้นใช้ทันก่อนหมดอายุ (F-22) · เรียงตามสต็อกที่เหลือน้อยวันที่สุดก่อน
      </div>
      {data?.blocker && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: '#B91C1C' }}>{data.blocker}</div>}
      {!data && !error && <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>กำลังคำนวณผู้รับ…</div>}
      {data && data.candidates.length === 0 && <div style={{ marginTop: 12, fontSize: 13, color: '#B91C1C' }}>ไม่มีโรงพยาบาลในเขตที่ใช้ยานี้ได้ (ต้องจับคู่รายการยาแล้วและมีผลพยากรณ์)</div>}
      {data && data.candidates.length > 0 && (
        <ul aria-label="ผู้รับที่เป็นไปได้" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {data.candidates.map((c) => (
            <li key={c.hospital.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ color: '#0F2A5C', fontWeight: 600, fontSize: 13 }}>{c.hospital.name}</b>
                <div className="sub num">
                  {c.hospital.code} · สต็อกพอใช้ {c.daysOfStock.toLocaleString()} วัน · ขาดจากเป้า {c.deficit.toLocaleString()} {unit} · {c.distanceKm.toLocaleString()} กม. · ค่าขนส่ง ฿{c.transportCostThb.toLocaleString()}
                </div>
              </div>
              <div style={{ width: 112, flex: 'none' }}>
                <input
                  className="ha-input num"
                  type="number"
                  min={0}
                  max={c.maxQty}
                  disabled={!c.canUseBeforeExpiry}
                  placeholder="0"
                  aria-label={`จำนวนให้ ${c.hospital.name}`}
                  value={qty[c.hospital.id] ?? ''}
                  onChange={(e) => setQty((m) => ({ ...m, [c.hospital.id]: e.target.value }))}
                />
                <div className="sub num" style={{ textAlign: 'right' }}>{c.canUseBeforeExpiry ? `สูงสุด ${c.maxQty.toLocaleString()}` : 'ใช้ไม่ทันก่อนหมดอายุ'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <div className="sub num" style={{ marginTop: 8, color: total > data.qtyAvailable || over ? '#B91C1C' : undefined }}>
          รวม {total.toLocaleString()} / {data.qtyAvailable.toLocaleString()} {unit}
          {over ? ` · ${over.c.hospital.name} ใช้ทันได้ไม่เกิน ${over.c.maxQty.toLocaleString()} ${unit}` : total > data.qtyAvailable ? ' · เกินจำนวนในคลังกลาง' : ''}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
      <div className="ha-dialog-foot">
        <button className="btn btn-g" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-p" disabled={!valid || busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'สร้างแผนและส่งขอความเห็นชอบ'}</button>
      </div>
    </Modal>
  );
}
