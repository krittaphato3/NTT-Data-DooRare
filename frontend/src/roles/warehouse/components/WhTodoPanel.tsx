import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { TODO_TABS, TODOS } from '../data/dashboard';
import type { TodoGroup } from '../data/dashboard';
import { WhCta } from './WhCta';

/** "งานที่ต้องทำ" — same tabbed card pattern as the pharmacist alerts panel. */
export function WhTodoPanel({ urgentLeft }: { urgentLeft: string }) {
  const [tab, setTab] = useState<'all' | TodoGroup>('all');
  const count = (k: 'all' | TodoGroup) => (k === 'all' ? TODOS.length : TODOS.filter((t) => t.group === k).length);
  const rows = TODOS.filter((t) => tab === 'all' || t.group === tab);

  return (
    <div className="card cardpad" data-part="todo" style={{ flex: '3 1 560px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          งานที่ต้องทำ <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ To-do</span>
        </h2>
        <span style={{ fontSize: 12, lineHeight: '16px' }}>เรียงตาม: เร่งด่วนก่อน แล้วตามขั้นตอนขนส่ง</span>
      </div>
      <div role="tablist" aria-label="กรองงาน" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '12px 0 4px' }}>
        {TODO_TABS.map((t) => (
          <button key={t.key} role="tab" className={`tab ${tab === t.key ? 'tab-on' : ''}`} aria-selected={tab === t.key ? 'true' : 'false'} onClick={() => setTab(t.key)}>
            {t.label} <span className="cnt">{count(t.key)}</span>
          </button>
        ))}
      </div>
      <ul className="wh-todo">
        {rows.map((r) => (
          <li key={r.id}>
            <span className={`sev ${r.sevCls}`}>
              <Icon name={r.icon} className="ic20" />
            </span>
            <div className="wh-todo-main">
              <div className="wh-todo-title">{r.title}</div>
              <div className="wh-todo-detail">{r.detail}</div>
            </div>
            <div className="wh-todo-side">
              {r.urgent && (
                <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#B91C1C' }}>
                  <Icon name="clock" className="ic14" />
                  <span className="wh-timer">{urgentLeft}</span>
                </span>
              )}
              <span className={`badge t-${r.badge.tone}`}>{r.badge.label}</span>
              <WhCta page={r.cta.page} label={r.cta.label} primary={r.cta.primary} />
            </div>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12 }}>
        <Icon name="lock" className="ic14" />
        เห็นเฉพาะงานของ รพ.สมุทรปราการ · ยกเลิกงานขนส่งทำได้เฉพาะเภสัชกร
      </div>
    </div>
  );
}
