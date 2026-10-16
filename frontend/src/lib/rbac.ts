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
 *  - configureRestrictedRules §23 — changes to `borrow.score.*`, `ved.z.*` and `agent.*` require
 *                             REGION_ADMIN or above, even at HOSPITAL scope
 *  - createBorrowRequest      §4.1 "Create Borrow Request (manual)" — PHARMACIST only
 *  - acknowledgeAlert         §4.1 "View stock/alerts" + API-F1a-006/007 (ack, snooze)
 *  - transportStatus          §4.4 "ขึ้นรถแล้ว" + API-F2a-012 — WAREHOUSE_OFFICER and DRIVER only;
 *                             a PHARMACIST may list transport tasks but not post status/photos
 *  - manageIncident           §4.3 — records/updates an incident, sends the urgent borrow, packs a
 *                             kit and confirms the post-event return (ER_STAFF and WAREHOUSE_OFFICER)
 *  - printDocuments           §4.1/§4.2 "พิมพ์เอกสารยืม-คืน" — PHARMACIST and WAREHOUSE_OFFICER
 *  - cancelRequest            §4.4 "กดยกเลิกกระบวนการ" — PHARMACIST only, and only while a task is
 *                             still waiting for dispatch (both parties must agree)
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
  | 'configureRestrictedRules'
  | 'killSwitch'
  | 'createBorrowRequest'
  | 'acknowledgeAlert'
  | 'transportStatus'
  | 'manageIncident'
  | 'printDocuments'
  | 'cancelRequest';

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
    configureRestrictedRules: true,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: true, updateInventory: false,
    configureRules: true, manageUsers: true, viewAudit: true, waiveReturn: false, killSwitch: true,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  REGION_ADMIN: {
    configureRestrictedRules: true,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: true, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  HOSPITAL_ADMIN: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: true, updateInventory: false,
    configureRules: true, manageUsers: true, viewAudit: true, waiveReturn: true, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  PHARMACIST: {
    configureRestrictedRules: false,
    approveBorrow: true, confirmLend: true, releaseNearExpiry: true, approveAllocation: true,
    approveIncidentPlan: false, verifyMapping: true, editMapping: true, updateInventory: true,
    configureRules: true, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
    createBorrowRequest: true, acknowledgeAlert: true, transportStatus: false, manageIncident: false,
    printDocuments: true, cancelRequest: true,
  },
  PROCUREMENT_OFFICER: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  WAREHOUSE_OFFICER: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: true,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: true, manageIncident: true,
    printDocuments: true, cancelRequest: false,
  },
  ER_STAFF: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: true, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: true, verifyMapping: false, editMapping: false, updateInventory: true,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: true,
    printDocuments: false, cancelRequest: false,
  },
  DRIVER: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: true, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  DATA_ADMIN: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: true, editMapping: true, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: false, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
  },
  AUDITOR: {
    configureRestrictedRules: false,
    approveBorrow: false, confirmLend: false, releaseNearExpiry: false, approveAllocation: false,
    approveIncidentPlan: false, verifyMapping: false, editMapping: false, updateInventory: false,
    configureRules: false, manageUsers: false, viewAudit: true, waiveReturn: false, killSwitch: false,
    createBorrowRequest: false, acknowledgeAlert: false, transportStatus: false, manageIncident: false,
    printDocuments: false, cancelRequest: false,
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

/**
 * Gate a control inside a page that was built for `ownerRole`.
 *
 * The owner role keeps the page's existing behaviour, because these screens are that role's own
 * mock demonstration; every other role — today only HOSPITAL_ADMIN, which opens them read-only — is
 * gated strictly by `can()`. Without this rule a shared page would either lose its owner's demo
 * controls or let a role through that §5.2 does not grant the action.
 */
export function mayActFor(role: string, ownerRole: RoleCode, action: Action): boolean {
  return role === ownerRole || can(role, action);
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

/** Thai role name plus the raw role code, e.g. `เภสัชกร (PHARMACIST)`. */
export function roleName(code: RoleCode): string {
  return `${ROLE_LABEL[code].split(' (')[0]} (${code})`;
}

/**
 * Roles that hold each action, in the order they are worth naming. Used only to build the tooltip on
 * a control the signed-in role may not use — the gate itself is always `can()`.
 */
export const ACTION_OWNERS: Partial<Record<Action, RoleCode[]>> = {
  approveBorrow: ['PHARMACIST'],
  confirmLend: ['PHARMACIST', 'ER_STAFF'],
  releaseNearExpiry: ['PHARMACIST'],
  approveAllocation: ['PHARMACIST'],
  approveIncidentPlan: ['ER_STAFF'],
  createBorrowRequest: ['PHARMACIST'],
  acknowledgeAlert: ['PHARMACIST'],
  manageIncident: ['ER_STAFF', 'WAREHOUSE_OFFICER'],
  transportStatus: ['WAREHOUSE_OFFICER', 'DRIVER'],
  printDocuments: ['PHARMACIST', 'WAREHOUSE_OFFICER'],
  cancelRequest: ['PHARMACIST'],
  waiveReturn: ['HOSPITAL_ADMIN'],
};

/**
 * Tooltip for a control the viewer may not use, e.g. `ต้องเป็นเภสัชกร (PHARMACIST)`.
 * Returns `undefined` for actions with no single owner, so callers fall back to a plain label.
 */
export function requiredRoleHint(action: Action): string | undefined {
  const owners = ACTION_OWNERS[action];
  if (!owners || owners.length === 0) return undefined;
  return `ต้องเป็น${owners.map(roleName).join(' หรือ ')}`;
}

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

/**
 * §23: configuration keys whose change requires REGION_ADMIN or above. These are the only keys a
 * HOSPITAL_ADMIN may not edit even at HOSPITAL scope.
 */
export const RESTRICTED_CONFIG_PREFIXES = ['borrow.score.', 'ved.z.', 'agent.'] as const;

/**
 * Whether `role` may see another hospital's stock, Predict / Total Target and LendableStock, or the
 * Hospital Priority Score (Si) calculated from them.
 *
 * rbac.md §3: those values are "Agent/โค้ดภายในระบบเท่านั้น"; the requester sees only the name of the
 * proposed lender and the quantity it asked for. Roles that run the borrow flow work with them, so
 * they stay visible for them; HOSPITAL_ADMIN stays inside own-hospital scope, where they are
 * redacted. The two exceptions rbac.md §3 names — the central near-expiry pool and the counter-party
 * quantities on our own requests — are unaffected by this helper.
 */
export function maySeePeerStock(role: string): boolean {
  return role !== 'HOSPITAL_ADMIN';
}

/** Whether a config key falls in one of the §23 restricted groups. */
export function isRestrictedConfigKey(key: string): boolean {
  return RESTRICTED_CONFIG_PREFIXES.some((prefix) => key.startsWith(prefix));
}
