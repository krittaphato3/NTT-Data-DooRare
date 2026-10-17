import { Icon } from '../../../components/common/icons';
import { requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { DOCUMENTS, DOC_TYPE_META } from '../../pharmacist/data/documents';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { getIncidentAccess } from '../data/access';

/** Incident documents only (summary of borrow/return and actual use). ER prints them; other documents are the pharmacist's / warehouse's. */
const INCIDENT_DOC_TYPES = ['INCIDENT_BORROW', 'INCIDENT_USAGE'];

export function ErDocumentsPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const { mayPrint } = getIncidentAccess(role);
  const rows = DOCUMENTS.filter((d) => INCIDENT_DOC_TYPES.includes(d.type));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="เอกสาร" />
      <ErPageHeading title="เอกสาร" titleEn="/ Documents" subtitle="UI-15 · เอกสารสรุปยอดยืม-คืนและการใช้เวชภัณฑ์ในเหตุการณ์ (ดู/พิมพ์)" />
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th scope="col">เลขที่</th>
                <th scope="col">ประเภท</th>
                <th scope="col">อ้างอิง</th>
                <th scope="col">ออกเมื่อ</th>
                <th scope="col">สถานะ</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'Inter, monospace', fontWeight: 600, color: '#0f2a5c' }}>
                    {d.id} <span style={{ color: '#94a3b8', fontWeight: 400 }}>v{d.version}</span>
                  </td>
                  <td>
                    <span className={`badge ${DOC_TYPE_META[d.type].tone}`}>{DOC_TYPE_META[d.type].label}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#334155' }}>{d.ref}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{d.at}</td>
                  <td>{d.status}</td>
                  <td className="r">
                    <button
                      type="button"
                      className="btn btn-s btn-sm"
                      disabled={!mayPrint}
                      title={mayPrint ? undefined : requiredRoleHint('printDocuments')}
                    >
                      <Icon name="printer" className="ic14" />
                      พิมพ์
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
          ใช้ประกอบการเบิก พ.ร.บ./UCEP ตามช่องทางปกติของโรงพยาบาล - ระบบไม่ขึ้นเบิกให้
        </div>
      </div>
    </div>
  );
}
