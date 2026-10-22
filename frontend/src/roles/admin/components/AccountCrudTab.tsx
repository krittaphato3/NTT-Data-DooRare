import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { createUser, listUsers, updateUser, type ApiUser } from '../../../services/adminApi';
import { mockFallbackEnabled, onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { formatThaiDateTime } from '../../hospital-admin/data/audit';
import { INITIAL_USERS, type HospitalSummary, type UserAccount } from '../data/adminData';

/**
 * Account CRUD (SYSTEM_ADMIN console) — API-AD-006 `GET /users`, API-AD-007 `POST /users`
 * (Idempotency-Key) and `PATCH /users/{id}`.
 *
 * Accounts are never deleted: the "delete" action of the mock is now ปิดใช้งานบัญชี
 * (`PATCH { active: false }` with a reason) and can be undone with เปิดใช้งาน. INVITED is derived by
 * the server (active + never signed in); the schema has no status column.
 */

const API_LIMIT = 50;
const SESSION_KEY = 'doorare_auth_session';

/** Role set accepted by the API (`role_code` enum). */
const ALL_ROLES = [
  'SYSTEM_ADMIN',
  'REGION_ADMIN',
  'HOSPITAL_ADMIN',
  'PHARMACIST',
  'PROCUREMENT_OFFICER',
  'WAREHOUSE_OFFICER',
  'ER_STAFF',
  'DRIVER',
  'DATA_ADMIN',
  'AUDITOR',
] as const;

/** Roles the server lets exist without a hospital/region binding (users.service create/update). */
const UNBOUND_ROLES = ['SYSTEM_ADMIN', 'AUDITOR'];

const ROLE_LABEL: Record<string, string> = {
  SYSTEM_ADMIN: 'ผู้ดูแลระบบสูงสุด',
  REGION_ADMIN: 'ผู้ดูแลเขตสุขภาพ',
  HOSPITAL_ADMIN: 'ผู้ดูแลโรงพยาบาล',
  PHARMACIST: 'เภสัชกร',
  PROCUREMENT_OFFICER: 'เจ้าหน้าที่จัดซื้อ',
  WAREHOUSE_OFFICER: 'เจ้าหน้าที่คลังยา',
  ER_STAFF: 'เจ้าหน้าที่ห้องฉุกเฉิน',
  DRIVER: 'พนักงานขับรถส่งยา',
  DATA_ADMIN: 'ผู้ดูแลข้อมูล',
  AUDITOR: 'ผู้ตรวจสอบ',
};

const ROLE_TONE: Record<string, string> = {
  SYSTEM_ADMIN: 'admin-badge-neutral',
  REGION_ADMIN: 'admin-badge-info',
  HOSPITAL_ADMIN: 'admin-badge-info',
  PHARMACIST: 'admin-badge-success',
  AUDITOR: 'admin-badge-warning',
};

type AccountStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/** Row shape used by the table: API `UserView` normalized for both live and mock data. */
interface AccountRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  primaryRole: string;
  status: AccountStatus;
  active: boolean;
  isOnline: boolean;
  lastLoginAt: string | null;
  /** Mock fixtures carry a pre-formatted Thai timestamp instead of an ISO value. */
  lastLoginLabel?: string;
  loginCount: number;
  hospital: { id: string; code: string; name: string } | null;
  region: { id: string; code: string; name: string } | null;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  mfaEnabled: boolean;
  roles: string[];
  primaryRole: string;
  hospitalId: string;
  regionId: string;
  reason: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  mfaEnabled: false,
  roles: ['PHARMACIST'],
  primaryRole: 'PHARMACIST',
  hospitalId: '',
  regionId: '',
  reason: '',
};

function roleLabel(code: string): string {
  return ROLE_LABEL[code] ?? code;
}

function fromApi(u: ApiUser): AccountRow {
  const roles = (u.roles ?? []).map((r) => r.code);
  if (u.primaryRole && !roles.includes(u.primaryRole)) roles.unshift(u.primaryRole);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roles,
    primaryRole: u.primaryRole,
    status: u.status,
    active: u.active,
    isOnline: u.isOnline,
    lastLoginAt: u.lastLoginAt,
    loginCount: u.loginCount,
    hospital: u.hospital,
    region: u.region,
  };
}

