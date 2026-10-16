import { Icon } from '../../../components/common/icons';
import '../admin.css';

interface AccessDeniedProps {
  /** First page this role may open, used for the redirect link. */
  homeHref?: string;
  homeLabel?: string;
}

/**
 * 403 card for a direct `?page=` that the signed-in role may not open.
 * The server enforces authorisation on every request (SEC-002) — this only keeps the UI honest.
 */
export function AccessDenied({ homeHref = '?page=users', homeLabel = 'จัดการผู้ใช้' }: AccessDeniedProps) {
  return (
    <section className="card" data-part="access-denied">
      <div className="ha-state">
        <Icon name="shield" className="ic20" />
        <div className="ha-state-title">ไม่มีสิทธิ์เข้าถึง · 403</div>
        <div className="ha-state-text">
          บทบาทผู้ดูแลโรงพยาบาลเข้าถึงได้เฉพาะหน้าจัดการผู้ใช้และบันทึกตรวจสอบของโรงพยาบาลตนเอง
          (spec §5.2) ระบบไม่แสดงข้อมูลโรงพยาบาลอื่นหรือข้อมูลระดับเขต
        </div>
        <a className="btn btn-p btn-sm" href={homeHref}>
          <Icon name="arrow" className="ic14" />
          ไปที่{homeLabel}
        </a>
      </div>
    </section>
  );
}
