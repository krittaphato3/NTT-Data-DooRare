import { Fragment, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { RETURN_KIND_META, RETURN_STATUS_META } from '../data/f3';
import type { ReturnItem } from '../data/f3';
import { fmtQty, HOSPITALS } from '../data/transport';

interface ReturnsTabProps {
  rows: ReturnItem[];
  /** Quantity confirmed so far per return (partial returns keep the item open). */
  got: Record<string, number>;
  onConfirm: (id: string, counted: number) => void;
}

/** Post-incident returns: goods we owe, goods owed to us, and unused sets back to stock. */
export function ReturnsTab({ rows, got, onConfirm }: ReturnsTabProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [counted, setCounted] = useState('');

  return (
    <div className="scroll-x">
      <table className="tbl kt-tbl" aria-label="รับคืนหลังเหตุ">
        <thead>
          <tr>
            <th style={{ width: 150 }}>รายการ</th>
            <th>ยา/เวชภัณฑ์ · จำนวน</th>
            <th style={{ width: 190 }}>ประเภท</th>
            <th style={{ width: 150 }}>กำหนดคืน</th>
            <th style={{ width: 130 }}>สถานะ</th>
            <th style={{ width: 170 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = RETURN_KIND_META[r.kind];
            const have = got[r.id] ?? 0;
            const remaining = Math.max(0, r.qty - have);
            const finished = remaining === 0;
            const partial = have > 0 && !finished;
            const st = RETURN_STATUS_META[finished ? 'DONE' : r.status];
            const isEdit = editing === r.id;
            return (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    <span className="code" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>{r.id}</span>
                    <span className="code" style={{ display: 'block', fontSize: 11 }}>{r.incident}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                    <span style={{ display: 'block', fontSize: 12.5 }}>
                      <span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{fmtQty(r.qty)}</span> {r.unit}
                      {r.counterpart && <span className="sub"> · {HOSPITALS[r.counterpart]}</span>}
                    </span>
                    <span className="sub" style={{ display: 'block' }}>
                      {finished ? `ยืนยันแล้ว 19:12 · ครบ ${fmtQty(r.qty)} ${r.unit} · บันทึกใน audit log` : partial ? `รับ/ส่งแล้ว ${fmtQty(have)} จาก ${fmtQty(r.qty)} · เหลืออีก ${fmtQty(remaining)} ${r.unit}` : r.note}
                    </span>
                  </td>
                  <td>
                    <span className={`badge t-${k.tone}`}>{k.label}</span>
                  </td>
                  <td className="num" style={{ fontSize: 12.5 }}>{r.due}</td>
                  <td>
                    <span className={`badge t-${partial ? 'blue' : st.tone}`}>{partial ? 'คืนบางส่วน' : st.label}</span>
                  </td>
                  <td className="r">
                    {finished ? (
                      <span className="sub">บันทึกแล้ว</span>
                    ) : (
                      <button
                        className="btn btn-sm btn-p"
                        onClick={() => {
                          setEditing(isEdit ? null : r.id);
                          setCounted(String(remaining));
                        }}
                      >
                        {k.action}
                      </button>
                    )}
                  </td>
                </tr>
                {isEdit && !finished && (
                  <tr key={`${r.id}-form`}>
                    <td colSpan={6} className="kt-recipe-cell">
                      <div className="kt-confirm">
                        <b style={{ color: '#0F2A5C', fontWeight: 600 }}>{k.action} · {r.drug}</b>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          {r.kind === 'we_return' ? 'จำนวนที่ส่งคืน' : 'จำนวนที่นับได้จริง'}
                          <input className="inp num" type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} style={{ width: 110 }} aria-label="จำนวน" />
                          <span className="sub">เหลือ {fmtQty(remaining)} {r.unit}</span>
                        </label>
                        {Number(counted) !== remaining && (
                          <div className="receipt-warn">
                            <Icon name="tri" className="ic14" style={{ marginTop: 2 }} />
                            {Number(counted) < remaining ? 'จำนวนน้อยกว่าที่เหลือ ระบบบันทึกเป็นคืนบางส่วนและยังไม่ปิดรายการจนกว่าจะครบ' : 'จำนวนเกินที่ต้องคืน ระบบจะบันทึกส่วนต่างและแจ้งผู้เกี่ยวข้อง'}
                          </div>
                        )}
                        {r.kind === 'we_return' && <span className="sub">การส่งคืนจะเกิดเป็นงานขนส่งที่หน้าติดตามการขนส่ง (ส่งออกจากเรา)</span>}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-p btn-sm"
                            onClick={() => {
                              onConfirm(r.id, Number(counted));
                              setEditing(null);
                            }}
                          >
                            ยืนยัน
                          </button>
                          <button className="btn btn-g btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
