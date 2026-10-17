import { Fragment, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { assemblable, kitLevel, PACK_TASKS } from '../data/f3';
import type { KitDef } from '../data/f3';

interface PackTabProps {
  kits: KitDef[];
  /** Pack task ids already confirmed. */
  done: ReadonlySet<string>;
  onConfirm: (taskId: string) => void;
}

/**
 * Packing for OUR incidents: ready-set stock on top, then the pack tasks from the ER-approved plan.
 * Confirm pack = stock moves by the set recipe (ASM-13). Requests from other hospitals are answered
 * in "คำขอรอยืนยัน", not here.
 */
export function PackTab({ kits, done, onConfirm }: PackTabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="kt-kits" aria-label="สต็อกเซ็ตพร้อมใช้">
        {kits.map((k) => {
          const pct = Math.round((k.ready / k.target) * 100);
          const lv = kitLevel(pct);
          const a = assemblable(k);
          return (
            <div key={k.key} className="kt-kit">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13.5 }}>{k.th} <span className="en">{k.en}</span></span>
                <span className={`badge ${lv.cls}`}>{lv.label}</span>
              </div>
              <div className="num" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
                {k.ready}<span style={{ fontSize: 14, color: '#475569', fontWeight: 400 }}>/{k.target} ชุด</span>
              </div>
              <div className="wh-bar" role="img" aria-label={`พร้อมใช้ ${pct}%`}>
                <span style={{ width: `${pct}%`, background: lv.color }} />
              </div>
              <div className="sub" style={{ marginTop: 6 }}>แพ็กเพิ่มได้อีก <b className="num">{a.sets}</b> ชุด · ติดที่ {a.limiting.item}</div>
            </div>
          );
        })}
      </div>

      <div className="kt-subhead">
        <h2 className="sec-h">
          งานแพ็กจากแผนที่ ER อนุมัติ <span className="en">เหตุของ รพ.เรา</span>
        </h2>
      </div>
      <div className="scroll-x">
        <table className="tbl kt-tbl" aria-label="งานแพ็กชุดยา">
          <thead>
            <tr>
              <th style={{ width: 150 }}>งาน</th>
              <th>ชุดยา · จำนวน</th>
              <th style={{ width: 150 }}>เหตุ</th>
              <th style={{ width: 130 }}>สถานะ</th>
              <th style={{ width: 170 }}>
                <span className="srt">การดำเนินการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PACK_TASKS.map((p) => {
              const k = kits.find((x) => x.key === p.kitKey)!;
              const finished = done.has(p.id);
              const isOpen = open === p.id;
              const lines = k.recipe.map((r) => ({ id: `${p.id}:${r.item}`, ...r, need: r.perSet * p.qty }));
              const all = lines.every((l) => picked.has(l.id));
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td>
                      <span className="code" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>{p.id}</span>
                      <span style={{ display: 'block', marginTop: 2 }}><span className="badge t-red" style={{ height: 18, fontSize: 11 }}>F3 ฉุกเฉิน</span></span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{k.th}</span> <span className="en">{k.en}</span>
                      <span style={{ display: 'block', fontSize: 12.5 }}><span className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{p.qty}</span> ชุด</span>
                    </td>
                    <td className="code">{p.incident}</td>
                    <td>
                      <span className={`badge ${finished ? 't-green' : 't-amber'}`}>{finished ? 'แพ็กเสร็จแล้ว' : 'รอแพ็ก'}</span>
                    </td>
                    <td className="r">
                      {finished ? (
                        <span className="sub">ตัดสต็อกแล้ว</span>
                      ) : (
                        <button className="btn btn-sm btn-p" aria-expanded={isOpen ? 'true' : 'false'} onClick={() => setOpen(isOpen ? null : p.id)}>
                          {isOpen ? 'ซ่อนรายการ' : 'แพ็ก'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && !finished && (
                    <tr>
                      <td colSpan={5} className="kt-recipe-cell">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <b style={{ color: '#0F2A5C', fontWeight: 600 }}>หยิบให้ครบตามสูตรเซ็ต × {p.qty} ชุด <span className="sub">(สูตรเป็นค่าตั้งต้น รอเจ้าของด้านคลินิกยืนยัน)</span></b>
                          <ul className="ib-pick">
                            {lines.map((l) => (
                              <li key={l.id}>
                                <label>
                                  <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`หยิบแล้ว ${l.item}`} />
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>{l.item}</span>
                                    {l.coldChain && <span className="badge t-blue" style={{ marginLeft: 6, height: 18, fontSize: 11 }}>Cold chain</span>}
                                    <span className="sub" style={{ display: 'block' }}>{l.perSet} {l.unit} ต่อชุด · ของแยกชิ้นคงเหลือ {l.onHand} {l.unit}</span>
                                  </span>
                                  <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>{l.need} {l.unit}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button className="btn btn-p btn-sm" disabled={!all} title={all ? undefined : 'ต้องติ๊กหยิบครบทุกรายการก่อน'} onClick={() => { onConfirm(p.id); setOpen(null); }}>
                              <Icon name="checkc" />
                              ยืนยันแพ็กเสร็จ · ตัดสต็อกตามสูตร
                            </button>
                            <span className="sub">เซ็ตพร้อมใช้จะเพิ่ม {p.qty} ชุด</span>
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
    </>
  );
}