/** Mock fixture → same row shape. INACTIVE is what the API calls SUSPENDED (active = false). */
function fromMock(u: UserAccount): AccountRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    roles: [u.role],
    primaryRole: u.role,
    status: u.status === 'INACTIVE' ? 'SUSPENDED' : u.status,
    active: u.status !== 'INACTIVE',
    isOnline: u.isOnline,
    lastLoginAt: null,
    lastLoginLabel: u.lastLogin,
    loginCount: u.loginCount,
    hospital: { id: u.hospitalId, code: '', name: u.hospitalName },
    region: null,
  };
}

/** Current signed-in account id, so the console can pre-block self-lockout actions. */
function currentUserId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Thai message per documented API error code (CONFLICT, ROLE_CONFLICT, LAST_ADMIN, …). */
function accountError(error: any, ctx: { targetRoles?: string[]; action: 'create' | 'update' | 'status' }): string {
  const code = error?.code as string | undefined;
  const status = error?.status as number | undefined;
  const server = typeof error?.message === 'string' ? error.message : '';
  switch (code) {
    case 'CONFLICT':
      return 'อีเมลนี้ถูกใช้งานแล้วในระบบ (CONFLICT) — กรุณาใช้อีเมลอื่น';
    case 'ROLE_CONFLICT':
      return 'บทบาทที่เลือกขัดกัน (ROLE_CONFLICT) — SYSTEM_ADMIN/AUDITOR ต้องมีบทบาทเดียว และ HOSPITAL_ADMIN รวมกับบทบาทปฏิบัติการ (เภสัชกร/จัดซื้อ/คลังยา/ฉุกเฉิน/คนขับ) ไม่ได้';
    case 'LAST_ADMIN':
      return (ctx.targetRoles ?? []).includes('SYSTEM_ADMIN')
        ? 'ต้องมีผู้ดูแลระบบกลาง (SYSTEM_ADMIN) ที่ใช้งานอยู่อย่างน้อย 1 บัญชี (LAST_ADMIN)'
        : 'ต้องมีผู้ดูแลโรงพยาบาลที่ใช้งานอยู่อย่างน้อย 1 บัญชี (LAST_ADMIN)';
    case 'SELF_LOCKOUT':
      return 'ปิดใช้งานหรือถอดบทบาทผู้ดูแลของบัญชีตนเองไม่ได้ (SELF_LOCKOUT)';
    case 'VALIDATION':
      return `ข้อมูลไม่ผ่านการตรวจสอบ (VALIDATION): ${server || 'กรุณาตรวจสอบข้อมูลที่กรอก'}`;
    case 'FORBIDDEN':
      return `ไม่มีสิทธิ์ดำเนินการ (403)${server ? `: ${server}` : ''}`;
    case 'NOT_FOUND':
      return 'ไม่พบบัญชีผู้ใช้ หรืออยู่นอกขอบเขตที่เข้าถึงได้ (404)';
  }
  if (status === 403) return `ไม่มีสิทธิ์ดำเนินการ (403)${server ? `: ${server}` : ''}`;
  if (status === 404) return 'ไม่พบบัญชีผู้ใช้ (404)';
  if (status === 409) return `ข้อมูลขัดแย้งกับสถานะปัจจุบัน (409)${server ? `: ${server}` : ''}`;
  if (status === 400) return `ข้อมูลไม่ถูกต้อง (400)${server ? `: ${server}` : ''}`;
  return server || `ดำเนินการไม่สำเร็จ${status ? ` (${status})` : ''}`;
}

interface AccountCrudTabProps {
  hospitals: HospitalSummary[];
  externalQuery?: string;
  onShowToast: (msg: string) => void;
  /** Exact account total when the whole list fits in the loaded pages (null while a cursor remains). */
  onUsersCount?: (count: number | null) => void;
}

