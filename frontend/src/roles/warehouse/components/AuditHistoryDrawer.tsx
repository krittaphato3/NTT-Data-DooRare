import { Icon } from '../../../components/common/icons';
import { AUDIT_HISTORY } from '../data/transport';

/** Audit history drawer (spec §15: every screen). */
export function AuditHistoryDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="tr-drawer tr-drawer-hist" aria-label="ประวัติการเปลี่ยนแปลง">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 className="sec-h">
            ประวัติการเปลี่ยนแปลง <span className="en">Audit history</span>
          </h2>
          <div className="sub">ติดตามการขนส่ง · วันนี้</div>
        </div>
        <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="hist-note">
        <Icon name="lock" className="ic14" style={{ marginTop: 2 }} />
        <span>บันทึกแบบ hash-chain แก้ไขหรือลบไม่ได้ · บทบาทแสดงตามที่ผู้ใช้ถือในเวลานั้น</span>
      </div>
      <ol className="hist-list">
        {AUDIT_HISTORY.map((h) => (
          <li key={h.code + h.t}>
            <span className="num" style={{ fontSize: 12, color: '#0F2A5C' }}>{h.t}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 500 }}>{h.who}</span>
                <span className={`badge t-${h.tone}`} style={{ height: 18, fontSize: 11 }}>{h.role}</span>
              </span>
              <span style={{ display: 'block', fontSize: 12.5, lineHeight: '18px' }}>{h.text}</span>
              <span className="code" style={{ fontSize: 10.5 }}>{h.code}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
