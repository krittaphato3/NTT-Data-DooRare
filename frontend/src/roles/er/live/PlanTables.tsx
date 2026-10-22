import { Icon } from '../../../components/common/icons';
import type { ApiPlan, ApiPlanExtra, ApiPlanKit } from '../../../services/incidentApi';
import { classMeta, num, ruleText } from './format';

const th = (label: string, right = false, width?: number) => (
  <th scope="col" className={right ? 'r' : undefined} style={width ? { width } : undefined}>
    {label}
  </th>
);

interface KitTableProps {
  plan: ApiPlan;
  /** Staff may change the pack count / remove a line. */
  editable: boolean;
  disabledHint?: string;
  /** `delta` is -1 / +1 on the "จัดจากของแยก" stepper. */
  onPack?: (kit: ApiPlanKit, delta: number) => void;
  onRemove?: (kit: ApiPlanKit) => void;
}

/** UI-12 preset kits per patient: estimate, critical minimum, ready sets, pack from loose stock, borrow whole sets (F-27). */
export function LiveKitTable({ plan, editable, disabledHint, onPack, onRemove }: KitTableProps) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>
          ชุดสำเร็จรูป (Preset Kit ต่อผู้ป่วย) <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>F-27 · แผนฉบับที่ {plan.revision}</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b' }}>ลำดับ: ใช้ชุดพร้อมใช้ → จัดเพิ่มจากของแยก (ครบทุกชิ้น) → ยืมทั้งชุด · ไม่ยืมแยกชิ้น (BR-F3-013)</div>
      </div>
      {plan.kits.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#64748b' }}>ไม่มีชุดยาในแผนนี้</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                {th('ชุด')}
                {th('ประมาณการ', true)}
                {th('ขั้นวิกฤต', true)}
                {th('ส่วนเผื่อ', true)}
                {th('ใช้ชุดพร้อมใช้', true)}
                <th scope="col" style={{ textAlign: 'center' }}>จัดจากของแยก</th>
                {th('ยืมทั้งชุด', true)}
                {editable && th('', false, 36)}
              </tr>
            </thead>
            <tbody>
              {plan.kits.map((k) => {
                const cls = classMeta(k.class);
                const max = k.packMax !== null ? Math.min(k.packMax, k.estimated - k.useReady) : k.pack;
                return (
                  <tr key={k.code}>
                    <td style={{ minWidth: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{k.name}</span>
                        <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{cls.label}</span>
                        {k.edited && <span className="badge st-pending" style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>แก้โดยเจ้าหน้าที่</span>}
                        {k.noRecipe && <span className="badge st-rejected" style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>NO_RECIPE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{ruleText(k.rule, 'ชุด')}</div>
                      {k.borrowSet > 0 && !k.noRecipe && k.packMax !== null && k.packMax < k.estimated - k.useReady && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>ของแยกจัดได้อีกสูงสุด {k.packMax} ชุด · ขาดชิ้นเดียวก็ยืมทั้งชุด (BR-F3-013)</div>
                      )}
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{num(k.estimated)}</td>
                    <td className="r">{num(k.critical)}</td>
                    <td className="r" style={{ color: '#64748b' }}>{num(k.buffer)}</td>
                    <td className="r">
                      {num(k.useReady)}
                      {k.ready !== null && <span style={{ color: '#94a3b8', fontSize: 11 }}> / มี {num(k.ready)}</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {editable && !k.noRecipe ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" className="btn btn-s btn-sm" aria-label={`ลดจำนวนที่จัด ${k.name}`} disabled={k.pack <= 0} onClick={() => onPack?.(k, -1)} style={{ width: 28, padding: 0 }}>−</button>
                          <b style={{ minWidth: 22, display: 'inline-block' }}>{num(k.pack)}</b>
                          <button type="button" className="btn btn-s btn-sm" aria-label={`เพิ่มจำนวนที่จัด ${k.name}`} disabled={k.pack >= max} onClick={() => onPack?.(k, 1)} style={{ width: 28, padding: 0 }}>+</button>
                        </span>
                      ) : (
                        <b>{num(k.pack)}</b>
                      )}
                    </td>
                    <td className="r" style={{ fontWeight: 700, color: k.borrowSet ? '#dc2626' : '#15803d' }}>{num(k.borrowSet)}</td>
                    {editable && (
                      <td>
                        <button type="button" className="btn btn-s btn-sm" title={`เอา ${k.name} ออกจากแผน`} aria-label={`เอา ${k.name} ออกจากแผน`} onClick={() => onRemove?.(k)} style={{ width: 28, padding: 0 }}>
                          <Icon name="xc" className="ic12" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable && disabledHint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{disabledHint}</div>}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: '16px' }}>
        ลดจำนวนที่จัดเองได้อย่างเดียว ส่วนที่ลดจะกลายเป็นยืมทั้งชุดอัตโนมัติ (BR-F3-014) · ระบบไม่เปิดชุดที่แพ็กแล้วมาใช้ (BR-F3-010)
      </div>
    </div>
  );
}

interface ExtraTableProps {
  plan: ApiPlan;
  editable: boolean;
  onRemove?: (extra: ApiPlanExtra) => void;
  onSetQty?: (extra: ApiPlanExtra, qty: number) => void;
}

/** Items outside the kits: estimate, critical minimum, stock now, borrow quantity. PRC group O is capped (BR-F3-031). */
export function LiveExtrasTable({ plan, editable, onRemove, onSetQty }: ExtraTableProps) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
        ยาและเวชภัณฑ์นอกชุด <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>BR-F3-003 · ระบบคิดจำนวนจากกฎต่อผู้ป่วย</span>
      </div>
      {plan.extras.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#64748b' }}>ไม่มีรายการนอกชุดในแผนนี้</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                {th('รายการ')}
                {th('กฎ')}
                {th('ประมาณการ', true)}
                {th('ขั้นวิกฤต', true)}
                {th('สต็อกที่ใช้ได้', true)}
                {th('ยืม', true)}
                {editable && th('', false, 36)}
              </tr>
            </thead>
            <tbody>
              {plan.extras.map((e) => {
                const cls = classMeta(e.class);
                return (
                  <tr key={e.key}>
                    <td style={{ minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{e.name}</span>
                        <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{e.blood ? 'โลหิต · เฉพาะ รพ.มีธนาคารเลือด' : cls.label}</span>
                        {e.edited && <span className="badge st-pending" style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>แก้โดยเจ้าหน้าที่</span>}
                      </div>
                      {e.blood && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>ต้องให้ธนาคารเลือดยืนยัน ABO/Rh และ cross-match ก่อนให้ · สูงสุด 6 ยูนิต{e.capped ? ' (ปรับลดตามเพดานแล้ว)' : ''}</div>}
                    </td>
                    <td style={{ fontSize: 11.5, color: '#64748b' }}>{ruleText(e.rule, e.unit ?? 'หน่วย')}</td>
                    <td className="r" style={{ fontWeight: 600 }}>
                      {editable && onSetQty ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={e.estimated}
                          key={`${e.key}-${e.estimated}`}
                          aria-label={`จำนวน ${e.name}`}
                          onBlur={(ev) => {
                            const v = Number(ev.target.value);
                            if (Number.isInteger(v) && v >= 0 && v !== e.estimated) onSetQty(e, v);
                          }}
                          style={{ width: 64, height: 28, textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit' }}
                        />
                      ) : (
                        num(e.estimated)
                      )}{' '}
                      <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 400 }}>{e.unit}</span>
                    </td>
                    <td className="r">{num(e.critical)}</td>
                    <td className="r">{num(e.loose)}</td>
                    <td className="r" style={{ fontWeight: 700, color: e.borrow ? '#dc2626' : '#15803d' }}>{num(e.borrow)}</td>
                    {editable && (
                      <td>
                        <button type="button" className="btn btn-s btn-sm" title={`เอา ${e.name} ออกจากแผน`} aria-label={`เอา ${e.name} ออกจากแผน`} onClick={() => onRemove?.(e)} style={{ width: 28, padding: 0 }}>
                          <Icon name="xc" className="ic12" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Reminders that belong to the plan: black / unknown patients, other blood products, equipment, items short in total. */
export function PlanNotes({ plan }: { plan: ApiPlan }) {
  if (plan.notes.length === 0 && plan.shortfall.length === 0) return null;
  return (
    <div className="card" style={{ padding: '12px 16px', fontSize: 12, color: '#475569', lineHeight: '19px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2a5c', marginBottom: 6 }}>ข้อควรทราบ</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {plan.notes.map((n, i) => (
          <li key={i}>{n.text}</li>
        ))}
      </ul>
      {plan.shortfall.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <b style={{ color: '#0f2a5c' }}>ผลตรวจรวมแบบ one-pass (กระจายชุดตามสูตร เทียบของแยก + ของในชุดพร้อมใช้):</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {plan.shortfall.map((s) => (
              <li key={s.item}>
                {s.name}: ต้องการ {num(s.need)} · มีรวม {num(s.available)} · ขาด <b style={{ color: '#dc2626' }}>{num(s.shortage)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
