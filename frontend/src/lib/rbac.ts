/**
 * Role-based access mirror for the dashboard UI.
 *
 * SOURCE OF TRUTH: `specification/` — 01-foundation.md §5.1 (roles) and §5.2 (permission matrix,
 * incl. rules SEC-001..003), 07-api.md (API-AD-*, API-F1a/1b-*, API-XC-*, API-F2a-*, API-F3-*),
 * 10-security-nfr-stack.md §23 (configuration).
 *
 * `specification/rbac.md` is a SECONDARY reference used only for cross-checking (decided 2026-10-16:
 * the spec wins where the two conflict). Known divergences, all resolved in favour of the spec:
 *  - rbac.md defines 6 roles; the spec defines 10 — rbac.md omits REGION_ADMIN, PROCUREMENT_OFFICER,
 *    DATA_ADMIN and AUDITOR, and renames ER_STAFF → "ER".
 *  - rbac.md §5.5 grants HOSPITAL_ADMIN only `manageUsers` + `viewAudit`; spec §5.2 also grants
 *    `editMapping` (own) and `configureRules` (own), and spec API-XC-005 makes HOSPITAL_ADMIN the
 *    only role allowed to `waiveReturn`.
 *  - rbac.md §5.6/§9 #8 gives all configuration to SYSTEM_ADMIN; spec §5.1/§5.2 + API-AD-001/002 give
 *    HOSPITAL_ADMIN own-hospital configuration.
 *  - rbac.md §5.5 caps role assignment at roles 1-5; the spec §5.2 states no cap but never grants
 *    HOSPITAL_ADMIN the ability to mint SYSTEM_ADMIN / REGION_ADMIN (see ASSIGNABLE_ROLES).
 *
 * This module only mirrors the rules for display. It is NOT a security boundary — the server
 * enforces authorisation and hospital scope on every request (SEC-002, deny by default).
 */

/** `role_code` enum from the spec schema (01-foundation.md ASM-01). */
export type RoleCode =
  | 'SYSTEM_ADMIN'
  | 'REGION_ADMIN'
  | 'HOSPITAL_ADMIN'
  | 'PHARMACIST'
  | 'PROCUREMENT_OFFICER'
  | 'WAREHOUSE_OFFICER'
  | 'ER_STAFF'
  | 'DRIVER'
  | 'DATA_ADMIN'
  | 'AUDITOR';

/**
 * Actions the UI gates on. Each maps to a column of the spec §5.2 matrix plus the endpoints that
 * grant it, so the reason is traceable:
 *  - approveBorrow            §5.2 "Approve Borrow Request"
 *  - confirmLend              §5.2 "Confirm Lending"
 *  - releaseNearExpiry        §5.2 "Release Near-expiry / Approve Plan" (release half)
 *  - approveAllocation        §5.2 "Release Near-expiry / Approve Plan" (approve-plan half)
 *  - approveIncidentPlan      §5.2 "Create/Approve Incident Plan"
 *  - verifyMapping            §5.2 "Verify Mapping"
 *  - editMapping              §5.2 "Edit Mapping"
 *  - updateInventory          §5.2 "Update Inventory / Confirm Movement"
 *  - configureRules           §5.2 "Configure Rules"; API-AD-001/002
 *  - manageUsers              §5.2 "Create/Approve Incident Plan" row has no user column; from
 *                             API-AD-006/007 and §5.1 "Users"
 *  - viewAudit                §5.2 "View Audit Log"; API-AD-003
 *  - waiveReturn              API-XC-005 (HOSPITAL_ADMIN only)
 *  - killSwitch               §5.2 "Override Agent / Kill Switch"; API-AD-004
 */
export type Action =
  | 'approveBorrow'
  | 'confirmLend'
  | 'releaseNearExpiry'
  | 'approveAllocation'
  | 'approveIncidentPlan'
  | 'verifyMapping'
  | 'editMapping'
  | 'updateInventory'
  | 'configureRules'
  | 'manageUsers'
  | 'viewAudit'
  | 'waiveReturn'
  | 'killSwitch';

