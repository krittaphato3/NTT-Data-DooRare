import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { requiredRoleHint } from '../../../lib/rbac';
import type { IncidentAccess } from '../data/access';
import { INCIDENT_RETURNS } from '../data/incident';

/** Post-incident summary: actual use, returns per lender, request to close, summary documents. */
export function SummaryPanel({ access }: { access: IncidentAccess }) {
  const { mayWrite, writeHint, mayPrint } = access;
  const [returnsList, setReturnsList] = useState(INCIDENT_RETURNS);
  const [isClosed, setIsClosed] = useState(false);

  const updateActualUsed = (index: number, val: string) => {
    setReturnsList((prev) =>
      prev.map((row, i) => (i === index ? { ...row, actualUsed: val } : row))
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Blue Info Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="link" className="ic16" style={{ color: '#2563eb', flex: 'none' }} />
          <div style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: '18px' }}>
            ร่างสรุปจากข้อมูลตอนนี้ · บันทึกจำนวนที่ใช้จริงหลังเหตุการณ์สงบ แล้ว &ldquo;ขอปิดเหตุการณ์&rdquo; - ER และเภสัชกรอนุมัติร่วมกัน ระบบจึงสร้างภาระการคืนและเอกสาร
          </div>
        </div>
        <button
          type="button"
          className="btn btn-p"
          style={{ fontWeight: 600, flex: 'none' }}
          disabled={!mayWrite}
          title={mayWrite ? undefined : writeHint}
          onClick={() => setIsClosed(true)}
        >
          {isClosed ? 'ขอปิดเหตุการณ์แล้ว' : 'ขอปิดเหตุการณ์'}
        </button>
      </div>

      {/* Table: Borrow / Return per hospital */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 12 }}>
          ยืม-คืนระหว่างโรงพยาบาล
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th scope="col">ผู้ให้ยืม</th>
                <th scope="col">รายการ</th>
                <th scope="col">ประเภท</th>
                <th scope="col" className="r">ได้รับ</th>
                <th scope="col" style={{ width: 90, textAlign: 'center' }}>ใช้จริง</th>
                <th scope="col">การคืน</th>
              </tr>
            </thead>
            <tbody>
              {returnsList.map((row, idx) => (
                <tr key={`${row.lender}-${row.item}`}>
                  <td style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{row.lender}</td>
                  <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 13 }}>{row.item}</td>
                  <td>
                    <span className="badge t-grey" style={{ height: 18, fontSize: 10.5 }}>
                      {row.category}
                    </span>
                  </td>
                  <td className="r" style={{ color: '#64748b', fontSize: 12.5 }}>
                    {row.received}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="text"
                      value={row.actualUsed}
                      disabled={!mayWrite}
                      onChange={(e) => updateActualUsed(idx, e.target.value)}
                      style={{
                        width: 50,
                        height: 28,
                        textAlign: 'center',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0f2a5c',
                        fontFamily: 'inherit',
                      }}
                    />
                  </td>
                  <td style={{ fontSize: 12, color: '#334155' }}>{row.returnPolicy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Buttons */}
        <div
          style={{
            marginTop: 16,
            borderTop: '1px solid #e2e8f0',
            paddingTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-s btn-sm"
              disabled={!mayPrint}
              title={mayPrint ? undefined : requiredRoleHint('printDocuments')}
            >
              <Icon name="printer" className="ic14" />
              สรุปยืม-คืน INCIDENT_REPORT
            </button>
            <button
              type="button"
              className="btn btn-s btn-sm"
              disabled={!mayPrint}
              title={mayPrint ? undefined : requiredRoleHint('printDocuments')}
            >
              <Icon name="printer" className="ic14" />
              สรุปการใช้เวชภัณฑ์ UCEP_REPORT
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            ใช้ประกอบการเบิก พ.ร.บ./UCEP ตามช่องทางปกติของโรงพยาบาล - ระบบไม่ขึ้นเบิกให้
          </div>
        </div>
      </div>
    </div>
  );
}
