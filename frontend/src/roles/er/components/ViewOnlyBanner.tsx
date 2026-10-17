import { Icon } from '../../../components/common/icons';

/** Shown to roles that may view F3 but not write (pharmacist, hospital admin). */
export function ViewOnlyBanner() {
  return (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, padding: '10px 16px', fontSize: 13, lineHeight: '19px', color: '#0f2a5c' }}
    >
      <Icon name="eye" style={{ color: '#1d4ed8' }} />
      <span>
        <b style={{ fontWeight: 600 }}>ดูอย่างเดียว</b> · ดูเหตุ แผน และสถานะคำขอได้ การบันทึกเหตุ แก้แผน อนุมัติ และส่งคำขอยืมเร่งด่วนทำโดย ER
      </span>
    </div>
  );
}
