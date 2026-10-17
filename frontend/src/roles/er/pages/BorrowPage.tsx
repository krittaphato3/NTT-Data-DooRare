import { BorrowPanel } from '../components/BorrowPanel';
import { IncidentFrame } from '../components/IncidentFrame';
import type { RoleCode } from '../../../lib/rbac';

/** ER page: ยืมฉุกเฉิน. */
export function BorrowPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  return (
    <IncidentFrame role={role} title="ยืมฉุกเฉิน" titleEn="/ Emergency borrow" breadcrumb="ยืมฉุกเฉิน" subtitle="UI-11 · คำขอยืมเร่งด่วนที่ส่งถึงโรงพยาบาลผู้ให้พร้อมกัน">
      {() => <BorrowPanel />}
    </IncidentFrame>
  );
}
