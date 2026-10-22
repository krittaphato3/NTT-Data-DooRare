import { Icon } from '../../../components/common/icons';
import { WAREHOUSE_USER } from '../data/session';
import { WhCta } from './WhCta';

/** Same header pattern as the pharmacist dashboard: title, greeting + date, primary actions. */
export function WhPageHeader() {
  return (
    <section className="pagehead" data-part="page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C' }}>
          ภาพรวม <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8' }}>/ Dashboard</span>
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginTop: 2 }}>
          <span>
            สวัสดี <strong style={{ color: '#0F2A5C', fontWeight: 600 }}>{WAREHOUSE_USER.name}</strong> · {WAREHOUSE_USER.roleTh}
          </span>
          <span style={{ color: '#CBD5E1' }} aria-hidden="true">
            |
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" />
            {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · <span className="num">{new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })}</span> น.
          </span>
        </div>
      </div>
      <div className="pagehead-actions">
        <WhCta page="docs" label="พิมพ์เอกสาร" small={false}>
          <Icon name="printer" />
        </WhCta>
        <WhCta page="transport" label="ติดตามการขนส่ง" primary small={false}>
          <Icon name="truck" />
        </WhCta>
      </div>
    </section>
  );
}
