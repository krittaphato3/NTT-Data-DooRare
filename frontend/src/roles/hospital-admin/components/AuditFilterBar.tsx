import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { ROLE_LABEL } from '../../../lib/rbac';
import { AUDIT_ACTION_OPTIONS, ENTITY_TYPE_OPTIONS } from '../data/audit';
import type { EntityType } from '../data/audit';

export interface AuditFilters {
  /** ISO `yyyy-mm-dd` (from `<input type="date">`); '' means unbounded. */
  from: string;
  to: string;
  actor: string;
  role: RoleCode | 'ALL';
  /** `ALL` or an action code (mock CREATE/… or real CONFIG_UPDATED/…). */
  action: string;
  entityType: EntityType | 'ALL';
  q: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  from: '',
  to: '',
  actor: '',
  role: 'ALL',
  action: 'ALL',
  entityType: 'ALL',
  q: '',
};

interface AuditFilterBarProps {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  /** Rows left after filtering, echoed in the hint line. */
  resultCount: number;
  /** Action options for the dropdown — API mode passes the real action codes. */
  actionOptions?: { value: string; label: string }[];
  /** Hides the free-text actor filter (the API has no actor-name search — only `actorId`). */
  hideActor?: boolean;
}

/** Filter bar for UI-18. In API mode the values are sent to API-AD-003 as query params. */
export function AuditFilterBar({ filters, onChange, resultCount, actionOptions = AUDIT_ACTION_OPTIONS, hideActor = false }: AuditFilterBarProps) {
  // A stable role list — never a cross-hospital guess; the server scopes the rows (SEC-002).
  const roleOptions: (RoleCode | 'ALL')[] = ['ALL', 'SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'PHARMACIST', 'WAREHOUSE_OFFICER', 'PROCUREMENT_OFFICER', 'ER_STAFF', 'DRIVER', 'DATA_ADMIN', 'AUDITOR'];

  return (
    <div className="sa-toolbar" data-part="audit-filters">
      <label className="sa-search">
        <Icon name="search" className="ic14" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="รหัสข้อมูล / เหตุผล / IP"
          aria-label="ค้นหาในบันทึกตรวจสอบ"
        />
      </label>

      <label className="ha-field">
        <span className="ha-label">จากวันที่</span>
        <input
          className="ha-input"
          type="date"
          value={filters.from}
          aria-label="จากวันที่"
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
        />
      </label>

      <label className="ha-field">
        <span className="ha-label">ถึงวันที่</span>
        <input
          className="ha-input"
          type="date"
          value={filters.to}
          aria-label="ถึงวันที่"
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
        />
      </label>

      {!hideActor && (
        <label className="ha-field">
          <span className="ha-label">ผู้กระทำ</span>
          <input
            className="ha-input"
            value={filters.actor}
            aria-label="ผู้กระทำ"
            placeholder="ชื่อผู้ใช้"
            onChange={(e) => onChange({ ...filters, actor: e.target.value })}
          />
        </label>
      )}

      <label className="ha-field">
        <span className="ha-label">บทบาท</span>
        <select
          className="sel"
          value={filters.role}
          aria-label="บทบาท"
          onChange={(e) => onChange({ ...filters, role: e.target.value as AuditFilters['role'] })}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r === 'ALL' ? 'ทุกบทบาท' : ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>

      <label className="ha-field">
        <span className="ha-label">การกระทำ</span>
        <select
          className="sel"
          value={filters.action}
          aria-label="การกระทำ"
          onChange={(e) => onChange({ ...filters, action: e.target.value as AuditFilters['action'] })}
        >
          {actionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="ha-field">
        <span className="ha-label">ประเภทข้อมูล</span>
        <select
          className="sel"
          value={filters.entityType}
          aria-label="ประเภทข้อมูล"
          onChange={(e) => onChange({ ...filters, entityType: e.target.value as AuditFilters['entityType'] })}
        >
          {ENTITY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <span style={{ flex: '1 1 0' }} />

      <button className="btn btn-g btn-sm" onClick={() => onChange(EMPTY_AUDIT_FILTERS)}>
        <Icon name="x" className="ic14" />
        ล้างตัวกรอง
      </button>

      <span className="ha-hint">แสดง {resultCount} รายการ</span>
    </div>
  );
}
