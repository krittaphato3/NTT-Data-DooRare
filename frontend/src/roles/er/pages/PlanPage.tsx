import { PlanPanel } from '../components/PlanPanel';
import { IncidentFrame } from '../components/IncidentFrame';
import type { RoleCode } from '../../../lib/rbac';

/** ER page: แผนเวชภัณฑ์. */
export function PlanPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  return (
    <IncidentFrame role={role} title="แผนเวชภัณฑ์" titleEn="/ Supply plan" breadcrumb="แผนเวชภัณฑ์" subtitle="UI-12 · แผนเวชภัณฑ์ที่ Agent ประเมิน แก้จำนวนจัด แล้วอนุมัติแผน">
      {({ scenario, setScenario, access }) => <PlanPanel scenario={scenario} setScenario={setScenario} access={access} />}
    </IncidentFrame>
  );
}
