import { useState } from 'react';
import { AGENT_SUMMARY } from '../data/dashboard';
import { Icon } from '../../../components/common/icons';

/**
 * Agent daily summary — floating collapsible panel on the right edge.
 * Supplementary info (per mockup agentbox): collapsed to a pill by default,
 * expands on click. Content mirrors Main.dc.html's `sum` object verbatim.
 */
export function AgentSummaryPanel() {
  const [open, setOpen] = useState(false);
  const sum = AGENT_SUMMARY;
  const hasFlag = sum.flags.length > 0;

  return (
    <div className="agent-float" data-part="agent-summary">
      {open && (
        <section
          className="agent-float-panel"
          role="region"
          aria-labelledby="hag"
          aria-label="สรุปประจำวันจาก Agent"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2
              id="hag"
              style={{
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: '#1D4ED8',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <Icon name="sparkle" />
              {sum.title}
            </h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${sum.confCls}`} title="ระดับความมั่นใจของ Agent: HIGH / MEDIUM / LOW">
                {sum.conf}
              </span>
              <button
                className="link"
                aria-label="ปิดสรุปประจำวัน"
                onClick={() => setOpen(false)}
                style={{ fontSize: 12.5 }}
              >
                <Icon name="x" className="ic14" />
              </button>
            </span>
          </div>

          <div style={{ fontSize: 12, lineHeight: '16px', color: '#475569' }}>{sum.meta}</div>

          <p style={{ margin: 0, fontSize: 14, lineHeight: '23px', color: '#0F2A5C' }}>{sum.text}</p>

          <div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>ยาที่เสี่ยง (at_risk)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sum.risk.map((r) => (
                <span
                  key={r}
                  className="badge"
                  style={{ background: '#FFFFFF', border: '1px solid #DBEAFE', color: '#0F2A5C' }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sum.flags.map((f) => (
              <span
                key={f}
                className="badge t-red code"
                style={{ color: '#991B1B' }}
                title="แจ้งเตือนการคืนเกินกำหนด"
              >
                <Icon name="tri" className="ic14" />
                {f}
              </span>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              fontSize: 12,
              lineHeight: '17px',
              color: '#1E40AF',
              borderTop: '1px solid #DBEAFE',
              paddingTop: 10,
            }}
          >
            <Icon name="lock" className="ic14" />
            <span>
              อ่านอย่างเดียว · Agent ไม่คำนวณตัวเลข ทุกตัวเลขคัดลอกจากผลของระบบและตรวจซ้ำแล้ว ·{' '}
              <button className="link" style={{ fontSize: 12 }}>
                ดูข้อมูลที่ใช้
              </button>
            </span>
          </div>
        </section>
      )}

      <button
        className={`agent-float-toggle ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'ปิดสรุปประจำวันจาก Agent' : 'เปิดสรุปประจำวันจาก Agent'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="sparkle" />
        <span className="agent-float-label">สรุปจาก Agent</span>
        <span className={`badge ${sum.confCls}`}>{sum.conf.split(' · ')[1]}</span>
        {hasFlag && !open && (
          <span className="agent-float-dot" aria-label="มีการแจ้งเตือน RETURN_OVERDUE" title="RETURN_OVERDUE · การคืนเกินกำหนด" />
        )}
        <Icon name="chev" className="ic14 agent-float-chev" />
      </button>
    </div>
  );
}
