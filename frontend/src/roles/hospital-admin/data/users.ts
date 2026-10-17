/** Hospital staff accounts for the User management screen (UI: derived — no mockup, no UI-nn code).
 *  Backing endpoints: API-AD-006 `GET /api/v1/users`, API-AD-007 `POST /api/v1/users`. */

import type { RoleCode } from '../../../lib/rbac';
import { ASSIGNABLE_ROLES, ROLE_LABEL } from '../../../lib/rbac';

/** §5.5: accounts are created, suspended and reactivated — never hard-deleted. */
export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface HospitalUser {
  id: string;
  name: string;
  email: string;
  roles: RoleCode[];
  status: UserStatus;
  /** MFA enrolment. `mfa_required_roles` includes HOSPITAL_ADMIN (specification/config-defaults.yaml). */
  mfa: boolean;
  /** Thai short Buddhist-era form, as used across the dashboard; '—' when never signed in. */
  lastLogin: string;
  created: string;
}

export interface StatusMeta {
  labelTh: string;
  /** `.badge` tone class from `index.css`. */
  tone: string;
}

export const USER_STATUS_META: Record<UserStatus, StatusMeta> = {
  ACTIVE: { labelTh: 'ใช้งานอยู่', tone: 't-green' },
  INVITED: { labelTh: 'รอตอบรับคำเชิญ', tone: 't-amber' },
  SUSPENDED: { labelTh: 'ระงับการใช้งาน', tone: 't-grey' },
};

export const USER_STATUS_ORDER: UserStatus[] = ['ACTIVE', 'INVITED', 'SUSPENDED'];

/** Role choices for the invite/edit modal — HOSPITAL_ADMIN can never mint system/region accounts. */
export const ROLE_OPTIONS: { value: RoleCode; label: string }[] = ASSIGNABLE_ROLES.map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

/** Short Thai-only role names for table badges (the modal uses the full `ROLE_LABEL`). */
export const ROLE_SHORT_TH: Record<RoleCode, string> = {
  SYSTEM_ADMIN: 'ผู้ดูแลระบบ',
  REGION_ADMIN: 'ผู้ดูแลเขต',
  HOSPITAL_ADMIN: 'ผู้ดูแล รพ.',
  PHARMACIST: 'เภสัชกร',
  PROCUREMENT_OFFICER: 'เจ้าหน้าที่พัสดุ',
  WAREHOUSE_OFFICER: 'เจ้าหน้าที่คลัง',
  ER_STAFF: 'เจ้าหน้าที่ ER',
  DRIVER: 'พนักงานขับรถ',
  DATA_ADMIN: 'ผู้ดูแลข้อมูลยา',
  AUDITOR: 'ผู้ตรวจสอบ',
};

/** Roles actually held by at least one account in the mock list (KPI + filter source). */
export const ROLES_IN_USE: RoleCode[] = [
  'PHARMACIST',
  'WAREHOUSE_OFFICER',
  'PROCUREMENT_OFFICER',
  'ER_STAFF',
  'DATA_ADMIN',
  'HOSPITAL_ADMIN',
];

export const HOSPITAL_USERS: HospitalUser[] = [
  {
    id: 'USR-000101', name: 'ภก.ณัฐวุฒิ ศรีสุข', email: 'nattawut.s@smp.go.th',
    roles: ['PHARMACIST'], status: 'ACTIVE', mfa: true, lastLogin: '13 ต.ค. 69 08:31', created: '12 ม.ค. 68',
  },
  {
    id: 'USR-000102', name: 'คุณประเสริฐ ใจงาม', email: 'prasert.j@smp.go.th',
    roles: ['WAREHOUSE_OFFICER'], status: 'ACTIVE', mfa: false, lastLogin: '13 ต.ค. 69 07:12', created: '3 ก.พ. 68',
  },
  {
    id: 'USR-000103', name: 'คุณวรรณา ทองดี', email: 'wanna.t@smp.go.th',
    roles: ['PROCUREMENT_OFFICER'], status: 'ACTIVE', mfa: false, lastLogin: '12 ต.ค. 69 16:40', created: '20 ก.พ. 68',
  },
  {
    id: 'USR-000104', name: 'ภญ.จิราพร อินทรีย์', email: 'jiraporn.i@smp.go.th',
    roles: ['PHARMACIST', 'DATA_ADMIN'], status: 'ACTIVE', mfa: true, lastLogin: '13 ต.ค. 69 09:05', created: '5 มี.ค. 68',
  },
  {
    id: 'USR-000105', name: 'คุณสมชาย แก้วกล้า', email: 'somchai.k@smp.go.th',
    roles: ['DRIVER'], status: 'ACTIVE', mfa: false, lastLogin: '11 ต.ค. 69 18:22', created: '1 เม.ย. 68',
  },
  {
    id: 'USR-000106', name: 'นางสาวกมลชนก บุญมี', email: 'kamonchanok.b@smp.go.th',
    roles: ['ER_STAFF'], status: 'ACTIVE', mfa: false, lastLogin: '10 ต.ค. 69 21:47', created: '18 พ.ค. 68',
  },
  {
    id: 'USR-000107', name: 'นายปกรณ์ วัฒนกุล', email: 'pakorn.w@smp.go.th',
    roles: ['WAREHOUSE_OFFICER'], status: 'INVITED', mfa: false, lastLogin: '—', created: '12 ต.ค. 69',
  },
  {
    id: 'USR-000108', name: 'นางสุนีย์ ประสิทธิ์', email: 'sunee.p@smp.go.th',
    roles: ['PROCUREMENT_OFFICER'], status: 'INVITED', mfa: false, lastLogin: '—', created: '13 ต.ค. 69',
  },
  {
    id: 'USR-000109', name: 'นายธีรภัทร สุขสวัสดิ์', email: 'teerapat.s@smp.go.th',
    roles: ['DRIVER'], status: 'SUSPENDED', mfa: false, lastLogin: '28 ก.ย. 69 06:15', created: '2 มิ.ย. 68',
  },
  {
    id: 'USR-000110', name: 'ภญ.อรอุมา พรหมมา', email: 'orauma.p@smp.go.th',
    roles: ['HOSPITAL_ADMIN'], status: 'ACTIVE', mfa: true, lastLogin: '13 ต.ค. 69 08:00', created: '8 ม.ค. 68',
  },
];
