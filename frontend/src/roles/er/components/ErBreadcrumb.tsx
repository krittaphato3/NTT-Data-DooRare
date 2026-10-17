import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';

/** หน้าหลัก › <label>. `role` decides where "หน้าหลัก" goes. */
export function ErBreadcrumb({ role, label }: { role: RoleCode; label: string }) {
  return (
    <nav style={{ fontSize: 12.5, color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' }}>
      <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12.5, color: '#2563eb' }}>
        หน้าหลัก
      </a>
      <Icon name="chev" className="ic12" style={{ transform: 'rotate(-90deg)', color: '#94a3b8' }} />
      <span style={{ color: '#64748b' }}>{label}</span>
    </nav>
  );
}
