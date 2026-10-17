import { Icon } from '../../../components/common/icons';
import { fmtQty, HOSPITALS, isOutbound, STEP_ORDER, STEPS } from '../data/transport';
import type { Shipment, TransportStatus } from '../data/transport';
import { StatusBadge } from './StatusBadge';

export interface ShipmentRowState {
  shipment: Shipment;
  status: TransportStatus;
  pending: boolean;
  cancelRequested: boolean;
}

interface ShipmentTableProps {
  rows: ShipmentRowState[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onAction: (row: ShipmentRowState) => void;
  /** false = read-only role (pharmacist): every action opens the detail only. */
  canOperate: boolean;
  /** true = this role answers cancel requests (pharmacist). */
  canCancel: boolean;
  /** true = driver role: milestones are 'ออกเดินทาง' and 'ถึงแล้ว + รูป'. */
  isDriver?: boolean;
}

function actionFor(r: ShipmentRowState, canOperate: boolean, canCancel: boolean, isDriver?: boolean): [string, string] {
  const out = isOutbound(r.shipment);
  // Only the pharmacist answers a cancel request (RBAC §4.4).
  if (canCancel && r.status === 'WAITING_DISPATCH' && out && r.cancelRequested) return ['ตอบคำขอยกเลิก', 'btn-p'];
  if (!canOperate) return ['ดูรายละเอียด', 'btn-s'];
  if (isDriver) {
    if (r.status === 'LOADED') return ['ออกเดินทาง', 'btn-p'];
    if (r.status === 'IN_TRANSIT') return ['ถึงแล้ว + รูป', 'btn-p'];
    return ['ดูรายละเอียด', 'btn-s'];
  }
  if (r.status === 'ARRIVED' && !out) return ['ยืนยันรับของ', 'btn-p'];
  if (r.status === 'WAITING_DISPATCH' && out) return r.cancelRequested ? ['ดูรายละเอียด', 'btn-s'] : ['ขึ้นรถ + ถ่ายรูป', 'btn-p'];
  if (r.status === 'LOADED' && r.pending) return ['ซิงก์ตอนนี้', 'btn-s'];
  return ['ดูรายละเอียด', 'btn-s'];
}

export function ShipmentTable({ rows, activeId, onOpen, onAction, canOperate, canCancel, isDriver }: ShipmentTableProps) {
  return (
    <>
      <div className="scroll-x">
        <table className="tbl" aria-label="งานขนส่ง">
          <thead>
            <tr>
              <th style={{ width: 158 }}>งานขนส่ง</th>
              <th>ยา · จำนวน</th>
              <th style={{ width: 220 }}>เส้นทาง</th>
              <th style={{ width: 150 }}>สถานะ</th>
              <th style={{ width: 150 }}>ขั้นตอน</th>
              <th style={{ width: 70 }}>รูป</th>
              <th style={{ width: 120 }}>อัปเดตล่าสุด</th>
              <th style={{ width: 136 }}>
                <span className="srt">การดำเนินการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.shipment;
              const out = isOutbound(s);
              const idx = r.status === 'CANCELLED' ? -1 : STEP_ORDER.indexOf(r.status);
              const [label, cls] = actionFor(r, canOperate, canCancel, isDriver);
              return (
                <tr key={s.id} className={activeId === s.id ? 'r-active' : ''}>
                  <td>
                    <button className="rowbtn code" onClick={() => onOpen(s.id)} style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>
                      {s.id}
                    </button>
                    <span style={{ display: 'block', marginTop: 2 }}>
                      <span className={`badge ${s.kind === 'F1' ? 't-blue' : 't-teal'}`} style={{ height: 18, fontSize: 11 }}>
                        {s.kind === 'F1' ? 'ยืม · BORROW_LEG' : 'โอนใกล้หมดอายุ · ALLOCATION_LINE'}
                      </span>
                    </span>
                    <span className="code" style={{ display: 'block', fontSize: 11 }}>
                      {s.ref}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{s.drug}</span>
                    {s.coldChain && (
                      <span className="badge t-blue" style={{ marginLeft: 6, height: 18, fontSize: 11 }} title="ต้องควบคุมอุณหภูมิระหว่างขนส่ง">
                        Cold chain
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: 12.5 }}>
                      <span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>
                        {fmtQty(s.qty)}
                      </span>{' '}
                      {s.unit}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span title={out ? 'ส่งออกจากเรา' : 'รับเข้าเรา'} className="route-dir" style={{ background: out ? '#FFF7ED' : '#EFF6FF', color: out ? '#9A3412' : '#1D4ED8' }}>
                        <Icon name={out ? 'outArrow' : 'inArrow'} className="ic14" />
                      </span>
                      <span style={{ fontSize: 12.5, lineHeight: '18px', color: '#0F2A5C' }}>
                        {HOSPITALS[s.from]} <span style={{ color: '#475569' }}>→</span> {HOSPITALS[s.to]}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.pending && (
                      <span className="badge t-amber" style={{ marginTop: 4, height: 20, fontSize: 11 }}>
                        <Icon name="sync" className="ic12" />
                        รอซิงก์
                      </span>
                    )}
                    {r.cancelRequested && (
                      <span className="badge t-orange" style={{ marginTop: 4, height: 20, fontSize: 11 }}>
                        ขอยกเลิก
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="mst" role="img" aria-label={r.status === 'CANCELLED' ? 'ยกเลิก' : `ขั้นที่ ${idx + 1} จาก ${STEP_ORDER.length}`}>
                      {STEP_ORDER.map((o, i) => (
                        <span key={o} style={{ background: r.status === 'CANCELLED' ? '#E2E8F0' : i < idx ? '#1D4ED8' : i === idx ? '#93C5FD' : '#E2E8F0' }} />
                      ))}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: '16px', marginTop: 3 }}>
                      {r.status === 'CANCELLED' ? 'ยกเลิกโดยความยินยอม' : `${idx + 1}/${STEP_ORDER.length} · ${STEPS[idx].label.split(' · ')[0]}`}
                    </span>
                  </td>
                  <td>
                    <span className="num" style={{ fontSize: 12.5, color: '#0F2A5C' }}>
                      {s.photos.length}
                    </span>
                    <span style={{ fontSize: 11.5 }}> / 10</span>
                  </td>
                  <td style={{ fontSize: 12, lineHeight: '17px' }}>
                    <span className="num" style={{ color: '#0F2A5C' }}>
                      {s.updatedAt}
                    </span>
                    <br />
                    {s.updatedBy}
                  </td>
                  <td className="r">
                    <button className={`btn btn-sm ${cls}`} onClick={() => onAction(r)}>
                      {label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>
          แสดง <span className="num">{rows.length}</span> งาน
        </span>
        <span>ยกเลิกได้เฉพาะก่อนขึ้นรถ และต้องได้ความยินยอมทั้งสองฝ่าย</span>
      </div>
    </>
  );
}
