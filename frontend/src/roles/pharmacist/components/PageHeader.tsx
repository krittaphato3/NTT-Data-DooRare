import { useEffect, useRef, useState } from 'react';
import { USER } from '../../../data/session';
import { Icon } from '../../../components/common/icons';
import { can, mayActFor } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { HOSPITAL_ADMIN_USER } from '../../hospital-admin/data/session';
import { ManualBorrowDialog } from './ManualBorrowDialog';

const todayTh = () => new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeTh = () => new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

interface PageHeaderProps {
  isAdmin: boolean;
  hospital: string;
  onHospital: (v: string) => void;
  /** Role viewing the dashboard; the header actions are gated through `lib/rbac.ts`. */
  role?: RoleCode;
  /** Hospital Admin sees own-hospital scope only: the selector is pinned and cannot be changed. */
  hospitalLocked?: boolean;
}

/** Shown when a borrow request was successfully created via ManualBorrowDialog. */
interface CreateSuccess {
  requestNo: string;
  status: string;
}

const HOSPITALS = ['ทุกโรงพยาบาล (12)', 'โรงพยาบาลสมุทรปราการ', 'รพ.บางพลี', 'รพ.บางบ่อ'];

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function DialogShell({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => { boxRef.current?.focus(); }, []);
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,42,92,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="card dialog"
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ isAdmin, hospital, onHospital, role = 'PHARMACIST', hospitalLocked = false }: PageHeaderProps) {
  const [showBorrowDialog, setShowBorrowDialog] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<CreateSuccess | null>(null);
  /* Own-hospital scope keeps its own identity (name + hospital) — never the pooled pharmacist view. */
  const viewer = hospitalLocked ? HOSPITAL_ADMIN_USER : USER;
  const roleTh = isAdmin ? 'ผู้ดูแลระบบ (Admin)' : viewer.roleTh;
  /* manageIncident is FALSE for PHARMACIST in the RBAC matrix (spec §5.2 / lib/rbac.ts WRITE_ROLES).
     Previously used mayActFor(role, 'PHARMACIST', 'manageIncident') which bypasses the matrix when
     role === ownerRole and always returned true for PHARMACIST — QA-PHARM-004 fix. */
  const mayReportIncident = can(role, 'manageIncident');
  const mayCreateRequest = mayActFor(role, 'PHARMACIST', 'createBorrowRequest');

  return (
    <section className="pagehead" data-part="page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C' }}>
          ภาพรวม <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8' }}>/ Dashboard</span>
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginTop: 2 }}>
          <span>
            สวัสดี <strong style={{ color: '#0F2A5C', fontWeight: 600 }}>{viewer.name}</strong> · {roleTh}
          </span>
          <span style={{ color: '#CBD5E1' }} aria-hidden="true">
            |
          </span>
          {hospitalLocked && (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="shield" />
                {viewer.scopeLabel}
              </span>
              <span style={{ color: '#CBD5E1' }} aria-hidden="true">
                |
              </span>
            </>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" />
            {todayTh()} · <span className="num">{timeTh()}</span> น.
          </span>
          {isAdmin && !hospitalLocked && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              โรงพยาบาล
              <select aria-label="กรองโรงพยาบาล / Hospital filter" value={hospital} onChange={(e) => onHospital(e.target.value)} style={{ height: 32, border: '1px solid #94A3B8', borderRadius: 8, padding: '0 8px', font: 'inherit', color: '#0F2A5C', background: '#FFFFFF' }}>
                {HOSPITALS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          )}
          {hospitalLocked && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              โรงพยาบาล
              <select
                aria-label="โรงพยาบาลของฉัน / Own hospital (fixed)"
                value={viewer.hospitalLabel}
                disabled
                title="ผู้ดูแลโรงพยาบาลเห็นเฉพาะโรงพยาบาลของตนเอง"
                style={{ height: 32, border: '1px solid #CBD5E1', borderRadius: 8, padding: '0 8px', font: 'inherit', color: '#0F2A5C', background: '#F8FAFC' }}
              >
                <option>{viewer.hospitalLabel}</option>
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="pagehead-actions">
        {mayReportIncident && (
          <button className="btn btn-s" onClick={() => window.location.assign('?page=incident')}>
            <Icon name="siren" />
            รายงานเหตุฉุกเฉิน <span className="label-en" style={{ fontWeight: 400, opacity: 0.8 }}>Report Emergency</span>
          </button>
        )}
        {mayCreateRequest && (
          <button className="btn btn-p" onClick={() => { setCreateSuccess(null); setShowBorrowDialog(true); }}>
            <Icon name="plus" />
            สร้างคำขอยืม <span className="label-en" style={{ fontWeight: 400, opacity: 0.85 }}>Create Request</span>
          </button>
        )}
      </div>

      {/* Real ManualBorrowDialog (UI-10, API-F1b-001/004) replaces the previous dummy modal.
          QA-PHARM-004: no more hardcoded #REQ-1057 or setSent(true). */}
      {showBorrowDialog && (
        <ManualBorrowDialog
          onClose={() => setShowBorrowDialog(false)}
          onCreated={(requestNo, status) => {
            setShowBorrowDialog(false);
            setCreateSuccess({ requestNo, status });
          }}
        />
      )}

      {/* Success toast shown after ManualBorrowDialog completes. */}
      {createSuccess && (
        <DialogShell label="สร้างคำขอยืมสำเร็จ" onClose={() => setCreateSuccess(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
              <Icon name="checkc" />
              ส่งคำขอแล้ว {createSuccess.requestNo} · สถานะ: {createSuccess.status}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-s btn-sm" onClick={() => setCreateSuccess(null)}>ปิด</button>
            </div>
          </div>
        </DialogShell>
      )}
    </section>
  );
}
