import { EXTRA_DRUGS } from '../data/incident';

/** Drugs and supplies outside the kits (incident_extra_rule). */
export function ExtraDrugsTable() {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
        ยาและเวชภัณฑ์นอกชุด <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>incident_extra_rule</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th scope="col">รายการ</th>
              <th scope="col" className="r">ประมาณการ</th>
              <th scope="col" className="r">ขั้นวิกฤต</th>
              <th scope="col" className="r">คงเหลือ</th>
              <th scope="col" className="r">ยืมเพิ่ม</th>
            </tr>
          </thead>
          <tbody>
            {EXTRA_DRUGS.map((drug) => (
              <tr key={drug.name}>
                <td style={{ minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{drug.name}</span>
                    <span className={`badge ${drug.typeCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>
                      {drug.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{drug.rule}</div>
                </td>
                <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                  {drug.estimated}
                </td>
                <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                  {drug.critical}
                </td>
                <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                  {drug.stock}
                </td>
                <td className="r">
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: drug.borrowHighlight ? '#dc2626' : '#15803d',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {drug.borrowQty}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
