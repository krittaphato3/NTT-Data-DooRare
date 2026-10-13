import { useState } from 'react';
import { ALERTS, ALERT_TABS } from '../data/mock';
import { fmtTime, useTick } from '../lib/time';
import { AgentSuggestion } from './AgentSuggestion';
import { Icon } from './icons';
import type { IconName } from './icons';

interface AlertsPanelProps {
  query: string;
  hospital: string;
}

const ALL_HOSPITALS = 'ทุกโรงพยาบาล (12)';

export function AlertsPanel({ query, hospital }: AlertsPanelProps) {
  const [tab, setTab] = useState('all');
  const tick = useTick();
  const q = query.trim().toLowerCase();
  const h = hospital !== ALL_HOSPITALS ? hospital : '';

  const filtered = ALERTS.filter((a) => {
    if (tab !== 'all' && a.type !== tab) return false;
    if (h !== '' && !(a.drug + a.msg).includes(h)) return false;
    if (q !== '' && !(a.drug + a.msg + a.typeLabel).toLowerCase().includes(q)) return false;
    return true;
  });
  const showAgent = tab === 'all' || tab === 'shortage';

  return (
    <div className="card equal-card" style={{ flex: '3 1 560px', minWidth: 0, padding: '20px 24px 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          การแจ้งเตือน <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Alerts</span>
        </h2>
        <span style={{ fontSize: 12, lineHeight: '16px' }}>เรียงตาม: ยา V ก่อน แล้วตามมูลค่าผลกระทบ</span>
      </div>
      <div role="tablist" aria-label="กรองการแจ้งเตือน" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '12px 0 16px' }}>
        {ALERT_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={`tab ${tab === t.key ? 'tab-on' : ''}`}
            aria-selected={tab === t.key ? 'true' : 'false'}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="cnt">{t.count}</span>
          </button>
        ))}
      </div>

      {showAgent && <AgentSuggestion />}

      <ul className="equal-scroll" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map((a) => (
          <li key={a.drug} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0', borderTop: '1px solid #E2E8F0' }}>
            <span className={`sev ${a.sevCls}`} title={a.sevLabel}>
              <Icon name={a.icon as IconName} />
            </span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px' }}>
                <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{a.drug}</span>
                <span className={`ved ved-${a.ved}`} title={a.vedLabel}>{a.ved}</span>
                <span style={{ fontSize: 12, color: '#475569', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 6px', lineHeight: '18px' }}>
                  {a.typeLabel}
                </span>
              </div>
              <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2, color: a.msgCritical ? '#B91C1C' : '#475569' }}>
                {a.msg}
                {a.liveSecs !== undefined && (
                  <> – เหลือ <span className="num">{fmtTime(a.liveSecs - tick)}</span></>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
              <span style={{ fontSize: 12, lineHeight: '16px' }}>{a.time}</span>
              <button className={`btn btn-sm ${a.primary ? 'btn-p' : 'btn-s'}`}>{a.action}</button>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', borderTop: '1px solid #E2E8F0' }}>ไม่มีการแจ้งเตือนในหมวดนี้</div>
      )}
      <div className="equal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '12px 0', display: 'flex', justifyContent: 'center' }}>
        <a href="#" className="link">
          ดูการแจ้งเตือนทั้งหมด (<span className="num">14</span>)
        </a>
      </div>
    </div>
  );
}
