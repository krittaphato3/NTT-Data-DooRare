import { Icon } from '../../../components/common/icons';
import { ROLE_SHORT_TH, USER_STATUS_META } from '../data/users';
import type { HospitalUser } from '../data/users';

interface UserTableProps {
  rows: HospitalUser[];
  activeId: string | null;
  /** From `can(role, 'manageUsers')` — hides the write actions when the role may not manage accounts. */
  mayManage: boolean;
  /** True when this row is the hospital's last active admin (cannot be suspended/self-demoted). */
  isLastAdmin: (user: HospitalUser) => boolean;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onResend: (id: string) => void;
}

/** User list for UI (User management). Own-hospital accounts only. */
export function UserTable({ rows, activeId, mayManage, isLastAdmin, onOpen, onEdit, onToggleStatus, onResend }: UserTableProps) {
  return (
    <div className="scroll-x">
      <table className="tbl" aria-label="บัญชีผู้ใช้ในโรงพยาบาล">
        <thead>
          <tr>
            <th style={{ width: 132 }}>รหัส</th>
            <th style={{ width: 190 }}>ชื่อ-นามสกุล</th>
            <th style={{ width: 200 }}>อีเมล</th>
            <th style={{ width: 210 }}>บทบาท</th>
            <th style={{ width: 118 }}>สถานะ</th>
            <th style={{ width: 84 }}>MFA</th>
            <th style={{ width: 146 }}>เข้าใช้ล่าสุด</th>
            <th style={{ width: 118 }}>สร้างเมื่อ</th>
            <th style={{ width: 230 }}>
              <span className="srt">การดำเนินการ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const st = USER_STATUS_META[u.status];
            const lastAdmin = isLastAdmin(u);
            return (
              <tr key={u.id} className={activeId === u.id ? 'r-active' : ''}>
                <td>
                  <button
                    className="rowbtn code"
                    style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}
                    onClick={() => onOpen(u.id)}
                  >
                    {u.id}
                  </button>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{u.name}</span>
                </td>
                <td className="code" style={{ fontSize: 11.5 }}>
                  {u.email}
                </td>
                <td>
                  <span className="ha-stack">
                    {u.roles.map((r) => (
                      <span key={r} className="badge t-blue ha-badge">
                        {ROLE_SHORT_TH[r]}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <span className={`badge ${st.tone}`}>{st.labelTh}</span>
                </td>
                <td>
                  {u.mfa ? (
                    <span className="badge t-green ha-badge">
                      <Icon name="check" className="ic14" /> เปิด
                    </span>
                  ) : (
                    <span className="badge t-grey ha-badge">ปิด</span>
                  )}
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {u.lastLogin}
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {u.created}
                </td>
                <td>
                  <span className="ha-actions">
                    <button className="btn btn-s btn-sm" onClick={() => onOpen(u.id)}>
                      ดูรายละเอียด
                    </button>
                    {mayManage && (
                      <>
                        <button className="btn btn-s btn-sm" onClick={() => onEdit(u.id)}>
                          แก้ไขบทบาท
                        </button>
                        {u.status === 'INVITED' && (
                          <button className="btn btn-s btn-sm" onClick={() => onResend(u.id)}>
                            ส่งคำเชิญซ้ำ
                          </button>
                        )}
                        <button
                          className="btn btn-s btn-sm"
                          disabled={u.status === 'SUSPENDED' ? false : lastAdmin}
                          title={
                            lastAdmin && u.status !== 'SUSPENDED'
                              ? 'ต้องมีผู้ดูแลโรงพยาบาลที่ใช้งานได้อย่างน้อย 1 บัญชี'
                              : undefined
                          }
                          onClick={() => onToggleStatus(u.id)}
                        >
                          {u.status === 'SUSPENDED' ? 'เปิดใช้งาน' : 'ระงับ'}
                        </button>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
