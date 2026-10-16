import { useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { SESSIONS } from '../../../data/session';
import type { RoleCode } from '../../../lib/rbac';
import { can, HOSPITAL_ADMIN_ROLE } from '../../../lib/rbac';
import { Modal } from '../components/Modal';
import { ReasonDialog } from '../components/ReasonDialog';
import { UserFormModal } from '../components/UserFormModal';
import type { UserFormValues } from '../components/UserFormModal';
import { UserTable } from '../components/UserTable';
import { HOSPITAL_USERS, ROLES_IN_USE, ROLE_SHORT_TH, USER_STATUS_META, USER_STATUS_ORDER } from '../data/users';
import type { HospitalUser, UserStatus } from '../data/users';
import '../admin.css';

type ConfirmKind = 'suspend' | 'activate' | 'resend';

interface ConfirmState {
  kind: ConfirmKind;
  id: string;
}

/**
 * User management (Hospital Admin, own hospital).
 * Endpoints it will call when wired: API-AD-006 `GET /users`, API-AD-007 `POST /users`.
 *
 * Access: read-write within the hospital only. The role picker never offers SYSTEM_ADMIN or
 * REGION_ADMIN (spec §5.2 scope), and the last active hospital admin cannot be suspended or
 * demoted (safeguard from rbac.md §5.5, kept as it does not conflict with the spec).
 */
export function UserManagementPage() {
  const [users, setUsers] = useState<HospitalUser[]>(HOSPITAL_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleCode | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Permission decisions come from lib/rbac.ts; this page only applies them.
  const mayManage = can(HOSPITAL_ADMIN_ROLE, 'manageUsers');

  const activeAdmins = users.filter((u) => u.status === 'ACTIVE' && u.roles.includes(HOSPITAL_ADMIN_ROLE));
  const isLastAdmin = (u: HospitalUser) =>
    u.status === 'ACTIVE' && u.roles.includes(HOSPITAL_ADMIN_ROLE) && activeAdmins.length <= 1;

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && !u.roles.includes(roleFilter)) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (needle && !`${u.name} ${u.email} ${u.id}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  const tiles = [
    { label: 'บัญชีที่ใช้งานอยู่', value: users.filter((u) => u.status === 'ACTIVE').length, sub: `จากทั้งหมด ${users.length} บัญชี` },
    { label: 'รอตอบรับคำเชิญ', value: users.filter((u) => u.status === 'INVITED').length, sub: 'ส่งคำเชิญซ้ำได้จากตาราง' },
    { label: 'บทบาทที่ใช้งาน', value: ROLES_IN_USE.length, sub: 'ภายในโรงพยาบาลสมุทรปราการ' },
    { label: 'MFA เปิดใช้งาน', value: users.filter((u) => u.mfa).length, sub: 'ผู้ดูแลโรงพยาบาลต้องเปิด MFA' },
  ];

  const detail = detailId ? (users.find((u) => u.id === detailId) ?? null) : null;
  const editTarget = editId ? (users.find((u) => u.id === editId) ?? null) : null;

  const refresh = () => {
    setError('');
    setLoading(true);
    window.setTimeout(() => setLoading(false), 600);
  };

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleCreate = (values: UserFormValues) => {
    if (users.some((u) => u.email.toLowerCase() === values.email.toLowerCase())) {
      setError(`อีเมล ${values.email} มีในระบบแล้ว`);
      setNotice('');
      return;
    }
    const nextId = `USR-${String(100101 + users.length)}`;
    setUsers((prev) => [
      {
        id: nextId,
        name: values.name,
        email: values.email,
        roles: values.roles,
        status: 'INVITED',
        mfa: values.mfa,
        lastLogin: '—',
        created: '13 ต.ค. 69',
      },
      ...prev,
    ]);
    setFormMode(null);
    setError('');
    setNotice(`ส่งคำเชิญให้ ${values.email} แล้ว (ตัวอย่าง) · เหตุผลถูกบันทึกใน audit log`);
  };

  const handleEdit = (values: UserFormValues) => {
    if (!editTarget) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editTarget.id
          ? { ...u, name: values.name, email: values.email, roles: values.roles, mfa: values.mfa }
          : u,
      ),
    );
    setFormMode(null);
    setEditId(null);
    setError('');
    setNotice(`บันทึกการแก้ไข ${values.name} แล้ว (ตัวอย่าง) · เหตุผลถูกบันทึกใน audit log`);
  };

  const confirmCopy: Record<ConfirmKind, { title: string; detail: string; label: string }> = {
    suspend: {
      title: 'ระงับการใช้งานบัญชี',
      detail: `บัญชี ${confirm ? (users.find((u) => u.id === confirm.id)?.name ?? '') : ''} จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง`,
      label: 'ระงับการใช้งาน',
    },
    activate: {
      title: 'เปิดใช้งานบัญชี',
      detail: `บัญชี ${confirm ? (users.find((u) => u.id === confirm.id)?.name ?? '') : ''} จะเข้าสู่ระบบได้ตามบทบาทที่ถืออยู่`,
      label: 'เปิดใช้งาน',
    },
    resend: {
      title: 'ส่งคำเชิญซ้ำ',
      detail: `ระบบจะส่งอีเมลคำเชิญใหม่ให้ ${confirm ? (users.find((u) => u.id === confirm.id)?.email ?? '') : ''}`,
      label: 'ส่งคำเชิญซ้ำ',
    },
  };

  const runConfirm = (reason: string) => {
    if (!confirm) return;
    const target = users.find((u) => u.id === confirm.id);
    if (!target) return;
    if (confirm.kind === 'resend') {
      setNotice(`ส่งคำเชิญซ้ำให้ ${target.email} แล้ว (ตัวอย่าง) · เหตุผล: ${reason}`);
    } else {
      const nextStatus: UserStatus = confirm.kind === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, status: nextStatus } : u)));
      setNotice(
        `${confirm.kind === 'suspend' ? 'ระงับ' : 'เปิดใช้งาน'} ${target.name} แล้ว (ตัวอย่าง) · เหตุผลถูกบันทึกใน audit log`,
      );
    }
    setConfirm(null);
    setError('');
  };

  const busy = loading;

  return (
    <>
      <section className="pagehead" data-part="page-header">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href="/" className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">จัดการผู้ใช้</span>
          </nav>
          <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: '38px', fontWeight: 600, color: '#0F2A5C' }}>
            จัดการผู้ใช้ <span className="en">User management</span>
          </h1>
          <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
            โรงพยาบาลสมุทรปราการ · เห็นเฉพาะข้อมูลโรงพยาบาลตนเอง
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={refresh} disabled={busy}>
            <Icon name="refresh" />
            รีเฟรช
          </button>
          {mayManage && (
            <button
              className="btn btn-p"
              onClick={() => {
                setEditId(null);
                setFormMode('create');
              }}
            >
              <Icon name="plus" />
              เชิญผู้ใช้ใหม่
            </button>
          )}
        </div>
      </section>

      <section className="kpi-row" data-part="kpi-row">
        {tiles.map((t) => (
          <div key={t.label} className="card kpi-card">
            <div className="ha-label">{t.label}</div>
            <div className="kpi-num num">{t.value}</div>
            <div className="ha-kpi-sub">{t.sub}</div>
          </div>
        ))}
      </section>

      {notice && (
        <div className="ha-banner ha-banner-ok" role="status" data-part="user-notice">
          <Icon name="checkc" className="ic14" style={{ marginTop: 2 }} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="ha-banner ha-banner-err" role="alert" data-part="user-error">
          <Icon name="alertc" className="ic14" style={{ marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      <section className="card" data-part="users-card" style={{ padding: '16px 20px 8px' }}>
        <div className="sa-toolbar" style={{ marginTop: 0 }} data-part="user-filters">
          <label className="sa-search">
            <Icon name="search" className="ic14" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ชื่อ / อีเมล / รหัสบัญชี"
              aria-label="ค้นหาผู้ใช้"
            />
          </label>

          <label className="ha-field">
            <span className="ha-label">บทบาท</span>
            <select
              className="sel"
              value={roleFilter}
              aria-label="กรองตามบทบาท"
              onChange={(e) => setRoleFilter(e.target.value as RoleCode | 'ALL')}
            >
              <option value="ALL">ทุกบทบาท</option>
              {ROLES_IN_USE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_SHORT_TH[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="ha-field">
            <span className="ha-label">สถานะ</span>
            <select
              className="sel"
              value={statusFilter}
              aria-label="กรองตามสถานะ"
              onChange={(e) => setStatusFilter(e.target.value as UserStatus | 'ALL')}
            >
              <option value="ALL">ทุกสถานะ</option>
              {USER_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {USER_STATUS_META[s].labelTh}
                </option>
              ))}
            </select>
          </label>

          <span style={{ flex: '1 1 0' }} />
          <button className="btn btn-g btn-sm" onClick={resetFilters}>
            <Icon name="x" className="ic14" />
            ล้างตัวกรอง
          </button>
        </div>

        {busy ? (
          <div aria-busy="true" aria-label="กำลังโหลดรายชื่อผู้ใช้" style={{ padding: '12px 0' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="ha-skel-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="ha-state">
            <Icon name="search" className="ic20" />
            <div className="ha-state-title">ไม่พบบัญชีที่ตรงกับเงื่อนไข</div>
            <div className="ha-state-text">ลองลดเงื่อนไขการค้นหา หรือล้างตัวกรองเพื่อดูบัญชีทั้งหมดของโรงพยาบาล</div>
            <button className="btn btn-s btn-sm" onClick={resetFilters}>
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <UserTable
            rows={rows}
            activeId={detailId}
            mayManage={mayManage}
            isLastAdmin={isLastAdmin}
            onOpen={setDetailId}
            onEdit={(id) => {
              setEditId(id);
              setFormMode('edit');
            }}
            onToggleStatus={(id) => {
              const u = users.find((x) => x.id === id);
              if (!u) return;
              setConfirm({ kind: u.status === 'SUSPENDED' ? 'activate' : 'suspend', id });
            }}
            onResend={(id) => setConfirm({ kind: 'resend', id })}
          />
        )}
      </section>

      {formMode === 'create' && (
        <UserFormModal mode="create" onClose={() => setFormMode(null)} onSubmit={handleCreate} />
      )}

      {formMode === 'edit' && editTarget && (
        <UserFormModal
          mode="edit"
          user={editTarget}
          lockedRole={isLastAdmin(editTarget) ? HOSPITAL_ADMIN_ROLE : undefined}
          onClose={() => {
            setFormMode(null);
            setEditId(null);
          }}
          onSubmit={handleEdit}
        />
      )}

      {confirm && (
        <ReasonDialog
          title={confirmCopy[confirm.kind].title}
          detail={confirmCopy[confirm.kind].detail}
          confirmLabel={confirmCopy[confirm.kind].label}
          onClose={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}

      {detail && (
        <Modal label={`รายละเอียดผู้ใช้ ${detail.name}`} onClose={() => setDetailId(null)}>
          <h2 className="sec-h">{detail.name}</h2>
          <div className="sub">
            <span className="code">{detail.id}</span> · {USER_STATUS_META[detail.status].labelTh}
          </div>

          <dl className="dlr" style={{ marginTop: 12 }}>
            <dt>อีเมล</dt>
            <dd className="code">{detail.email}</dd>
            <dt>บทบาท</dt>
            <dd>{detail.roles.map((r) => ROLE_SHORT_TH[r]).join(' · ')}</dd>
            <dt>ขอบเขต</dt>
            <dd>โรงพยาบาลสมุทรปราการ (HOSPITAL)</dd>
            <dt>MFA</dt>
            <dd>{detail.mfa ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</dd>
            <dt>เข้าใช้ล่าสุด</dt>
            <dd className="num">{detail.lastLogin}</dd>
            <dt>สร้างเมื่อ</dt>
            <dd className="num">{detail.created}</dd>
          </dl>

          <h3 className="tr-h3" style={{ marginTop: 16 }}>
            เซสชันล่าสุด
          </h3>
          <ul className="ha-hist">
            {SESSIONS.map((s) => (
              <li key={`${s.date}-${s.time}`}>
                <span className="num" style={{ minWidth: 92, color: '#475569' }}>
                  {s.date} {s.time}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: '#0F2A5C' }}>
                  {s.browser} · {s.os}
                  <span className="code" style={{ display: 'block', fontSize: 11 }}>
                    {s.ip} · {s.loc}
                  </span>
                </span>
                <span className={`badge ${s.stCls === 'st-approved' ? 't-green' : 't-red'} ha-badge`}>{s.st}</span>
              </li>
            ))}
          </ul>

          <div className="ha-dialog-foot">
            <button className="btn btn-s" onClick={() => setDetailId(null)}>
              ปิด
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
