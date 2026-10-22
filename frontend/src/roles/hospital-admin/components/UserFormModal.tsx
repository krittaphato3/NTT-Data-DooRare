import { useState } from 'react';
import type { RoleCode } from '../../../lib/rbac';
import { ROLE_OPTIONS } from '../data/users';
import type { HospitalUser } from '../data/users';
import { Modal } from './Modal';
import { useAuth } from '../../../context/AuthContext';

export interface UserFormValues {
  name: string;
  email: string;
  roles: RoleCode[];
  mfa: boolean;
  reason: string;
}

interface UserFormModalProps {
  mode: 'create' | 'edit';
  user?: HospitalUser;
  /** Role that must stay assigned (editing the hospital's last active admin). */
  lockedRole?: RoleCode;
  /** Server-side failure (409 CONFLICT, 422 ROLE_CONFLICT, 403 …) shown inside the dialog. */
  error?: string;
  onClose: () => void;
  onSubmit: (values: UserFormValues) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite / edit a hospital account (API-AD-006/007). Role choices are limited to the roles a
 * hospital admin may grant — SYSTEM_ADMIN and REGION_ADMIN are never offered (spec §5.2 scope).
 */
export function UserFormModal({ mode, user, lockedRole, error, onClose, onSubmit }: UserFormModalProps) {
  const { user: authUser } = useAuth();
  // Signed-in admin's own hospital from the session, not a sample name (F-04).
  const hospitalName = authUser?.hospitalName ?? '';
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [roles, setRoles] = useState<RoleCode[]>(user?.roles ?? []);
  const [mfa, setMfa] = useState(user?.mfa ?? false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const nameErr = name.trim().length === 0 ? 'กรุณากรอกชื่อ-นามสกุล' : '';
  const emailErr = !EMAIL_RE.test(email.trim()) ? 'รูปแบบอีเมลไม่ถูกต้อง' : '';
  const rolesErr = roles.length === 0 ? 'เลือกบทบาทอย่างน้อย 1 บทบาท' : '';
  const reasonErr = reason.trim().length === 0 ? 'กรุณาระบุเหตุผล' : '';
  const valid = !nameErr && !emailErr && !rolesErr && !reasonErr;

  const toggleRole = (role: RoleCode) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      // Keep the locked role even if the checkbox state drifted.
      roles: lockedRole && !roles.includes(lockedRole) ? [lockedRole, ...roles] : roles,
      mfa,
      reason: reason.trim(),
    });
  };

  const showErr = (msg: string) => (touched && msg ? msg : '');

  return (
    <Modal label={`${mode === 'create' ? 'เชิญผู้ใช้ใหม่' : 'แก้ไขบทบาทผู้ใช้'} / ${user?.name ?? ''}`} onClose={onClose}>
      <h2 className="sec-h">{mode === 'create' ? 'เชิญผู้ใช้ใหม่' : 'แก้ไขบทบาทผู้ใช้'}</h2>
      <div className="sub" style={{ marginTop: 4 }}>
        ขอบเขต{hospitalName} · สิทธิ์ถูกกำหนดตามบทบาท (spec §5.2)
      </div>

      <div className="ha-form" style={{ marginTop: 16 }}>
        <div className="ha-field">
          <label className="ha-label" htmlFor="uf-name">
            ชื่อ-นามสกุล <span aria-hidden="true">*</span>
          </label>
          <input
            id="uf-name"
            className="ha-input"
            value={name}
            aria-required="true"
            aria-invalid={touched && !!nameErr}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="เช่น ภก.สมชาย ใจดี"
          />
          {showErr(nameErr) && <span className="ha-error">{nameErr}</span>}
        </div>

        <div className="ha-field">
          <label className="ha-label" htmlFor="uf-email">
            อีเมล <span aria-hidden="true">*</span>
          </label>
          <input
            id="uf-email"
            className="ha-input"
            type="email"
            value={email}
            aria-required="true"
            aria-invalid={touched && !!emailErr}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="name@smp.go.th"
          />
          {showErr(emailErr) && <span className="ha-error">{emailErr}</span>}
        </div>

        <div className="ha-field ha-form-wide">
          <span className="ha-label" id="uf-roles-label">
            บทบาทในโรงพยาบาล <span aria-hidden="true">*</span>
          </span>
          <span className="ha-checks" role="group" aria-labelledby="uf-roles-label">
            {ROLE_OPTIONS.map((o) => {
              const locked = lockedRole === o.value;
              return (
                <label key={o.value} className="ha-check" title={locked ? 'ต้องมีผู้ดูแลโรงพยาบาลอย่างน้อย 1 บัญชี' : undefined}>
                  <input
                    type="checkbox"
                    checked={roles.includes(o.value)}
                    disabled={locked}
                    onChange={() => toggleRole(o.value)}
                  />
                  {o.label}
                </label>
              );
            })}
          </span>
          {showErr(rolesErr) && <span className="ha-error">{rolesErr}</span>}
          <span className="ha-hint">กำหนดได้เฉพาะบทบาทภายในโรงพยาบาล — ไม่มีผู้ดูแลระบบ/ผู้ดูแลเขตสุขภาพ</span>
        </div>

        <label className="ha-check ha-form-wide ha-check-wide">
          <input type="checkbox" checked={mfa} onChange={(e) => setMfa(e.target.checked)} />
          บังคับ MFA สำหรับบัญชีนี้
          <span className="ha-hint">(ผู้ดูแลโรงพยาบาลและเภสัชกรอยู่ในรายการที่ต้องใช้ MFA)</span>
        </label>

        <div className="ha-field ha-form-wide">
          <label className="ha-label" htmlFor="uf-reason">
            เหตุผล · Reason <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="uf-reason"
            className="ha-textarea"
            value={reason}
            aria-required="true"
            aria-invalid={touched && !!reasonErr}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log ตาม SEC-003"
          />
          {showErr(reasonErr) && <span className="ha-error">{reasonErr}</span>}
        </div>
      </div>

      {error && (
        <div className="ha-banner ha-banner-err" role="alert" data-part="user-form-error" style={{ marginTop: 14 }}>
          <span>{error}</span>
        </div>
      )}

      <div className="ha-dialog-foot">
        <button className="btn btn-g" onClick={onClose}>
          ยกเลิก
        </button>
        <button className="btn btn-p" disabled={touched && !valid} onClick={submit}>
          {mode === 'create' ? 'ส่งคำเชิญ' : 'บันทึกการแก้ไข'}
        </button>
      </div>
    </Modal>
  );
}
