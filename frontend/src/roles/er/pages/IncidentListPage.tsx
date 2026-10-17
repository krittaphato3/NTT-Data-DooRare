import { IncidentFrame } from '../components/IncidentFrame';
import { IncidentSummaryCard } from '../components/IncidentSummaryCard';
import type { RoleCode } from '../../../lib/rbac';
import { INCIDENT_LIST } from '../data/incident';
import { erHref } from '../data/navigation';
import type { ErPage } from '../data/navigation';

const STEPS: { page: ErPage; label: string; hint: string }[] = [
  { page: 'plan', label: 'แผนเวชภัณฑ์', hint: 'ตรวจ/แก้แผนและอนุมัติ' },
  { page: 'borrow', label: 'ยืมฉุกเฉิน', hint: 'ติดตามคำขอยืมเร่งด่วน' },
  { page: 'pack', label: 'จัดชุด', hint: 'จัดชุดจากของแยก' },
  { page: 'summary', label: 'สรุปและปิดเหตุการณ์', hint: 'ใช้จริง · คืนของ · ปิดเหตุ' },
];

/** ER page: all incidents, the active one and its workflow steps. */
export function IncidentListPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  return (
    <IncidentFrame role={role} title="รายการเหตุการณ์" titleEn="/ Incidents" breadcrumb="รายการเหตุการณ์" showContext={false}>
      {({ access, openIntake }) => (
        <>
          <IncidentSummaryCard mayWrite={access.mayWrite} onEditTriage={openIntake} />

          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>เหตุการณ์ทั้งหมด</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th scope="col">เลขที่</th>
                    <th scope="col">เหตุการณ์</th>
                    <th scope="col">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {INCIDENT_LIST.map((inc) => (
                    <tr key={inc.id} style={inc.active ? { background: '#eff6ff' } : undefined}>
                      <td style={{ fontFamily: 'Inter, monospace', fontWeight: 600, color: '#0f2a5c' }}>{inc.id}</td>
                      <td>{inc.label}</td>
                      <td>
                        <span className={`badge ${inc.statusCls}`}>{inc.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {STEPS.map((s) => (
              <a key={s.page} href={erHref(s.page)} className="card" style={{ padding: '12px 16px', textDecoration: 'none' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{s.hint}</div>
              </a>
            ))}
          </div>
        </>
      )}
    </IncidentFrame>
  );
}
