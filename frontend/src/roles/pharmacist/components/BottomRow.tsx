import { ACTIVITY } from '../data/dashboard';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';

export function BottomRow() {
  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <div className="card cardpad" data-part="recent-activity" style={{ flex: '1 1 100%', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            กิจกรรมล่าสุด <span className="en">Recent Activity · ทั้งเครือข่ายที่เกี่ยวกับ รพ.ของคุณ</span>
          </h3>
          <a href="#" className="link">ดูทั้งหมด</a>
        </div>
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {ACTIVITY.map((v) => (
            <li key={v.time + v.who} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                <span className={`av ${v.cls}`}>
                  <Icon name={v.icon as IconName} />
                </span>
                <span style={{ flex: '1 1 auto', width: 1, background: '#E2E8F0', marginTop: 4, minHeight: 10 }} />
              </span>
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 12px', paddingTop: 5 }}>
                <div style={{ minWidth: 0, flex: '1 1 300px' }}>
                  <span style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>
                    <strong style={{ fontWeight: 600 }}>{v.who}</strong> {v.text}
                  </span>
                  {v.tag !== '' && (
                    <span className={`badge ${v.tagCls}`} style={{ height: 20, marginLeft: 4 }}>
                      {v.tag}
                    </span>
                  )}
                </div>
                <span className="num" style={{ fontSize: 12, lineHeight: '20px', flex: 'none' }}>
                  {v.time}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

    </section>
  );
}
