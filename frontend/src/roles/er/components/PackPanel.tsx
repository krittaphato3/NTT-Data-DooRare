import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { IncidentAccess } from '../data/access';
import { KIT_ASSEMBLIES } from '../data/incident';
import { KitStockCard } from './KitStockCard';

/** UI-13 kit assembly. Owns the pick-list ticks and the "ยืนยันจัดชุดเสร็จ" state. */
export function PackPanel({ access }: { access: IncidentAccess }) {
  const { mayWrite, writeHint } = access;
  const [assemblyList, setAssemblyList] = useState(KIT_ASSEMBLIES);

  const togglePartChecked = (kitId: string, partIndex: number) => {
    setAssemblyList((prev) =>
      prev.map((kit) => {
        if (kit.id !== kitId) return kit;
        const newParts = kit.parts.map((p, pIdx) =>
          pIdx === partIndex ? { ...p, checked: !p.checked } : p
        );
        return { ...kit, parts: newParts };
      })
    );
  };

  const confirmKitAssembly = (kitId: string) => {
    setAssemblyList((prev) =>
      prev.map((kit) => {
        if (kit.id !== kitId) return kit;
        return {
          ...kit,
          status: 'done',
          statusLabel: 'จัดเสร็จ · ยืนยันแล้ว',
          statusCls: 'st-approved',
          canConfirm: false,
          footerText: `ตัดของแยกตามสูตรแล้ว · ชุดพร้อมใช้ +${kit.qty}`,
        };
      })
    );
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Left column: kit assemblies */}
      <div style={{ flex: '1 1 600px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {assemblyList.map((kit) => (
          <div key={kit.id} className="card" style={{ padding: '14px 18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                  จัด {kit.name} × {kit.qty} ชุด
                </span>
                <span className={`badge ${kit.statusCls}`}>
                  {kit.status === 'done' && <Icon name="checkc" className="ic12" />}
                  {kit.status === 'assembling' && <Icon name="hourglass" className="ic12" />}
                  {kit.statusLabel}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{kit.meta}</div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 40 }}>เลือก</th>
                    <th scope="col">ส่วนประกอบ</th>
                    <th scope="col" className="r">ต่อชุด</th>
                    <th scope="col" className="r">ต้องหยิบ</th>
                    <th scope="col" className="r">ของแยกคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.parts.map((part, pIdx) => (
                    <tr key={part.name}>
                      <td>
                        <input
                          type="checkbox"
                          checked={part.checked}
                          onChange={() => togglePartChecked(kit.id, pIdx)}
                          style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                        />
                      </td>
                      <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 13 }}>{part.name}</td>
                      <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                        {part.perKit}
                      </td>
                      <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                        {part.needed}
                      </td>
                      <td
                        className="r"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          color: part.stock === 0 ? '#dc2626' : '#64748b',
                          fontWeight: part.stock === 0 ? 700 : 400,
                        }}
                      >
                        {part.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {kit.canConfirm && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-p"
                  style={{ fontWeight: 600 }}
                  disabled={!mayWrite}
                  title={mayWrite ? undefined : writeHint}
                  onClick={() => confirmKitAssembly(kit.id)}
                >
                  ยืนยันจัดชุดเสร็จ
                </button>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  ระบบตัดของแยกตามสูตรและเพิ่มชุดพร้อมใช้ {kit.qty} ชุด (KIT_PACK)
                </span>
              </div>
            )}

            {kit.footerText && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
                {kit.footerText}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right column: kit stock */}
      <div style={{ flex: '1 1 280px', minWidth: 260 }}>
        <KitStockCard />
      </div>
    </div>
  );
}
