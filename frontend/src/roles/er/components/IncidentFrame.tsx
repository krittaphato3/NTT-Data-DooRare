import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { getIncidentAccess } from '../data/access';
import type { IncidentAccess } from '../data/access';
import { erHref } from '../data/navigation';
import type { Scenario } from '../data/scenario';
import { CancelModal } from './CancelModal';
import { EmptyIncidentCard } from './EmptyIncidentCard';
import { ErBreadcrumb } from './ErBreadcrumb';
import { ErPageHeading } from './ErPageHeading';
import { IncidentPills } from './IncidentPills';
import { IncidentSummaryCard } from './IncidentSummaryCard';
import { IntakeModal } from './IntakeModal';
import { PlanVersionBar } from './PlanVersionBar';
import { ScenarioBanners } from './ScenarioBanners';
import { ScenarioSwitcher } from './ScenarioSwitcher';
import { ViewOnlyBanner } from './ViewOnlyBanner';

export interface IncidentFrameContext {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  access: IncidentAccess;
  /** Open the intake form (record / update an incident). */
  openIntake: () => void;
}

interface IncidentFrameProps {
  role: RoleCode;
  title: string;
  titleEn?: string;
  subtitle?: string;
  /** Last crumb. Omit on the ER home page. */
  breadcrumb?: string;
  /** Show the incident pills, summary card and plan-version bar above the page content. */
  showContext?: boolean;
  /** S1 "ดูของที่ยังไม่ถึง". Defaults to the ER emergency-borrow page. */
  onViewBorrow?: () => void;
  children: (ctx: IncidentFrameContext) => ReactNode;
}

/**
 * Chrome shared by the incident pages: scenario bar, breadcrumb, view-only note, special-state
 * banners, heading, incident context and the intake / cancel modals. Each page owns its own state;
 * the frame only holds the scenario and the two modals.
 */
export function IncidentFrame({
  role,
  title,
  titleEn,
  subtitle = 'รพ.สมุทรปราการ · ข้อมูล ณ 19:31 น. · ทุกขั้นตอนต้องให้เจ้าหน้าที่ตรวจและยืนยัน · Agent เลือกชุดได้ แต่จำนวนทั้งหมดคำนวณโดยระบบ',
  breadcrumb,
  showContext = true,
  onViewBorrow = () => window.location.assign(erHref('borrow')),
  children,
}: IncidentFrameProps) {
  const access = getIncidentAccess(role);
  const { mayWrite } = access;
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const selectScenario = (s: Scenario) => {
    setScenario(s);
    if (s === 's6') setShowCancelModal(true);
  };
  const openIntake = () => setShowIntakeModal(true);

  const intakeModal = showIntakeModal && (
    <IntakeModal
      mayWrite={mayWrite}
      onClose={() => setShowIntakeModal(false)}
      onSaved={() => {
        setShowIntakeModal(false);
        setScenario('normal');
      }}
    />
  );

  // S7: no open incident.
  if (scenario === 's7') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ScenarioSwitcher scenario={scenario} onSelect={selectScenario} />
        <EmptyIncidentCard mayWrite={mayWrite} onIntake={openIntake} />
        {intakeModal}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ScenarioSwitcher scenario={scenario} onSelect={selectScenario} />
      {breadcrumb && <ErBreadcrumb role={role} label={breadcrumb} />}
      {!mayWrite && <ViewOnlyBanner />}
      <ScenarioBanners scenario={scenario} setScenario={setScenario} access={access} onViewBorrow={onViewBorrow} />

      <ErPageHeading
        title={title}
        titleEn={titleEn}
        subtitle={subtitle}
        actions={
          <>
            <button className="btn btn-s btn-sm">
              <Icon name="history" className="ic14" />
              ประวัติ
            </button>
            {mayWrite && (
              <button className="btn btn-g btn-sm" onClick={() => setShowCancelModal(true)}>
                ยกเลิกเหตุ (แจ้งผิด)
              </button>
            )}
            {mayWrite && (
              <button className="btn btn-sm" style={{ background: '#b91c1c', color: '#ffffff', border: 'none', fontWeight: 600 }} onClick={openIntake}>
                <Icon name="siren" className="ic14" />
                + แจ้งเหตุใหม่
              </button>
            )}
          </>
        }
      />

      {showContext && (
        <>
          <IncidentPills />
          <IncidentSummaryCard mayWrite={mayWrite} onEditTriage={openIntake} />
          <PlanVersionBar />
        </>
      )}

      {children({ scenario, setScenario, access, openIntake })}

      {intakeModal}
      {showCancelModal && (
        <CancelModal
          mayWrite={mayWrite}
          onClose={() => setShowCancelModal(false)}
          onConfirm={() => {
            setShowCancelModal(false);
            setScenario('s7');
          }}
        />
      )}
    </div>
  );
}
