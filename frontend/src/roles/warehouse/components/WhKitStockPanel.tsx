import { Icon } from '../../../components/common/icons';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { useKitStockLive } from '../../er/live/hooks';
import { KITS } from '../data/dashboard';
import { WhCta } from './WhCta';

function level(pct: number): { color: string; label: string; cls: string } {
  if (pct >= 80) return { color: '#166534', label: 'พร้อมใช้', cls: 't-green' };
  if (pct >= 50) return { color: '#D97706', label: 'ควรเติม', cls: 't-amber' };
  return { color: '#B91C1C', label: 'ต่ำ', cls: 't-red' };
}

/** Ready-set stock of the hospital from `GET /kit-stock` (view-only here; packing and counting happen on the kit page). */
function LiveKitStockPanel() {
  const { rows, source } = useKitStockLive();
  return (
    <div className="card cardpad" data-part="kit-stock" style={{ flex: '1 1 380px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          สต็อกเซ็ตพร้อมใช้ <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Ready kits</span>
        </h2>
        <span className="wh-readonly">
          <Icon name="eye" className="ic14" />
          ดูอย่างเดียว
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8' }}>{source === 'loading' ? 'กำลังโหลด…' : 'ไม่มีข้อมูล'}</div>}
        {rows.map((k) => (
          <div key={k.kitTypeId} className="wh-kit">
            <span style={{ fontSize: 14, color: '#0F2A5C', fontWeight: 500 }}>{k.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="num" style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 600 }}>
                {k.ready}
                {k.held > 0 && <span style={{ color: '#B45309', fontWeight: 400 }}> (จอง {k.held})</span>}
              </span>
              <span className={`badge ${k.free <= 0 ? 't-red' : k.free < 3 ? 't-amber' : 't-green'}`}>{k.free <= 0 ? 'ไม่ว่าง' : k.free < 3 ? 'ควรเติม' : 'พร้อมใช้'}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <WhCta page="kit" label="เตรียมชุดยา" />
      </div>
    </div>
  );
}

/** Ready-set stock for F3 patient kits (view-only here; packing happens on the kit page). Sample targets only in demo mode (`?mock=1`). */
export function WhKitStockPanel() {
  if (!mockFallbackEnabled()) return <LiveKitStockPanel />;
  return <MockKitStockPanel />;
}

function MockKitStockPanel() {
  return (
    <div className="card cardpad" data-part="kit-stock" style={{ flex: '1 1 380px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
          สต็อกเซ็ตพร้อมใช้ <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Ready kits</span>
        </h2>
        <span className="wh-readonly">
          <Icon name="eye" className="ic14" />
          ดูอย่างเดียว
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        {KITS.map((k) => {
          const pct = Math.round((k.ready / k.target) * 100);
          const lv = level(pct);
          return (
            <div key={k.key} className="wh-kit">
              <span style={{ fontSize: 14, color: '#0F2A5C', fontWeight: 500 }}>
                {k.th} <span className="en">{k.en}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="num" style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 600 }}>
                  {k.ready}/{k.target}
                </span>
                <span className={`badge ${lv.cls}`}>{lv.label}</span>
              </span>
              <div className="wh-bar" role="img" aria-label={`พร้อมใช้ ${pct}%`}>
                <span style={{ width: `${pct}%`, background: lv.color }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <WhCta page="kit" label="เตรียมชุดยา" />
      </div>
    </div>
  );
}
