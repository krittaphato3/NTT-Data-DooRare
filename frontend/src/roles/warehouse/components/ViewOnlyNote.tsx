import { Icon } from '../../../components/common/icons';

/** Banner shown on the read-only WH pages (RBAC 👁): what WH can see and who acts. */
export function ViewOnlyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="kt-note" role="note">
      <Icon name="eye" className="ic14" style={{ marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}
