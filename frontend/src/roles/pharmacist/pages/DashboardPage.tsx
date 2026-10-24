import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { AlertsPanel } from '../components/AlertsPanel';
import { AgentSummaryPanel } from '../components/AgentSummaryPanel';
import { BottomRow } from '../components/BottomRow';
import { KpiRow } from '../components/KpiRow';
import { MiddleRow } from '../components/MiddleRow';
import { PageHeader } from '../components/PageHeader';
import { PharmacistActionCenter } from '../components/PharmacistActionCenter';
import { RequestStatusPanel } from '../components/RequestStatusPanel';
import '../dashboard.css';

interface DashboardPageProps {
  isAdmin: boolean;
  query: string;
  hospital: string;
  onHospital: (v: string) => void;
  /** Role viewing the page; every role other than the owner is gated through `lib/rbac.ts`. */
  role?: RoleCode;
  /** Hospital Admin opens the dashboard with the selector pinned to its own hospital. */
  hospitalLocked?: boolean;
}

/**
 * Pharmacist landing page: Action Center (above-the-fold daily shift priorities),
 * active operations (alerts & borrow status), and network overview/KPIs.
 * HOSPITAL_ADMIN renders the same screen read-only (Phase 2B).
 */
export function DashboardPage({ isAdmin, query, hospital, onHospital, role = 'PHARMACIST', hospitalLocked = false }: DashboardPageProps) {
  return (
    <>
      <PageHeader
        isAdmin={isAdmin}
        hospital={hospital}
        onHospital={onHospital}
        role={role}
        hospitalLocked={hospitalLocked}
      />

      {/* 1. Above the fold: Action Center (ศูนย์รวมงานด่วนที่ต้องทำทันที) */}
      <PharmacistActionCenter role={role} />

      {/* 2. Active Operations: รายการเตือนสต็อก และคำขอยืม-ให้ยืมในเวรปัจจุบัน */}
      <section className="ph-dashboard-section" data-part="active-operations">
        <div className="ph-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ph-section-tag" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
              <Icon name="grid" className="ic16" />
            </span>
            <h2 className="ph-section-title">
              ปฏิบัติการสต็อกและคำขอยืม <span className="en">Active Operations</span>
            </h2>
          </div>
          <p className="ph-section-desc">
            ติดตามรายการเตือนสต็อกยา และสถานะคำขอยืม-ให้ยืมระหว่างโรงพยาบาลในเวรปัจจุบัน
          </p>
        </div>
        <section className="rowcards">
          <AlertsPanel query={query} hospital={hospital} role={role} />
          <RequestStatusPanel query={query} hospital={hospital} role={role} />
        </section>
      </section>

      {/* 3. Network Overview & Inventory Analytics: สรุปตัวชี้วัด, สต็อก รพ. ใกล้เคียง, ยาใกล้หมดอายุ */}
      <section className="ph-dashboard-section" data-part="network-overview">
        <div className="ph-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ph-section-tag" style={{ background: '#F0FDF4', color: '#166534' }}>
              <Icon name="chart" className="ic16" />
            </span>
            <h2 className="ph-section-title">
              สถิติและภาพรวมเครือข่าย <span className="en">Network Overview & Analytics</span>
            </h2>
          </div>
          <p className="ph-section-desc">
            ตัวชี้วัดความพร้อมของคลังยา, สต็อก รพ. ใกล้เคียงในเขต 6, และยาใกล้หมดอายุ (FEFO)
          </p>
        </div>

        <KpiRow />

        {/* Nearby hospitals, work history, near-expiry lots, network activity and the Agent summary have no API yet: demo mode only. */}
        {mockFallbackEnabled() && (
          <>
            <MiddleRow role={role} />
            <BottomRow />
            <AgentSummaryPanel />
          </>
        )}
      </section>
    </>
  );
}
