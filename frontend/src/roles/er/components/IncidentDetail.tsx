import type { IncidentAccess } from '../data/access';
import { statusMeta } from '../data/incidentStore';
import type { IncidentRecord } from '../data/incidentStore';
import { triageTotal } from '../data/intake';
import { erHref } from '../data/navigation';
import { buildStockCheck } from '../data/stockCheck';
import { EXTRA_DRUGS } from '../data/incident';
import { BorrowPanel } from './BorrowPanel';
import { IncidentUpdateForm } from './IncidentUpdateForm';

const LEVELS: { key: 'red' | 'yellow' | 'green' | 'black' | 'unknown'; label: string; color: string; bg: string }[] = [
  { key: 'red', label: 'แดง', color: '#b91c1c', bg: '#fee2e2' },
  { key: 'yellow', label: 'เหลือง', color: '#b45309', bg: '#fef3c7' },
  { key: 'green', label: 'เขียว', color: '#15803d', bg: '#dcfce7' },
  { key: 'black', label: 'ดำ', color: '#334155', bg: '#f1f5f9' },
  { key: 'unknown', label: 'ไม่ทราบระดับ', color: '#6d28d9', bg: '#f5f3ff' },
];

const cardTitle = { fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 } as const;

/** One incident: situation, plan and stock result, borrow request status, history, and the update form. */
export function IncidentDetail({ rec, access }: { rec: IncidentRecord; access: IncidentAccess }) {
  const meta = statusMeta(rec);
  const open = rec.status === 'planning' || rec.status === 'sent';
  const planned = rec.reached >= 2 && !rec.seed?.startsWith('arch');
  const lines = planned ? buildStockCheck(rec.kits, EXTRA_DRUGS) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#0f2a5c' }}>{rec.id}</span>
              <span className={`badge ${meta.cls}`}>{meta.label}</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>แจ้งเมื่อ {rec.createdAt}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f2a5c', marginTop: 4 }}>
              {rec.intake.category} · {rec.intake.location}
            </div>
            {rec.intake.detail && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>{rec.intake.detail}</div>}
          </div>
          {open && access.mayWrite && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!rec.seed && (
                <a className="btn btn-p" href={erHref('flow', { incident: rec.id })}>
                  {rec.step >= 5 && !rec.planStale ? 'เปิดใน flow' : 'ทำต่อ →'}
                </a>
              )}
              <a className="btn btn-s" href={erHref('track')}>
                ติดตามคำขอและจัดชุด
              </a>
            </div>
          )}
        </div>

        {rec.planStale && (
          <div role="status" style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#92400e', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>จำนวนผู้ป่วยเปลี่ยนหลังทำแผนแล้ว · ควรให้ Agent ประเมินใหม่ ส่วนที่ขาดเพิ่มจะส่งเป็นคำขอยืมเพิ่มเติม (คำขอที่ส่งแล้วไม่ถูกยกเลิก)</span>
            {access.mayWrite && (
              <a className="btn btn-p btn-sm" href={erHref('flow', { incident: rec.id })}>
                ให้ Agent ประเมินใหม่
              </a>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 12 }}>
          {LEVELS.map((l) => (
            <div key={l.key} style={{ background: l.bg, color: l.color, borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{l.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{Number(rec.intake[l.key]) || 0}</div>
            </div>
          ))}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f2a5c', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>รวม</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{triageTotal(rec.intake)}</div>
          </div>
        </div>
      </div>

      {planned && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={cardTitle}>แผนเวชภัณฑ์และผลตรวจสต็อก{rec.edited ? ' · แก้โดยเจ้าหน้าที่แล้ว' : ''}</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th scope="col">รายการ</th>
                  <th scope="col" className="r">ต้องใช้</th>
                  <th scope="col" className="r">มีในสต็อก</th>
                  <th scope="col" className="r">ขาด (ยืม)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.name}>
                    <td style={{ fontWeight: 600, color: '#0f2a5c' }}>{l.name}</td>
                    <td className="r">{l.need} {l.unit}</td>
                    <td className="r">{l.have}</td>
                    <td className="r" style={{ fontWeight: 700, color: l.shortage ? '#dc2626' : '#15803d' }}>{l.shortage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rec.seed === 'live' ? (
        <div>
          <div style={cardTitle}>สถานะคำขอยืมเร่งด่วน</div>
          <BorrowPanel />
        </div>
      ) : rec.batches.length > 0 ? (
        rec.batches.map((b, i) => (
          <div key={i} className="card" style={{ padding: '14px 18px' }}>
            <div style={cardTitle}>
              คำขอยืมที่ส่ง {rec.batches.length > 1 ? `ครั้งที่ ${i + 1} ` : ''}· {b.at} น.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th scope="col">รายการ</th>
                    <th scope="col" className="r">จำนวน</th>
                    <th scope="col">ส่งถึง</th>
                    <th scope="col">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {b.requests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                        {r.item} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>{r.id}</span>
                      </td>
                      <td className="r">{r.qty} {r.unit}</td>
                      <td style={{ fontSize: 12 }}>{r.lenders.map((h) => h.name).join(', ')}</td>
                      <td>
                        <span className="badge st-pending">รอผู้ให้ยืมตอบ ({r.timeoutMin} นาที)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {b.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>หมายเหตุ: {b.note}</div>}
          </div>
        ))
      ) : (
        open && (
          <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>
            ยังไม่ได้ส่งคำขอยืม · กด “ทำต่อ” เพื่อไปขั้นถัดไปของ flow
          </div>
        )
      )}

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={cardTitle}>ประวัติการอัปเดต</div>
        {rec.updates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#94a3b8' }}>ยังไม่มีการอัปเดต</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: '22px' }}>
            {[...rec.updates].reverse().map((u, i) => (
              <li key={i}>
                <b style={{ fontFamily: 'Inter, monospace' }}>{u.at}</b> · {u.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && access.mayWrite && <IncidentUpdateForm key={`${rec.id}-${rec.updates.length}`} rec={rec} />}
    </div>
  );
}
