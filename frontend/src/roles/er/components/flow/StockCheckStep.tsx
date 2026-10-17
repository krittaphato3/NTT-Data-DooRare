import type { StockLine } from '../../data/stockCheck';

interface StockCheckStepProps {
  lines: StockLine[];
  onBack: () => void;
  onNext: () => void;
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card" style={{ padding: '10px 16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone, fontFamily: 'Inter, sans-serif' }}>{value}</div>
    </div>
  );
}

/** Step 3: the confirmed plan checked against stock. Items that are short go on to the borrow request. */
export function StockCheckStep({ lines, onBack, onNext }: StockCheckStepProps) {
  const short = lines.filter((l) => l.shortage > 0);
  const okCount = lines.length - short.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Tile label="รายการทั้งหมด" value={lines.length} tone="#0f2a5c" />
        <Tile label="สต็อกพอ" value={okCount} tone="#15803d" />
        <Tile label="ขาด ต้องยืม" value={short.length} tone={short.length ? '#dc2626' : '#15803d'} />
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>ผลตรวจสต็อก</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th scope="col">รายการ</th>
                <th scope="col" className="r">ต้องใช้</th>
                <th scope="col" className="r">มีในสต็อก</th>
                <th scope="col" className="r">จัดจากของแยก</th>
                <th scope="col" className="r">ขาด</th>
                <th scope="col">ผล</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.name}>
                  <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                    {l.name} <span className={`badge ${l.typeCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>{l.type}</span>
                  </td>
                  <td className="r">{l.need} <span style={{ color: '#94a3b8', fontSize: 11 }}>{l.unit}</span></td>
                  <td className="r">{l.have}</td>
                  <td className="r">{l.kind === 'kit' ? l.assemble : '—'}</td>
                  <td className="r" style={{ fontWeight: 700, color: l.shortage ? '#dc2626' : '#15803d' }}>{l.shortage}</td>
                  <td>
                    {l.shortage > 0 ? (
                      <span className="badge st-rejected">ขาด · ต้องยืม</span>
                    ) : l.kind === 'kit' && l.assemble > 0 ? (
                      <span className="badge st-transit">พอ · ต้องจัดชุด</span>
                    ) : (
                      <span className="badge st-approved">พอ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: '16px' }}>
          ลำดับ: ใช้ชุดพร้อมใช้ → จัดเพิ่มจากของแยก (ต้องครบทุกชิ้น) → ที่ยังขาดจึงขอยืมจากโรงพยาบาลใกล้เคียง
        </div>
      </div>

      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: short.length ? '#92400e' : '#166534' }}>
          {short.length ? `ขาด ${short.length} รายการ · ให้ Agent เลือกโรงพยาบาลผู้ให้ยืมและจัดคำขอให้ตรวจก่อนส่ง` : 'สต็อกพอทุกรายการ · ไม่ต้องยืม ไปจัดชุดได้เลย'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-s" onClick={onBack}>
            ← กลับไปแก้แผน
          </button>
          {short.length > 0 ? (
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} onClick={onNext}>
              ดูคำขอยืมที่ Agent จัดให้ →
            </button>
          ) : (
            <a className="btn btn-p" style={{ fontWeight: 600 }} href="?role=er&page=track">
              ไปจัดชุด →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
