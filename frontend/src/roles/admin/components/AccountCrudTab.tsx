import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { AdminUserRole, HospitalSummary, UserAccount } from '../data/adminData';

interface AccountCrudTabProps {
  users: UserAccount[];
  hospitals: HospitalSummary[];
  onAddUser: (user: Omit<UserAccount, 'id' | 'createdAt' | 'loginCount' | 'lastLogin' | 'isOnline'>) => void;
  onUpdateUser: (id: string, updates: Partial<UserAccount>) => void;
  onDeleteUser: (id: string) => void;
  externalQuery?: string;
}

export function AccountCrudTab({
  users,
  hospitals,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  externalQuery = '',
}: AccountCrudTabProps) {
  const [search, setSearch] = useState(externalQuery);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [hospitalFilter, setHospitalFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<AdminUserRole>('PHARMACIST');
  const [formHospitalId, setFormHospitalId] = useState(hospitals[0]?.id || '');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [formError, setFormError] = useState('');

  // Delete confirm modal state
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('PHARMACIST');
    setFormHospitalId(hospitals[0]?.id || '');
    setFormStatus('ACTIVE');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserAccount) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPhone(user.phone);
    setFormRole(user.role);
    setFormHospitalId(user.hospitalId);
    setFormStatus(user.status);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    const hosp = hospitals.find((h) => h.id === formHospitalId);
    const hospitalName = hosp ? hosp.name : 'ศูนย์ประสานยา เขตสุขภาพที่ 6';

    if (editingUser) {
      onUpdateUser(editingUser.id, {
        name: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        role: formRole,
        hospitalId: formHospitalId,
        hospitalName,
        status: formStatus,
      });
    } else {
      onAddUser({
        name: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        role: formRole,
        hospitalId: formHospitalId,
        hospitalName,
        status: formStatus,
      });
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (deletingUser) {
      onDeleteUser(deletingUser.id);
      setDeletingUser(null);
    }
  };

  const effectiveSearch = (externalQuery || search).toLowerCase();

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      !effectiveSearch ||
      u.name.toLowerCase().includes(effectiveSearch) ||
      u.email.toLowerCase().includes(effectiveSearch) ||
      u.phone.includes(effectiveSearch) ||
      u.hospitalName.toLowerCase().includes(effectiveSearch);
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchHosp = hospitalFilter === 'ALL' || u.hospitalId === hospitalFilter;
    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchSearch && matchRole && matchHosp && matchStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TOOLBAR & ACTIONS */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search-input">
            <Icon name="search" style={{ width: 16, height: 16, color: '#94A3B8' }} />
            <input
              type="search"
              placeholder="ค้นหาชื่อ, อีเมล, เบอร์โทร, โรงพยาบาล..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="กรองตามบทบาท"
          >
            <option value="ALL">ทุกบทบาท (Roles)</option>
            <option value="SYSTEM_ADMIN">ผู้ดูแลระบบสูงสุด (SYSTEM_ADMIN)</option>
            <option value="HOSPITAL_ADMIN">ผู้ดูแลประจำโรงพยาบาล (HOSPITAL_ADMIN)</option>
            <option value="PHARMACIST">เภสัชกร (PHARMACIST)</option>
            <option value="WAREHOUSE_OFFICER">เจ้าหน้าที่คลังยา (WAREHOUSE_OFFICER)</option>
            <option value="DRIVER">พนักงานขับรถส่งยา (DRIVER)</option>
            <option value="AUDITOR">ผู้ตรวจสอบ (AUDITOR)</option>
          </select>

          <select
            className="admin-select"
            value={hospitalFilter}
            onChange={(e) => setHospitalFilter(e.target.value)}
            aria-label="กรองตามโรงพยาบาล"
          >
            <option value="ALL">ทุกโรงพยาบาล</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.shortName}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="กรองตามสถานะบัญชี"
          >
            <option value="ALL">ทุกสถานะบัญชี</option>
            <option value="ACTIVE">เปิดใช้งาน (ACTIVE)</option>
            <option value="INACTIVE">ปิดใช้งาน (INACTIVE)</option>
            <option value="SUSPENDED">ระงับชั่วคราว (SUSPENDED)</option>
          </select>

          {(search || roleFilter !== 'ALL' || hospitalFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ height: 36, padding: '0 10px', fontSize: 12 }}
              onClick={() => {
                setSearch('');
                setRoleFilter('ALL');
                setHospitalFilter('ALL');
                setStatusFilter('ALL');
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        <button type="button" className="admin-btn admin-btn-primary" onClick={openCreateModal}>
          <Icon name="plus" style={{ width: 16, height: 16 }} />
          + เพิ่มผู้ใช้งานใหม่ (Create User)
        </button>
      </div>

      {/* USERS TABLE */}
      <div className="admin-table-container">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ชื่อ-นามสกุล / ข้อมูลติดต่อ</th>
                <th>บทบาท (Role)</th>
                <th>โรงพยาบาลสังกัด</th>
                <th style={{ textAlign: 'center' }}>สถานะออนไลน์</th>
                <th style={{ textAlign: 'center' }}>สถานะบัญชี</th>
                <th>เข้าสู่ระบบล่าสุด</th>
                <th style={{ textAlign: 'center' }}>การจัดการ (Actions)</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                    ไม่พบบัญชีผู้ใช้งานตรงตามเงื่อนไขที่กำหนด
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: '#EFF6FF',
                            color: '#1E40AF',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            border: '1px solid #BFDBFE',
                            flexShrink: 0,
                          }}
                        >
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 14 }}>
                            {u.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B', display: 'flex', gap: 8 }}>
                            <span>✉️ {u.email}</span>
                            <span>📞 {u.phone}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`admin-badge ${
                          u.role === 'SYSTEM_ADMIN'
                            ? 'admin-badge-purple'
                            : u.role === 'HOSPITAL_ADMIN'
                            ? 'admin-badge-info'
                            : u.role === 'PHARMACIST'
                            ? 'admin-badge-success'
                            : 'admin-badge-neutral'
                        }`}
                        style={{
                          background:
                            u.role === 'SYSTEM_ADMIN'
                              ? '#F5F3FF'
                              : u.role === 'PHARMACIST'
                              ? '#ECFDF5'
                              : '#EFF6FF',
                          color:
                            u.role === 'SYSTEM_ADMIN'
                              ? '#6D28D9'
                              : u.role === 'PHARMACIST'
                              ? '#047857'
                              : '#1D4ED8',
                          border: '1px solid currentColor',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 500 }}>
                        {u.hospitalName}
                      </div>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {u.isOnline ? (
                        <span className="admin-badge admin-badge-success">
                          <span className="admin-live-pulse" /> ออนไลน์
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-neutral">ออฟไลน์</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {u.status === 'ACTIVE' && (
                        <span className="admin-badge admin-badge-success">เปิดใช้งาน (ACTIVE)</span>
                      )}
                      {u.status === 'INACTIVE' && (
                        <span className="admin-badge admin-badge-neutral">ปิดใช้งาน (INACTIVE)</span>
                      )}
                      {u.status === 'SUSPENDED' && (
                        <span className="admin-badge admin-badge-danger">ระงับ (SUSPENDED)</span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: 12, color: '#334155' }}>{u.lastLogin}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>สะสม {u.loginCount} ครั้ง</div>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="admin-btn-icon"
                          title="แก้ไขข้อมูลผู้ใช้ (Edit)"
                          onClick={() => openEditModal(u)}
                        >
                          <Icon name="edit" style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          type="button"
                          className="admin-btn-icon btn-icon-danger"
                          title="ลบหรือปิดการใช้งานบัญชี (Deactivate/Delete)"
                          onClick={() => setDeletingUser(u)}
                        >
                          <Icon name="trash" style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title">
                {editingUser ? 'แก้ไขบัญชีผู้ใช้งาน (Update User)' : 'เพิ่มบัญชีผู้ใช้งานใหม่ (Create User)'}
              </h3>
              <button
                type="button"
                className="admin-btn-icon"
                onClick={() => setIsModalOpen(false)}
                style={{ border: 'none' }}
              >
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="admin-modal-body">
                {formError && (
                  <div
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #FCA5A5',
                      color: '#B91C1C',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    ⚠️ {formError}
                  </div>
                )}

                <div className="admin-form-group">
                  <label className="admin-form-label">
                    ชื่อ-นามสกุล <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="เช่น ภก.สมชาย รักงาน"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      อีเมล (Email) <span className="req">*</span>
                    </label>
                    <input
                      type="email"
                      className="admin-form-input"
                      placeholder="user@hospital.go.th"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">เบอร์โทรศัพท์ (Phone)</label>
                    <input
                      type="tel"
                      className="admin-form-input"
                      placeholder="08X-XXX-XXXX"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      บทบาทผู้ใช้ (Role) <span className="req">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as AdminUserRole)}
                      style={{ width: '100%' }}
                    >
                      <option value="PHARMACIST">เภสัชกร (PHARMACIST)</option>
                      <option value="HOSPITAL_ADMIN">ผู้ดูแลโรงพยาบาล (HOSPITAL_ADMIN)</option>
                      <option value="WAREHOUSE_OFFICER">เจ้าหน้าที่คลังยา (WAREHOUSE_OFFICER)</option>
                      <option value="DRIVER">พนักงานขับรถส่งยา (DRIVER)</option>
                      <option value="SYSTEM_ADMIN">ผู้ดูแลระบบสูงสุด (SYSTEM_ADMIN)</option>
                      <option value="AUDITOR">ผู้ตรวจสอบ (AUDITOR)</option>
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      สถานะบัญชี (Status) <span className="req">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      style={{ width: '100%' }}
                    >
                      <option value="ACTIVE">เปิดใช้งาน (ACTIVE)</option>
                      <option value="INACTIVE">ปิดใช้งาน (INACTIVE)</option>
                      <option value="SUSPENDED">ระงับสิทธิ์ชั่วคราว (SUSPENDED)</option>
                    </select>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">
                    โรงพยาบาล / หน่วยงานสังกัด <span className="req">*</span>
                  </label>
                  <select
                    className="admin-select"
                    value={formHospitalId}
                    onChange={(e) => setFormHospitalId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.type} จ.{h.province})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#64748B' }}>
                    การกำหนดโรงพยาบาลมีผลต่อการบังคับสิทธิ์การเข้าถึงข้อมูล (Row-Level Security)
                  </span>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  {editingUser ? 'บันทึกการแก้ไข' : 'สร้างบัญชีผู้ใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / DEACTIVATE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="admin-modal-overlay" onClick={() => setDeletingUser(null)}>
          <div className="admin-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title" style={{ color: '#DC2626' }}>
                ยืนยันการลบ / ระงับบัญชีผู้ใช้งาน
              </h3>
              <button
                type="button"
                className="admin-btn-icon"
                onClick={() => setDeletingUser(null)}
                style={{ border: 'none' }}
              >
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="admin-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#1E293B' }}>
                คุณต้องการลบหรือระงับบัญชีผู้ใช้{' '}
                <strong>{deletingUser.name}</strong> ({deletingUser.email}) หรือไม่?
              </p>
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12,
                  color: '#991B1B',
                }}
              >
                <strong>คำแนะนำความปลอดภัย (SEC-004):</strong> ตามกฎหมายและโครงสร้างฐานข้อมูล
                บัญชีที่มีประวัติการทำธุรกรรมหรืออนุมัติคำขอส่งยาแล้ว ระบบจะทำการปิดสถานะ (Deactivate)
                เพื่อเก็บ Audit Log ย้อนหลัง
              </div>
            </div>

            <div className="admin-modal-foot">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setDeletingUser(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ background: '#DC2626', borderColor: '#DC2626' }}
                onClick={handleConfirmDelete}
              >
                ยืนยันการลบ / ระงับ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
