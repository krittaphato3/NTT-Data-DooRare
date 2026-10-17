import { Icon } from '../../../components/common/icons';
import type { IncidentAccess } from '../data/access';
import type { PresetKitRow } from '../data/incident';

interface PresetKitTableProps {
  kits: PresetKitRow[];
  access: IncidentAccess;
  /** Stepper on "จัดจากของแยก": delta is -1 / +1. */
  onAssembleChange: (index: number, delta: number) => void;
}

/** Preset kits per patient: estimate, critical minimum, stock, assemble-from-parts stepper, borrow-whole-kit. */
export function PresetKitTable({ kits, access, onAssembleChange }: PresetKitTableProps) {
  const { mayWrite, writeHint } = access;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>
          ชุดสำเร็จรูป (Preset Kit ต่อผู้ป่วย){' '}
          <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>F-27</span>
        </div>
        <button
          className="link"
          style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ดูรายการหลักกระจายสูตร
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th scope="col">ชุด</th>
              <th scope="col" className="r">ประมาณการ</th>
              <th scope="col" className="r">ขั้นวิกฤต</th>
              <th scope="col" className="r">ส่วนเผื่อ</th>
              <th scope="col" className="r">ชุดพร้อมใช้</th>
              <th scope="col" style={{ textAlign: 'center' }}>จัดจากของแยก</th>
              <th scope="col" className="r">ยืมทั้งชุด</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((kit, idx) => (
              <tr key={kit.name}>
                <td style={{ minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{kit.name}</span>
                    <span className={`badge ${kit.typeCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>
                      {kit.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{kit.ratio}</div>
                  {kit.warningNote && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '4px 8px',
                        background: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: 4,
                        color: '#b45309',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="tri" className="ic12" />
                      <span>{kit.warningNote}</span>
                    </div>
                  )}
                </td>
                <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                  {kit.estimated}
                </td>
                <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                  {kit.critical}
                </td>
                <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                  {kit.reserve}
                </td>
                <td className="r" style={{ color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ fontWeight: 600 }}>{kit.readyInStock}</span>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>มี {kit.readyInStock}</div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-s btn-sm"
                      style={{ width: 22, height: 22, padding: 0, minWidth: 22 }}
                      disabled={!mayWrite}
                      title={mayWrite ? undefined : writeHint}
                      onClick={() => onAssembleChange(idx, -1)}
                    >
                      -
                    </button>
                    <span
                      style={{
                        minWidth: 24,
                        textAlign: 'center',
                        fontWeight: 700,
                        color: '#0f2a5c',
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      {kit.assembleFromParts}
                    </span>
                    <button
                      type="button"
                      className="btn btn-s btn-sm"
                      style={{ width: 22, height: 22, padding: 0, minWidth: 22 }}
                      disabled={!mayWrite}
                      title={mayWrite ? undefined : writeHint}
                      onClick={() => onAssembleChange(idx, 1)}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    จัดได้สูงสุด {kit.maxAssemble}
                  </div>
                </td>
                <td className="r">
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: kit.borrowFullKit > 0 ? '#dc2626' : '#15803d',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {kit.borrowFullKit}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: '16px' }}>
        ลำดับ: ใช้ชุดพร้อมใช้ → จัดเพิ่มจากของแยก (ต้องครบทุกชิ้น) → ยืมทั้งชุด - ขาดไป รพ.ใกล้เคียง · ลดจำนวนจัดเฉพาะ = ยืมเพิ่มอัตโนมัติ · ชุดวิกฤตได้ของแยกก่อน
      </div>
    </div>
  );
}
