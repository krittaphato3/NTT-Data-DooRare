import { useState } from 'react';
import { Icon } from './icons';

export function Footer({ isAdmin }: { isAdmin: boolean }) {
  const [agentOn, setAgentOn] = useState(true);
  const color = agentOn ? '#166534' : '#475569';

  return (
    <footer
      className="footerbar"
      style={{ marginTop: 'auto', borderTop: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 24px', fontSize: 12, lineHeight: '16px' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon name="refresh" className="ic14" />
        อัปเดตข้อมูลล่าสุด <span className="num">19:10</span> น. · ซิงก์สต็อกจาก HIS ทุก <span className="num">15</span> นาที
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color, fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: color, display: 'inline-block' }} />
          Agent: {agentOn ? 'Online' : 'Paused (ปิดโดย Admin)'}
        </span>
        {isAdmin && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid #E2E8F0' }}>
            <span>เปิด/ปิด Agent <span style={{ fontSize: 11, border: '1px solid #94A3B8', borderRadius: 4, padding: '0 4px' }}>Admin</span></span>
            <button
              className={`sw ${agentOn ? 'sw-on' : 'sw-off'}`}
              role="switch"
              aria-checked={agentOn ? 'true' : 'false'}
              aria-label="เปิดหรือปิด Agent"
              onClick={() => setAgentOn((v) => !v)}
            >
              <span />
            </button>
          </span>
        )}
        <span>MedSupply Link v2.4 · เขตสุขภาพที่ 6</span>
      </span>
    </footer>
  );
}