/**
 * §5.2 permission matrix, one row per role. `true` means allowed within that role's scope
 * (own hospital unless the role is SYSTEM_ADMIN / REGION_ADMIN); `false` means denied.
 *
 * Notes preserved from the matrix text:
 *  - REGION_ADMIN "resolve discussion" on allocation plans is a review action, not an approval,
 *    so `approveAllocation` is false for that role.
 *  - PHARMACIST §5.2 "Override Agent / Kill Switch" grants override of the agent *plan*, not the
 *    system kill switch — `killSwitch` stays false.
 *  - DRIVER §5.2 lists "status + photo" in the inventory column; that is transport status, not a
 *    stock movement, so `updateInventory` stays false.
 */
const MATRIX: Record<RoleCode, Record<Action, boolean>> = {
  SYSTEM_ADMIN: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: true, updateInventory: false,
    configureRules: true, manageUsers: true, viewAudit: true, waiveReturn: false, killSwitch: true,
  },
  REGION_ADMIN: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: true, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
  },
  HOSPITAL_ADMIN: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: true, updateInventory: false,
    configureRules: true, manageUsers: true, viewAudit: true, waiveReturn: true, killSwitch: false,
  },
  PHARMACIST: {
    approveBorrow: true, confirmLend: true, releaseNearExpiry: true, approveAllocation: true,
    approveIncidentPlan: false, verifyMapping: true, editMapping: true, updateInventory: true,
    configureRules: true, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
  },
  PROCUREMENT_OFFICER: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
  },
  WAREHOUSE_OFFICER: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: true,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
  },
  ER_STAFF: {
    approveBorrow: false, confirmLend: true, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: true, verifyMapping: false, editMapping: false, updateInventory: true,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
  },
  DRIVER: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
  },
  DATA_ADMIN: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: true, editMapping: true, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
  },
  AUDITOR: {
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
  },
};

/**
 * Whether `role` may perform `action` (spec §5.2). Unknown roles are denied — the spec enforces
 * deny-by-default (SEC-002), and so does this helper.
 */
export function can(role: string, action: Action): boolean {
  const row = MATRIX[role as RoleCode];
  return row ? row[action] === true : false;
}

/** Thai display names for the 10 spec role codes. */
export const ROLE_LABEL: Record<RoleCode, string> = {
  SYSTEM_ADMIN: 'ผู้ดูแลระบบ (System Admin)',
  REGION_ADMIN: 'ผู้ดูแลเขตสุขภาพ (Region Admin)',
  HOSPITAL_ADMIN: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)',
  PHARMACIST: 'เภสัชกร (Pharmacist)',
  PROCUREMENT_OFFICER: 'เจ้าหน้าที่พัสดุ (Procurement Officer)',
  WAREHOUSE_OFFICER: 'เจ้าหน้าที่คลัง (Warehouse Officer)',
  ER_STAFF: 'เจ้าหน้าที่ห้องฉุกเฉิน (ER)',
  DRIVER: 'พนักงานขับรถ (Driver)',
  DATA_ADMIN: 'ทีมผู้ดูแลข้อมูลยา (Data Admin)',
  AUDITOR: 'ผู้ตรวจสอบ (Auditor)',
};

/**
 * Roles a HOSPITAL_ADMIN may assign when inviting/editing a user.
 *
 * The spec never grants a hospital admin the ability to mint a system-wide or region-wide account,
 * so SYSTEM_ADMIN and REGION_ADMIN are excluded (rbac.md §5.5 reaches the same conclusion, though by
 * capping at "roles 1-5" rather than by scope).
 */
/**
 * The hospital-level administrator role. Used for role-identity rules (the "last admin" safeguard,
 * rbac.md §5.5) so the literal appears once instead of being re-typed in components.
 */
export const HOSPITAL_ADMIN_ROLE: RoleCode = 'HOSPITAL_ADMIN';

export const ASSIGNABLE_ROLES: RoleCode[] = [
  'HOSPITAL_ADMIN',
  'PHARMACIST',
  'PROCUREMENT_OFFICER',
  'WAREHOUSE_OFFICER',
  'ER_STAFF',
  'DRIVER',
  'DATA_ADMIN',
  'AUDITOR',
];
