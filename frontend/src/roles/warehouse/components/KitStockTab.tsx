import { Fragment, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { assemblable, KIT_DEFS, kitLevel } from '../data/f3';
import { whHref } from '../data/routes';

/** Ready-set stock + loose items per kit (RBAC 👁: view only; packing is done from the work inbox). */
export function KitStockTab() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="kt-note">
        <Icon name="eye" className="ic14" style={{ marginTop: 2 }} />
        <span>
          ดูอย่างเดียว · เติมหรือแพ็กเซ็ตทำที่ <a className="link" href={whHref('inbox')} style={{ fontSize: 12.5 }}>กล่องงานเข้า</a> (แท็บ "เตรียมชุดยา F3") เมื่อ ER อนุมัติแผน
        </span>
      </div>
      <div className="scroll-x">
        <table className="tbl kt-tbl" aria-label="สต็อกเซ็ตพร้อมใช้">
          <thead>
            <tr>
              <th style={{ width: 230 }}>ชุดยา (ผู้ป่วย 1 คน)</th>
              <th style={{ width: 230 }}>เซ็ตพร้อมใช้</th>
              <th style={{ width: 130 }}>สถานะ</th>
              <th>แพ็กเพิ่มได้จากของแยกชิ้น</th>
              <th style={{ width: 130 }}>
                <span className="srt">รายละเอียด</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {KIT_DEFS.map((k) => {
              const pct = Math.round((k.ready / k.target) * 100);
              const lv = kitLevel(pct);
              const a = assemblable(k);
              const isOpen = open === k.key;
              return (
                <Fragment key={k.key}>
                  <tr>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{k.th}</span> <span className="en">{k.en}</span>
                      <span className="sub" style={{ display: 'block' }}>{k.recipe.length} รายการต่อชุด</span>
                    </td>
                    <td>
                      <span className="num" style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 600 }}>
                        {k.ready}/{k.target} ชุด
                      </span>
                      <div className="wh-bar" role="img" aria-label={`พร้อมใช้ ${pct}%`} style={{ marginTop: 4 }}>
                        <span style={{ width: `${pct}%`, background: lv.color }} />
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${lv.cls}`}>{lv.label}</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>{a.sets}</span> ชุด
                      <span className="sub" style={{ display: 'block' }}>ติดที่ {a.limiting.item} (เหลือ {a.limiting.onHand} {a.limiting.unit})</span>
                    </td>
                    <td className="r">
                      <button className="btn btn-sm btn-s" aria-expanded={isOpen ? 'true' : 'false'} onClick={() => setOpen(isOpen ? null : k.key)}>
                        {isOpen ? 'ซ่อน' : 'ดูสูตรเซ็ต'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${k.key}-recipe`}>
                      <td colSpan={5} className="kt-recipe-cell">
                        <table className="kt-recipe">
                          <thead>
                            <tr>
                              <th>รายการในเซ็ต (สูตรเป็นค่าตั้งต้น รอเจ้าของด้านคลินิกยืนยัน)</th>
                              <th>ต่อชุด</th>
                              <th>ของแยกชิ้นคงเหลือ</th>
                              <th>แพ็กได้อีก</th>
                            </tr>
                          </thead>
                          <tbody>
                            {k.recipe.map((r) => (
                              <tr key={r.item}>
                                <td>
                                  {r.item}
                                  {r.coldChain && <span className="badge t-blue" style={{ marginLeft: 6, height: 18, fontSize: 11 }}>Cold chain</span>}
                                </td>
                                <td className="num">{r.perSet} {r.unit}</td>
                                <td className="num">{r.onHand} {r.unit}</td>
                                <td className="num" style={{ fontWeight: 600, color: Math.floor(r.onHand / r.perSet) === a.sets ? '#B91C1C' : '#0F2A5C' }}>
                                  {Math.floor(r.onHand / r.perSet)} ชุด
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