export function AccountCrudTab({ hospitals, externalQuery = '', onShowToast, onUsersCount }: AccountCrudTabProps) {
  const [mock] = useState(() => mockFallbackEnabled());
  const meId = useMemo(() => currentUserId(), []);

  // List state (API path accumulates pages; mock path filters a fixed fixture list).
  const [apiRows, setApiRows] = useState<AccountRow[]>([]);
  const [mockRows, setMockRows] = useState<AccountRow[]>(() => INITIAL_USERS.map(fromMock));
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(!mock);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');

  // Filters → API query params (q, role, status, hospitalId are all supported by GET /users).
  const [search, setSearch] = useState(externalQuery);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const debounceRef = useRef<number | null>(null);

  // Create / edit form.
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<AccountRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // One Idempotency-Key per intended creation; reused verbatim when retrying the same submission.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Deactivate / reactivate dialog.
  const [statusTarget, setStatusTarget] = useState<{ row: AccountRow; nextActive: boolean } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const buildParams = useCallback((): Record<string, string> => {
    const p: Record<string, string> = { limit: String(API_LIMIT) };
    const q = (externalQuery || search).trim();
    if (q) p.q = q;
    if (roleFilter !== 'ALL') p.role = roleFilter;
    if (statusFilter !== 'ALL') p.status = statusFilter;
    if (hospitalFilter !== 'ALL') p.hospitalId = hospitalFilter;
    return p;
  }, [externalQuery, search, roleFilter, statusFilter, hospitalFilter]);

  const loadFirst = useCallback(
    async (params: Record<string, string>) => {
      setLoading(true);
      setListError('');
      try {
        const res = await listUsers(params);
        onLoadSuccess('users');
        setApiRows((res.items ?? []).map(fromApi));
        setCursor(res.nextCursor ?? null);
        onUsersCount?.(res.nextCursor ? null : (res.items ?? []).length);
      } catch (e: any) {
        const fallback = onLoadFailure('users', e, INITIAL_USERS.map(fromMock), [] as AccountRow[]);
        setApiRows(fallback.data);
        setCursor(null);
        setListError(`ไม่สามารถโหลดรายชื่อผู้ใช้ได้: ${e?.message ?? fallback.error}`);
        onUsersCount?.(fallback.source === 'mock' ? fallback.data.length : null);
      } finally {
        setLoading(false);
      }
    },
    [onUsersCount],
  );

  useEffect(() => {
    if (mock) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void loadFirst(buildParams());
    }, search ? 300 : 0);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, statusFilter, hospitalFilter, externalQuery, mock]);

  const refresh = () => {
    if (mock) return;
    void loadFirst(buildParams());
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listUsers(buildParams(), cursor);
      setApiRows((prev) => [...prev, ...(res.items ?? []).map(fromApi)]);
      setCursor(res.nextCursor ?? null);
      // A paged list has no total; leave the header count on its fallback (null).
      if (!res.nextCursor) onUsersCount?.(null);
    } catch (e: any) {
      onShowToast(`โหลดเพิ่มไม่สำเร็จ: ${e?.message ?? 'เกิดข้อผิดพลาด'}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const rows = mock ? mockRows : apiRows;

  // Mock path keeps the filters local (no server to query).
  const filteredMock = useMemo(() => {
    if (!mock) return rows;
    const needle = (externalQuery || search).trim().toLowerCase();
    return mockRows.filter((u) => {
      if (roleFilter !== 'ALL' && !u.roles.includes(roleFilter)) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (hospitalFilter !== 'ALL' && u.hospital?.id !== hospitalFilter) return false;
      if (!needle) return true;
      return `${u.name} ${u.email} ${u.phone ?? ''} ${u.hospital?.name ?? ''}`.toLowerCase().includes(needle);
    });
  }, [mock, rows, mockRows, externalQuery, search, roleFilter, statusFilter, hospitalFilter]);

  const visibleRows = mock ? filteredMock : rows;

  // Region options for the form: the API has no region list, so reuse the regions of the loaded accounts.
  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of rows) if (u.region?.id) map.set(u.region.id, u.region.code || u.region.name);
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [rows]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, hospitalId: hospitals[0]?.id ?? '' });
    setFormError('');
    setIdempotencyKey(crypto.randomUUID());
    setFormMode('create');
  };

  const openEdit = (row: AccountRow) => {
    setEditTarget(row);
    setForm({
      name: row.name,
      email: row.email,
      phone: row.phone ?? '',
      mfaEnabled: false,
      roles: [...row.roles],
      primaryRole: row.primaryRole,
      hospitalId: row.hospital?.id ?? '',
      regionId: row.region?.id ?? '',
      reason: '',
    });
    setFormError('');
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditTarget(null);
    setFormError('');
  };

  const toggleRole = (code: string) => {
    setForm((prev) => {
      const has = prev.roles.includes(code);
      const roles = has ? prev.roles.filter((r) => r !== code) : [...prev.roles, code];
      const primaryRole = roles.includes(prev.primaryRole) ? prev.primaryRole : (roles[0] ?? '');
      return { ...prev, roles, primaryRole };
    });
  };

  /** Role / primary / scope changes require a reason; pure profile edits do not. */
  const editDiff = useCallback(
    (row: AccountRow) => {
      const nextRoles = [...form.roles].sort();
      const currentRoles = [...row.roles].sort();
      const rolesChanged =
        JSON.stringify(nextRoles) !== JSON.stringify(currentRoles) || form.primaryRole !== row.primaryRole;
      const hospitalChanged = (form.hospitalId || null) !== (row.hospital?.id ?? null);
      const regionChanged = (form.regionId || null) !== (row.region?.id ?? null);
      return { rolesChanged, hospitalChanged, regionChanged, sensitive: rolesChanged || hospitalChanged || regionChanged };
    },
    [form.roles, form.primaryRole, form.hospitalId, form.regionId],
  );

  /** Field validation; the reason itself is checked separately (mandatory on create / sensitive edits). */
  const validateFields = (): string => {
    if (!form.name.trim()) return 'กรุณากรอกชื่อ-นามสกุล';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'กรุณากรอกอีเมลให้ถูกต้อง';
    if (form.roles.length === 0) return 'ต้องเลือกบทบาทอย่างน้อย 1 บทบาท';
    if (!form.roles.includes(form.primaryRole)) return 'บทบาทหลักต้องอยู่ในรายการบทบาทที่เลือก';
    if (form.roles.includes('SYSTEM_ADMIN') && form.roles.length > 1) return 'SYSTEM_ADMIN ต้องมีบทบาทเดียว (ROLE_CONFLICT)';
    if (form.roles.includes('AUDITOR') && form.roles.length > 1) return 'AUDITOR ต้องมีบทบาทเดียว (ROLE_CONFLICT)';
    const operational = ['PHARMACIST', 'PROCUREMENT_OFFICER', 'WAREHOUSE_OFFICER', 'ER_STAFF', 'DRIVER'];
    if (form.roles.includes('HOSPITAL_ADMIN') && form.roles.some((r) => operational.includes(r))) {
      return 'HOSPITAL_ADMIN รวมกับบทบาทปฏิบัติการไม่ได้ (ROLE_CONFLICT)';
    }
    if (!UNBOUND_ROLES.includes(form.primaryRole) && !form.hospitalId && !form.regionId) {
      return 'บัญชีนี้ต้องผูกกับโรงพยาบาลหรือเขตสุขภาพ (ยกเว้น SYSTEM_ADMIN / AUDITOR)';
    }
    return '';
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const invalidFields = validateFields();
    if (invalidFields) {
      setFormError(invalidFields);
      return;
    }
    if (formMode === 'create' && !form.reason.trim()) {
      setFormError('กรุณาระบุเหตุผล — บันทึกไว้ใน audit log (SEC-003)');
      return;
    }
    if (formMode === 'edit' && editTarget) {
      const diff = editDiff(editTarget);
      if (diff.sensitive && !form.reason.trim()) {
        setFormError('การเปลี่ยนบทบาท บทบาทหลัก โรงพยาบาล หรือเขตสุขภาพ ต้องระบุเหตุผล');
        return;
      }
    }

    const reason = form.reason.trim();
    setSaving(true);
    try {
      if (formMode === 'create') {
        const body: Record<string, unknown> = {
          name: form.name.trim(),
          email: form.email.trim(),
          roles: form.roles,
          primaryRole: form.primaryRole,
          reason,
        };
        if (form.phone.trim()) body.phone = form.phone.trim();
        if (form.mfaEnabled) body.mfaEnabled = true;
        body.hospitalId = form.hospitalId || null;
        if (form.regionId) body.regionId = form.regionId;

        if (mock) {
          if (mockRows.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())) {
            setFormError('อีเมลนี้ถูกใช้งานแล้วในระบบ (CONFLICT) — กรุณาใช้อีเมลอื่น');
            return;
          }
          const hosp = hospitals.find((h) => h.id === form.hospitalId);
          const created: AccountRow = {
            id: `USR-${String(mockRows.length + 1).padStart(3, '0')}`,
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim() || null,
            roles: form.roles,
            primaryRole: form.primaryRole,
            status: 'INVITED',
            active: true,
            isOnline: false,
            lastLoginAt: null,
            lastLoginLabel: 'ยังไม่เคยเข้าสู่ระบบ',
            loginCount: 0,
            hospital: hosp ? { id: hosp.id, code: hosp.code, name: hosp.name } : null,
            region: null,
          };
          setMockRows((prev) => [created, ...prev]);
          onShowToast(`สร้างบัญชี "${created.name}" แล้ว · เหตุผลถูกบันทึกใน audit log`);
          setIdempotencyKey(crypto.randomUUID());
          closeForm();
          return;
        }

        const res = await createUser(body, idempotencyKey);
        const created = fromApi(res.data);
        setApiRows((prev) => [created, ...prev.filter((u) => u.id !== created.id)]);
        setIdempotencyKey(crypto.randomUUID());
        onShowToast(`สร้างบัญชี "${created.name}" แล้ว · เหตุผลถูกบันทึกใน audit log`);
        closeForm();
        refresh();
        return;
      }

      if (!editTarget) return;
      const diff = editDiff(editTarget);
      const body: Record<string, unknown> = {};
      if (form.name.trim() !== editTarget.name) body.name = form.name.trim();
      if (form.email.trim().toLowerCase() !== editTarget.email.toLowerCase()) body.email = form.email.trim();
      if ((form.phone.trim() || null) !== (editTarget.phone ?? null)) body.phone = form.phone.trim();
      if (form.mfaEnabled) body.mfaEnabled = true;
      if (diff.rolesChanged) {
        body.roles = form.roles;
        body.primaryRole = form.primaryRole;
      }
      if (diff.hospitalChanged) body.hospitalId = form.hospitalId || null;
      if (diff.regionChanged) body.regionId = form.regionId || null;
      if (Object.keys(body).length === 0) {
        setFormError('ไม่มีการเปลี่ยนแปลงให้บันทึก');
        return;
      }
      if (diff.sensitive || reason) body.reason = reason;

      if (mock) {
        setMockRows((prev) =>
          prev.map((u) =>
            u.id === editTarget.id
              ? {
                  ...u,
                  name: form.name.trim(),
                  email: form.email.trim(),
                  phone: form.phone.trim() || null,
                  roles: form.roles,
                  primaryRole: form.primaryRole,
                }
              : u,
          ),
        );
        onShowToast(`บันทึกการแก้ไข "${form.name.trim()}" แล้ว · เหตุผลถูกบันทึกใน audit log`);
        closeForm();
        return;
      }

      const res = await updateUser(editTarget.id, body);
      const updated = fromApi(res.data);
      setApiRows((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onShowToast(`บันทึกการแก้ไข "${updated.name}" แล้ว · เหตุผลถูกบันทึกใน audit log`);
      closeForm();
      refresh();
    } catch (err: any) {
      setFormError(accountError(err, { targetRoles: editTarget?.roles, action: formMode === 'create' ? 'create' : 'update' }));
    } finally {
      setSaving(false);
    }
  };

  const openStatusDialog = (row: AccountRow) => {
    setStatusTarget({ row, nextActive: !row.active });
    setStatusReason('');
    setStatusError('');
  };

  const submitStatus = async () => {
    if (!statusTarget) return;
    const reason = statusReason.trim();
    if (!reason) {
      setStatusError('กรุณาระบุเหตุผล — บันทึกไว้ใน audit log (SEC-003)');
      return;
    }
    const { row, nextActive } = statusTarget;
    setStatusSaving(true);
    setStatusError('');
    try {
      if (mock) {
        setMockRows((prev) =>
          prev.map((u) =>
            u.id === row.id
              ? { ...u, active: nextActive, status: nextActive ? 'ACTIVE' : 'SUSPENDED' }
              : u,
          ),
        );
      } else {
        const res = await updateUser(row.id, { active: nextActive, reason });
        const updated = fromApi(res.data);
        setApiRows((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        refresh();
      }
      onShowToast(
        `${nextActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}บัญชี "${row.name}" แล้ว · เหตุผลถูกบันทึกใน audit log`,
      );
      setStatusTarget(null);
    } catch (err: any) {
      setStatusError(accountError(err, { targetRoles: row.roles, action: 'status' }));
    } finally {
      setStatusSaving(false);
    }
  };

  const hasFilter = Boolean(externalQuery || search) || roleFilter !== 'ALL' || hospitalFilter !== 'ALL' || statusFilter !== 'ALL';
  const statusMeta: Record<AccountStatus, { label: string; cls: string }> = {
    ACTIVE: { label: 'เปิดใช้งาน (ACTIVE)', cls: 'admin-badge-success' },
    INVITED: { label: 'รอเข้าสู่ระบบครั้งแรก (INVITED)', cls: 'admin-badge-warning' },
    SUSPENDED: { label: 'ปิดใช้งาน (SUSPENDED)', cls: 'admin-badge-neutral' },
  };
  const isSelf = (row: AccountRow) => Boolean(meId && row.id === meId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TOOLBAR & ACTIONS */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search-input">
            <Icon name="search" style={{ width: 16, height: 16, color: '#94A3B8' }} />
            <input
              type="search"
              placeholder="ค้นหาชื่อ, อีเมล, เบอร์โทร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="ค้นหาบัญชีผู้ใช้"
            />
          </div>

          <select
            className="admin-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="กรองตามบทบาท"
          >
            <option value="ALL">ทุกบทบาท (Roles)</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)} ({r})
              </option>
            ))}
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
                {h.shortName || h.name}
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
            <option value="INVITED">รอเข้าสู่ระบบครั้งแรก (INVITED)</option>
            <option value="SUSPENDED">ปิดใช้งาน (SUSPENDED)</option>
          </select>

          {hasFilter && (
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

        <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
          <Icon name="plus" style={{ width: 16, height: 16 }} />
          เชิญผู้ใช้ใหม่ (Create User)
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon name="lock" style={{ width: 14, height: 14 }} />
        บัญชีไม่ถูกลบถาวร — ใช้ “ปิดใช้งานบัญชี” เพื่อเก็บประวัติและ audit log (SEC-004) และ “เปิดใช้งาน” เพื่อคืนสิทธิ์
      </div>

      {listError && (
        <div
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          role="alert"
        >
          {listError}
        </div>
      )}

      {/* USERS TABLE */}
      <div className="admin-table-container">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ชื่อ-นามสกุล / ข้อมูลติดต่อ</th>
                <th>บทบาท (Roles · บทบาทหลัก)</th>
                <th>ขอบเขต (โรงพยาบาล / เขตสุขภาพ)</th>
                <th style={{ textAlign: 'center' }}>สถานะออนไลน์</th>
                <th style={{ textAlign: 'center' }}>สถานะบัญชี</th>
                <th>เข้าสู่ระบบล่าสุด</th>
                <th style={{ textAlign: 'center' }}>การจัดการ (Actions)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }} aria-busy="true">
                    กำลังโหลดบัญชีผู้ใช้…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                    ไม่พบบัญชีผู้ใช้งานตรงตามเงื่อนไขที่กำหนด
                  </td>
                </tr>
              ) : (
                visibleRows.map((u) => {
                  const meta = statusMeta[u.status];
                  return (
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
                              {isSelf(u) && (
                                <span className="admin-badge admin-badge-info" style={{ marginLeft: 6 }}>
                                  บัญชีของฉัน
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span>✉️ {u.email}</span>
                              <span>📞 {u.phone ?? '—'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {u.roles.map((code) => (
                            <span
                              key={code}
                              className={`admin-badge ${ROLE_TONE[code] ?? 'admin-badge-neutral'}`}
                              style={code === 'SYSTEM_ADMIN' ? { background: '#F5F3FF', color: '#6D28D9' } : undefined}
                              title={code === u.primaryRole ? 'บทบาทหลัก (primaryRole)' : code}
                            >
                              {code === u.primaryRole ? '★ ' : ''}
                              {roleLabel(code)}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3, fontFamily: 'monospace' }}>
                          primary: {u.primaryRole}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 500 }}>
                          {u.hospital?.name ?? '— ไม่ผูกโรงพยาบาล —'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          {u.hospital?.code ? `รหัส ${u.hospital.code} · ` : ''}
                          {u.region ? `เขต ${u.region.code}` : 'ไม่ระบุเขตสุขภาพ'}
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
                        <span className={`admin-badge ${meta.cls}`}>{meta.label}</span>
                      </td>

                      <td>
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          {u.lastLoginLabel ?? formatThaiDateTime(u.lastLoginAt)}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>สะสม {u.loginCount} ครั้ง</div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="admin-btn-icon"
                            title="แก้ไขข้อมูลผู้ใช้ (PATCH /users)"
                            onClick={() => openEdit(u)}
                          >
                            <Icon name="edit" style={{ width: 14, height: 14 }} />
                          </button>
                          {u.active ? (
                            <button
                              type="button"
                              className="admin-btn-icon btn-icon-danger"
                              title={isSelf(u) ? 'ปิดใช้งานบัญชีของตนเองไม่ได้ (SELF_LOCKOUT)' : 'ปิดใช้งานบัญชี (PATCH active:false)'}
                              disabled={isSelf(u)}
                              onClick={() => openStatusDialog(u)}
                            >
                              <Icon name="lock" style={{ width: 14, height: 14 }} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-btn-icon"
                              title="เปิดใช้งานบัญชีอีกครั้ง (PATCH active:true)"
                              onClick={() => openStatusDialog(u)}
                            >
                              <Icon name="userCheck" style={{ width: 14, height: 14 }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && !mock && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={!cursor || loadingMore} onClick={loadMore}>
            {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
          </button>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            แสดง {visibleRows.length} บัญชี{cursor ? ' · ยังมีรายการเพิ่มเติม' : ' · โหลดครบแล้ว'}
          </span>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {formMode && (
        <div className="admin-modal-overlay" onClick={closeForm}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 100%)' }}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title">
                {formMode === 'edit' ? 'แก้ไขบัญชีผู้ใช้งาน (PATCH /users)' : 'เชิญบัญชีผู้ใช้งานใหม่ (POST /users)'}
              </h3>
              <button type="button" className="admin-btn-icon" onClick={closeForm} style={{ border: 'none' }} aria-label="ปิด">
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <form onSubmit={submitForm}>
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
                    role="alert"
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
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">เบอร์โทรศัพท์ (Phone)</label>
                    <input
                      type="tel"
                      className="admin-form-input"
                      placeholder="08X-XXX-XXXX"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">
                    บทบาท (Roles) <span className="req">*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                    {ALL_ROLES.map((code) => (
                      <label
                        key={code}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B' }}
                      >
                        <input
                          type="checkbox"
                          checked={form.roles.includes(code)}
                          onChange={() => toggleRole(code)}
                        />
                        {roleLabel(code)} <span style={{ color: '#94A3B8', fontSize: 11 }}>{code}</span>
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#64748B' }}>
                    SYSTEM_ADMIN / AUDITOR ต้องมีบทบาทเดียว · HOSPITAL_ADMIN รวมกับบทบาทปฏิบัติการไม่ได้ (separation of duties)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      บทบาทหลัก (primaryRole) <span className="req">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={form.primaryRole}
                      onChange={(e) => setForm({ ...form, primaryRole: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {form.roles.length === 0 && <option value="">— เลือกบทบาทก่อน —</option>}
                      {form.roles.map((code) => (
                        <option key={code} value={code}>
                          {roleLabel(code)} ({code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">MFA</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, height: 42 }}>
                      <input
                        type="checkbox"
                        checked={form.mfaEnabled}
                        onChange={(e) => setForm({ ...form, mfaEnabled: e.target.checked })}
                      />
                      บังคับใช้ 2-Factor Authentication
                    </label>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      โรงพยาบาลสังกัด {UNBOUND_ROLES.includes(form.primaryRole) ? '' : <span className="req">*</span>}
                    </label>
                    <select
                      className="admin-select"
                      value={form.hospitalId}
                      onChange={(e) => setForm({ ...form, hospitalId: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="">— ไม่ผูกโรงพยาบาล (SYSTEM_ADMIN / AUDITOR) —</option>
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.type} จ.{h.province})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">เขตสุขภาพ (regionId)</label>
                    <select
                      className="admin-select"
                      value={form.regionId}
                      onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="">— ไม่ระบุ (ระบบใช้เขตของโรงพยาบาล) —</option>
                      {regionOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">
                    เหตุผล (reason) {formMode === 'create' ? <span className="req">*</span> : null}
                  </label>
                  <textarea
                    className="admin-form-input"
                    style={{ minHeight: 72, resize: 'vertical' }}
                    placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log ตาม SEC-003"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: '#64748B' }}>
                    {formMode === 'create'
                      ? 'การสร้างบัญชีต้องระบุเหตุผลเสมอ'
                      : 'ต้องระบุเมื่อเปลี่ยนบทบาท บทบาทหลัก โรงพยาบาล หรือเขตสุขภาพ · แก้ไขข้อมูลส่วนตัวอย่างเดียวไม่บังคับ'}
                  </span>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeForm} disabled={saving}>
                  ยกเลิก
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                  {saving ? 'กำลังบันทึก…' : formMode === 'edit' ? 'บันทึกการแก้ไข' : 'สร้างบัญชีผู้ใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE / REACTIVATE DIALOG (no delete endpoint exists) */}
      {statusTarget && (
        <div className="admin-modal-overlay" onClick={() => setStatusTarget(null)}>
          <div className="admin-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title">
                {statusTarget.nextActive ? 'เปิดใช้งานบัญชีอีกครั้ง' : 'ปิดใช้งานบัญชี (ไม่ใช่การลบ)'}
              </h3>
              <button
                type="button"
                className="admin-btn-icon"
                onClick={() => setStatusTarget(null)}
                style={{ border: 'none' }}
                aria-label="ปิด"
              >
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="admin-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#1E293B' }}>
                {statusTarget.nextActive ? 'เปิดใช้งานบัญชี ' : 'ปิดใช้งานบัญชี '}
                <strong>{statusTarget.row.name}</strong> ({statusTarget.row.email}) ?
              </p>
              <div
                style={{
                  background: statusTarget.nextActive ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${statusTarget.nextActive ? '#BBF7D0' : '#FECACA'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12,
                  color: statusTarget.nextActive ? '#166534' : '#991B1B',
                }}
              >
                {statusTarget.nextActive
                  ? 'บัญชีจะเข้าสู่ระบบได้ตามบทบาทที่ถืออยู่ (PATCH active:true)'
                  : 'บัญชีจะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง แต่ข้อมูล ประวัติ และ audit log ยังอยู่ครบ (SEC-004) — ไม่มีการลบข้อมูลใด ๆ'}
              </div>

              <div className="admin-form-group" style={{ marginTop: 12 }}>
                <label className="admin-form-label" htmlFor="account-status-reason">
                  เหตุผล <span className="req">*</span>
                </label>
                <textarea
                  id="account-status-reason"
                  className="admin-form-input"
                  style={{ minHeight: 72, resize: 'vertical' }}
                  placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log (SEC-003)"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
                {statusError && <span style={{ fontSize: 12, color: '#B91C1C' }}>{statusError}</span>}
              </div>
            </div>

            <div className="admin-modal-foot">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setStatusTarget(null)} disabled={statusSaving}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={statusTarget.nextActive ? undefined : { background: '#DC2626', borderColor: '#DC2626' }}
                disabled={statusSaving}
                onClick={submitStatus}
              >
                {statusSaving ? 'กำลังบันทึก…' : statusTarget.nextActive ? 'เปิดใช้งาน' : 'ปิดใช้งานบัญชี'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
