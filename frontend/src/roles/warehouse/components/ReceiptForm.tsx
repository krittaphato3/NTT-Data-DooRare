import { Icon } from '../../../components/common/icons';
import { fmtQty } from '../data/transport';
import type { Shipment } from '../data/transport';

interface ReceiptFormProps {
  shipment: Shipment;
  counted: string;
  onCounted: (v: string) => void;
  onConfirm: () => void;
}

/** Receiver confirm (ARRIVED → RECEIVED). Stock increases only on confirm. */
export function ReceiptForm({ shipment: s, counted, onCounted, onConfirm }: ReceiptFormProps) {
  const diff = Number(counted) !== s.qty;
  return (
    <section aria-label="ยืนยันรับของ" className="receipt">
      <h3 className="receipt-h">
        ยืนยันรับของ <span className="en">Receiver confirm → RECEIVED</span>
      </h3>
      <div className="receipt-grid">
        <span className="sub">ล็อต</span>
        <span className="sub" style={{ textAlign: 'right' }}>
          ตามใบโอน
        </span>
        <span className="sub">นับได้จริง</span>
        <span>
          <span className="code" style={{ fontWeight: 600, color: '#0F2A5C' }}>
            {s.lotCode}
          </span>
          {s.expiry ? ` · ${s.expiry}` : ''}
        </span>
        <span className="num" style={{ textAlign: 'right', color: '#0F2A5C' }}>
          {fmtQty(s.qty)}
        </span>
        <input className="inp num" type="number" min={0} value={counted} onChange={(e) => onCounted(e.target.value)} aria-label="จำนวนที่นับได้" style={{ width: 110 }} />
      </div>
      {diff && (
        <div className="receipt-warn">
          <Icon name="tri" className="ic14" style={{ marginTop: 2 }} />
          จำนวนไม่ตรง ระบบจะบันทึกส่วนต่างและแจ้งต้นทาง · กรุณาระบุหมายเหตุ
        </div>
      )}
      <div className="receipt-checks">
        <label>
          <input type="checkbox" defaultChecked />
          บรรจุภัณฑ์และฉลากสมบูรณ์ ไม่แตกเสียหาย
        </label>
        <label>
          <input type="checkbox" defaultChecked />
          ล็อตและวันหมดอายุตรงตามใบโอน TRANSFER_SLIP
        </label>
      </div>
      <textarea className="inp" rows={2} placeholder="หมายเหตุ (ถ้ามี)" aria-label="หมายเหตุ" />
      <button className="btn btn-p" onClick={onConfirm} style={{ height: 44 }}>
        <Icon name="check" />
        ยืนยันรับ {counted || 0} {s.unit} เข้าสต็อก
      </button>
      <div className="sub">เมื่อยืนยัน สต็อกของเราเพิ่มทันที (POOL_TRANSFER_IN) · โอนยาใกล้หมดอายุเป็นการโอนถาวร ไม่ต้องคืน</div>
    </section>
  );
}
