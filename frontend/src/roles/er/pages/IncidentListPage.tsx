import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { IncidentDetail } from '../components/IncidentDetail';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { getIncidentAccess } from '../data/access';
import { statusMeta, useIncidents } from '../data/incidentStore';
import { triageTotal } from '../data/intake';
import { erHref, readParam } from '../data/navigation';

/** ER page: every incident the ER has recorded, with the selected one opened below (status, borrow requests, updates). */
export function IncidentListPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const incidents = useIncidents();
  const selectedId = readParam('incident');
  const selected = incidents.find((r) => r.id === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="รายการเหตุการณ์" />
      <ErPageHeading
        title="รายการเหตุการณ์"
        titleEn="/ Incidents"
        subtitle="ทุกเหตุที่ ER บันทึกไว้ · เลือกเหตุเพื่อดูสถานะการยืม รายละเอียด และอัปเดตจำนวนผู้ป่วย"
        actions={
          access.mayWrite && (
            <a className="btn btn-sm" style={{ background: '#b91c1c', color: '#ffffff', border: 'none', fontWeight: 600 }} href={erHref('flow')}>
              <Icon name="siren" className="ic14" />
              + แจ้งเหตุใหม่
            </a>
          )
        }
      />

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">เลขที่</th>
                <th scope="col">เหตุการณ์</th>
                <th scope="col" className="r">ผู้ป่วย</th>
                <th scope="col">แจ้งเมื่อ</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((r) => {
                const meta = statusMeta(r);
                const on = r.id === selected?.id;
                return (
                  <tr key={r.id} style={on ? { background: '#eff6ff' } : undefined}>
                    <td>
                      <a className="link" href={erHref('incidents', { incident: r.id })} style={{ fontFamily: 'Inter, monospace', fontWeight: 600 }}>
                        {r.id}
                      </a>
                    </td>
                    <td>
                      {r.intake.category} · {r.intake.location}
                    </td>
                    <td className="r">{triageTotal(r.intake)}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{r.createdAt}</td>
                    <td>
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <IncidentDetail rec={selected} access={access} />
      ) : (
        <div style={{ fontSize: 12.5, color: '#94a3b8' }}>เลือกเลขที่เหตุการณ์ด้านบนเพื่อดูรายละเอียด</div>
      )}
    </div>
  );
}
