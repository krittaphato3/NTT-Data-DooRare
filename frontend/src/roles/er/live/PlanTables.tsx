import { Icon } from '../../../components/common/icons';
import type { ApiPlan, ApiPlanExtra, ApiPlanKit } from '../../../services/incidentApi';
import { classMeta, num, ruleText } from './format';

const th = (label: string, right = false, width?: number) => (
  <th scope="col" className={right ? 'r' : undefined} style={width ? { width } : undefined}>
    {label}
  </th>
);

const TAG: React.CSSProperties = { height: 18, fontSize: 10.5, padding: '0 6px' };
const SUB: React.CSSProperties = { fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: '16px' };
/** Row that still needs a borrow gets a soft red wash, so the eye lands on it first. */
const needRow = (need: boolean): React.CSSProperties | undefined => (need ? { background: '#fef2f2' } : undefined);

/** The "how many to borrow" cell: a red pill when something is short, a quiet green word when it is covered. */
function BorrowNeed({ n, unit }: { n: number; unit: string }) {
  return n > 0 ? (
    <span style={{ display: 'inline-block', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: 12.5, padding: '2px 10px', borderRadius: 12, whiteSpace: 'nowrap' }}>ยืม {num(n)} {unit}</span>
  ) : (
    <span style={{ color: '#15803d', fontSize: 12, fontWeight: 600 }}>ครบ</span>
  );
}

const removeBtn = (name: string, onClick?: () => void) => (
  <button type="button" className="btn btn-s btn-sm" title={`เอา ${name} ออกจากแผน`} aria-label={`เอา ${name} ออกจากแผน`} onClick={onClick} style={{ width: 28, padding: 0 }}>
    <Icon name="xc" className="ic12" />
  </button>
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

/** Ready-made kits per patient: how many are needed, how many are ready, how many staff pack from loose stock, how many whole sets to borrow. */
export function LiveKitTable({ plan, editable, disabledHint, onPack, onRemove }: KitTableProps) {
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
          ชุดยาสำเร็จรูป <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>แผนฉบับที่ {plan.revision}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>ใช้ชุดที่พร้อมอยู่แล้วก่อน → จัดเพิ่มจากของแยก → ที่เหลือยืมมาทั้งชุด (ไม่ยืมแยกชิ้น)</div>
      {plan.kits.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#64748b' }}>ไม่มีชุดยาในแผนนี้</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                {th('ชุด')}
                {th('ต้องใช้', true)}
                {th('มีพร้อมใช้', true)}
                <th scope="col" style={{ textAlign: 'center' }}>จัดจากของแยก</th>
                <th scope="col" style={{ textAlign: 'center' }}>ต้องยืม</th>
                {editable && th('', false, 36)}
              </tr>
            </thead>
            <tbody>
              {plan.kits.map((k) => {
                const cls = classMeta(k.class);
                const max = k.packMax !== null ? Math.min(k.packMax, k.estimated - k.useReady) : k.pack;
                return (
                  <tr key={k.code} style={needRow(k.borrowSet > 0)}>
                    <td style={{ minWidth: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{k.name}</span>
                        <span className={`badge ${cls.cls}`} style={TAG}>{cls.label}</span>
                        {k.edited && <span className="badge st-pending" style={TAG}>แก้โดยเจ้าหน้าที่</span>}
                        {k.noRecipe && <span className="badge st-rejected" style={TAG}>ยังไม่มีสูตรชุด</span>}
                      </div>
                      <div style={SUB}>{ruleText(k.rule, 'ชุด')}</div>
                      {k.borrowSet > 0 && !k.noRecipe && k.packMax !== null && k.packMax < k.estimated - k.useReady && (
                        <div style={{ ...SUB, color: '#92400e' }}>ของแยกจัดได้อีกสูงสุด {k.packMax} ชุด · ขาดชิ้นเดียวก็ต้องยืมทั้งชุด</div>
                      )}
                    </td>
                    <td className="r">
                      <b style={{ fontSize: 14 }}>{num(k.estimated)}</b>
                      <div style={SUB}>ขั้นต่ำ {num(k.critical)}</div>
                    </td>
                    <td className="r">
                      <b>{num(k.useReady)}</b>
                      {k.ready !== null && <div style={SUB}>ในคลังมี {num(k.ready)}</div>}
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
                    <td style={{ textAlign: 'center' }}><BorrowNeed n={k.borrowSet} unit="ชุด" /></td>
                    {editable && <td>{removeBtn(k.name, () => onRemove?.(k))}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable && disabledHint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{disabledHint}</div>}
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, lineHeight: '16px' }}>
        ลดจำนวนที่จัดได้อย่างเดียว ส่วนที่ลดจะกลายเป็นยืมทั้งชุดอัตโนมัติ
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

/** Items outside the kits: how many are needed, how many are in stock, how many to borrow. Blood (PRC group O) is capped at 6 units. */
export function LiveExtrasTable({ plan, editable, onRemove, onSetQty }: ExtraTableProps) {
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c', marginBottom: 4 }}>ยาและเวชภัณฑ์นอกชุด</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>ระบบคิดจำนวนจากกฎต่อผู้ป่วยแต่ละระดับ · แก้จำนวนในช่อง “ต้องใช้” ได้</div>
      {plan.extras.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#64748b' }}>ไม่มีรายการนอกชุดในแผนนี้</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                {th('รายการ')}
                {th('ต้องใช้', true)}
                {th('มีในสต็อก', true)}
                <th scope="col" style={{ textAlign: 'center' }}>ต้องยืม</th>
                {editable && th('', false, 36)}
              </tr>
            </thead>
            <tbody>
              {plan.extras.map((e) => {
                const cls = classMeta(e.class);
                return (
                  <tr key={e.key} style={needRow(e.borrow > 0)}>
                    <td style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{e.name}</span>
                        <span className={`badge ${cls.cls}`} style={TAG}>{e.blood ? 'โลหิต' : cls.label}</span>
                        {e.edited && <span className="badge st-pending" style={TAG}>แก้โดยเจ้าหน้าที่</span>}
                      </div>
                      <div style={SUB}>{ruleText(e.rule, e.unit ?? 'หน่วย')}</div>
                      {e.blood && <div style={{ ...SUB, color: '#b91c1c' }}>ขอได้เฉพาะโรงพยาบาลที่มีธนาคารเลือด · ต้องตรวจหมู่เลือดและ cross-match ก่อนให้ · สูงสุด 6 ยูนิต{e.capped ? ' (ปรับลดตามเพดานแล้ว)' : ''}</div>}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
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
                          style={{ width: 64, height: 28, textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit', fontWeight: 600 }}
                        />
                      ) : (
                        <b style={{ fontSize: 14 }}>{num(e.estimated)}</b>
                      )}
                      {e.unit && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>{e.unit}</span>}
                      <div style={SUB}>ขั้นต่ำ {num(e.critical)}</div>
                    </td>
                    <td className="r">{num(e.loose)}</td>
                    <td style={{ textAlign: 'center' }}><BorrowNeed n={e.borrow} unit={e.unit ?? 'หน่วย'} /></td>
                    {editable && <td>{removeBtn(e.name, () => onRemove?.(e))}</td>}
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
          <b style={{ color: '#0f2a5c' }}>ผลตรวจรวม (กระจายชุดตามสูตร เทียบของแยก + ของในชุดพร้อมใช้):</b>
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
