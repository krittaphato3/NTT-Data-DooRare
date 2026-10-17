import { can, mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';

export interface IncidentAccess {
  /** Record an incident, adjust the plan, pack a kit, close the event (F3 writes, §4.3). */
  mayWrite: boolean;
  /** Tooltip for a disabled write control. */
  writeHint: string | undefined;
  /** Approve plan v3 and send the extra urgent borrows. */
  mayApprovePlan: boolean;
  /** Print the summary documents. */
  mayPrint: boolean;
}

/**
 * What `role` may do on the incident screens. The incident console is ER_STAFF's own screen; the
 * pharmacist views F3 only (rbac.md v1.1 §4.3, and spec §5.2 grants PHARMACIST neither
 * manageIncident nor approveIncidentPlan). A role without a write either does not see the control
 * or sees it disabled.
 */
export function getIncidentAccess(role: RoleCode): IncidentAccess {
  const mayWrite = mayActFor(role, 'ER_STAFF', 'manageIncident');
  return {
    mayWrite,
    writeHint: requiredRoleHint('manageIncident'),
    mayApprovePlan: mayActFor(role, 'ER_STAFF', 'approveIncidentPlan'),
    // Summary documents: ER prints them; the pharmacist may still view/print (§4.3 "ดู/พิมพ์").
    mayPrint: mayWrite || can(role, 'printDocuments'),
  };
}
