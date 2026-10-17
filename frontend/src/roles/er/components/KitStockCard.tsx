import { KIT_STOCK_OVERVIEW } from '../data/incident';

/** Ready-to-use kit stock before the incident vs now (kit_stock). Read-only. */
export function KitStockCard() {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
        ชุดพร้อมใช้ในคลัง <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>kit_stock</span>
      </div>
      <table className="qt">
        <thead>
          <tr>
            <th scope="col">ชุด</th>
            <th scope="col" className="r">ก่อนเหตุ</th>
            <th scope="col" className="r">ตอนนี้</th>
          </tr>
        </thead>
        <tbody>
          {KIT_STOCK_OVERVIEW.map((item) => (
            <tr key={item.name}>
              <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 12.5 }}>{item.name}</td>
              <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                {item.before}
              </td>
              <td className="r" style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                {item.now}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 8, fontSize: 10.5, color: '#94a3b8', lineHeight: '15px' }}>
        สต็อกเปลี่ยนเมื่อยืนยันจัดชุดเท่านั้น (ASM-13) · ถ้าของแยกมีไม่ครบ ระบบไม่ให้ยืนยัน
      </div>
    </div>
  );
}
