import { useEffect } from 'react';
import { Icon } from '../../../components/common/icons';
import { auditActionMeta, roleLabel } from '../data/audit';
import type { AuditEntry } from '../data/audit';

interface AuditDrawerProps {
  entry: AuditEntry;
  onClose: () => void;
}

/** Row detail for UI-18: full before/after snapshot, agent run and hash-chain links. */
export function AuditDrawer({ entry, onClose }: AuditDrawerProps) {
  const meta = auditActionMeta(entry.action);

  // Keyboard-operable: Escape closes the drawer, matching the dialog shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="tr-drawer" aria-label={`รายละเอียดบันทึก ${entry.id}`}>
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h2 className="sec-h">รายละเอียดบันทึก</h2>
            <div className="sub">
              <span className="code">{entry.id}</span> · {entry.at}
            </div>
          </div>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <span className={`badge ${meta.tone}`}>{meta.labelTh}</span>
          <span className="badge t-grey">{entry.entityType}</span>
        </span>
      </div>

      <div className="tr-drawer-body">
        <div className="ha-banner ha-banner-info" style={{ marginBottom: 0 }}>
          <Icon name="lock" className="ic14" style={{ marginTop: 2 }} />
          <span>
            บันทึกแบบ hash-chain แก้ไขหรือลบไม่ได้ · บทบาทแสดงตามที่ผู้ใช้ถือในเวลานั้น (SEC-003)
          </span>
        </div>

        <div className="tr-box">
          <h3 className="tr-h3">ข้อมูลการกระทำ</h3>
          <dl className="dlr">
            <dt>เวลา</dt>
            <dd className="num">{entry.at}</dd>
            <dt>ผู้กระทำ</dt>
            <dd>{entry.actor}</dd>
            <dt>บทบาท</dt>
            <dd>{roleLabel(entry.role)}</dd>
            <dt>การกระทำ</dt>
            <dd>{meta.labelTh}</dd>
            <dt>ประเภทข้อมูล</dt>
            <dd className="code">{entry.entityType}</dd>
            <dt>รหัสข้อมูล</dt>
            <dd className="code">{entry.entityId}</dd>
            <dt>IP</dt>
            <dd className="code">{entry.ip}</dd>
            <dt>เหตุผล</dt>
            <dd>{entry.reason || '—'}</dd>
          </dl>
        </div>

        <div className="tr-box">
          <h3 className="tr-h3">ค่าก่อน → หลัง</h3>
          <div className="ha-diff">
            <div>
              <div className="ha-diff-h">ก่อน · Before</div>
              <pre className="ha-json">{JSON.stringify(entry.before, null, 2)}</pre>
            </div>
            <div>
              <div className="ha-diff-h">หลัง · After</div>
              <pre className="ha-json">{JSON.stringify(entry.after, null, 2)}</pre>
            </div>
          </div>
        </div>

        {entry.agentRunId && (
          <div className="tr-box">
            <h3 className="tr-h3">บันทึกการตัดสินใจของ Agent</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon name="spark" className="ic14" />
              <span className="code">{entry.agentRunId}</span>
            </div>
            <div className="ha-hint" style={{ marginTop: 6 }}>
              Agent เสนอแผนเท่านั้น — การอนุมัติเป็นของผู้ใช้ที่มีสิทธิ์ (API-F1b-013)
            </div>
          </div>
        )}

        <div className="tr-box">
          <h3 className="tr-h3">การเชื่อมโยง hash chain</h3>
          <dl className="dlr">
            <dt>hash</dt>
            <dd className="code">{entry.hash}</dd>
            <dt>prev_hash</dt>
            <dd className="code">{entry.prevHash}</dd>
          </dl>
        </div>
      </div>
    </aside>
  );
}
