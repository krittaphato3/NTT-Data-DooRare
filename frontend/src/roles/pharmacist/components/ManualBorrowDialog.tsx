import { useEffect, useState } from 'react';
import { getHospitalDrugs } from '../../../services/catalogApi';
import type { ApiHospitalDrug } from '../../../services/catalogApi';
import { createBorrowRequest, proposeBorrowRequest } from '../../../services/borrowApi';
import { Modal } from '../../hospital-admin/components/Modal';

/**
 * UI-10 manual borrow request: pick a drug of our hospital, the quantity and the reason; the request is created
 * (API-F1b-001, context MANUAL) and its lender ladder proposed (API-F1b-004). Approval happens in the list.
 */
export function ManualBorrowDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (requestNo: string, status: string) => void }) {
  const [q, setQ] = useState('');
  const [drugs, setDrugs] = useState<ApiHospitalDrug[]>([]);
  const [drugId, setDrugId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      getHospitalDrugs({ q: q.trim() || undefined, limit: 30 })
        .then((res) => setDrugs(res.items.filter((d) => d.master && d.mapping?.status === 'VERIFIED' && !d.master.blood && !d.master.controlled && d.ved !== 'D')))
        .catch(() => setDrugs([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const picked = drugs.find((d) => d.master?.id === drugId);
  const qtyNum = Number(qty);
  const valid = Boolean(drugId) && qtyNum > 0 && reason.trim().length >= 3;

  const submit = () => {
    setBusy(true);
    setError(null);
    createBorrowRequest({ context: 'MANUAL', items: [{ drugMasterId: drugId, qtyRequested: qtyNum }], reason: reason.trim() })
      .then((created) => proposeBorrowRequest(created.id))
      .then((proposed) => onCreated(proposed.data.requestNo, proposed.data.status))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <Modal label="สร้างคำขอยืมเอง / Manual borrow request" onClose={onClose}>
      <h2 className="sec-h">สร้างคำขอยืมเอง <span className="en">UI-10 · API-F1b-001</span></h2>
      <div style={{ marginTop: 10, fontSize: 13, lineHeight: '20px', color: '#475569' }}>
        เลือกยา (เฉพาะยา V/E ที่จับคู่รหัสกลางแล้ว ไม่ใช่ยาควบคุม/เลือด) ระบบจัดลำดับผู้ให้ยืมให้แล้วรอเภสัชกรอนุมัติก่อนส่ง
      </div>
      <div className="ha-field" style={{ marginTop: 12 }}>
        <label className="ha-label" htmlFor="mb-q">ค้นหายา</label>
        <input id="mb-q" className="ha-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อยา / รหัส" autoFocus />
        <select className="sel" aria-label="ยาที่ต้องการยืม" value={drugId} onChange={(e) => setDrugId(e.target.value)} style={{ marginTop: 6, width: '100%' }}>
          <option value="">เลือกยา ({drugs.length} รายการ)</option>
          {drugs.map((d) => (
            <option key={d.id} value={d.master!.id}>
              [{d.ved}] {d.localName} ({d.master!.baseUnit})
            </option>
          ))}
        </select>
      </div>
      <div className="ha-field" style={{ marginTop: 12 }}>
        <label className="ha-label" htmlFor="mb-qty">จำนวนที่ขอ{picked ? ` (${picked.master!.baseUnit})` : ''} <span aria-hidden="true">*</span></label>
        <input id="mb-qty" className="ha-input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div className="ha-field" style={{ marginTop: 12 }}>
        <label className="ha-label" htmlFor="mb-reason">เหตุผล <span aria-hidden="true">*</span></label>
        <textarea id="mb-reason" className="ha-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ผู้ป่วยรายหนึ่งต้องใช้ยาก่อนใบสั่งซื้อมาถึง" />
      </div>
      {error && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
      <div className="ha-dialog-foot">
        <button className="btn btn-g" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-p" disabled={!valid || busy} onClick={submit}>สร้างและเสนอลำดับผู้ให้ยืม</button>
      </div>
    </Modal>
  );
}
