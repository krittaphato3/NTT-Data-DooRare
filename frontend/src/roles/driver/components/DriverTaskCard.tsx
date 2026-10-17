import { Icon } from '../../../components/common/icons';
import { fmtQty, HOSPITALS, STEP_ORDER, STEPS } from '../../warehouse/data/transport';
import type { Shipment, TransportStatus } from '../../warehouse/data/transport';
import { StatusBadge } from '../../warehouse/components/StatusBadge';

interface DriverTaskCardProps {
  shipment: Shipment;
  status: TransportStatus;
  pending: boolean;
  onOpenDetail: (id: string) => void;
  onDepart: (id: string) => void;
  onArriveWithPhoto: (id: string) => void;
}

export function DriverTaskCard({
  shipment: s,
  status,
  pending,
  onOpenDetail,
  onDepart,
  onArriveWithPhoto,
}: DriverTaskCardProps) {
  const idx = status === 'CANCELLED' ? -1 : STEP_ORDER.indexOf(status);

  return (
    <article
      className="card"
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Top Header: ID, Kind, Status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="rowbtn code"
              onClick={() => onOpenDetail(s.id)}
              style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8' }}
            >
              {s.id}
            </button>
            <span className={`badge ${s.kind === 'F1' ? 't-blue' : 't-teal'}`} style={{ height: 20, fontSize: 11.5 }}>
              {s.kind === 'F1' ? 'ยืม (F1)' : 'โอนยาใกล้หมดอายุ (F2)'}
            </span>
            {s.coldChain && (
              <span className="badge t-blue" style={{ height: 20, fontSize: 11.5 }} title="ควบคุมอุณหภูมิ 2-8°C">
                ❄️ Cold chain
              </span>
            )}
            {pending && (
              <span className="badge t-amber" style={{ height: 20, fontSize: 11.5 }}>
                <Icon name="sync" className="ic12" />
                รอซิงก์
              </span>
            )}
          </div>
          <div className="code" style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
            {s.ref}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Route & Cargo Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{HOSPITALS[s.from]}</span>
            <span style={{ color: '#94A3B8' }}>→</span>
            <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{HOSPITALS[s.to]}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0F2A5C' }}>{s.drug}</span>
            <div style={{ fontSize: 13, color: '#475569' }}>
              จำนวน: <b className="num" style={{ color: '#0F2A5C' }}>{fmtQty(s.qty)}</b> {s.unit} · ล็อต <span className="code">{s.lotCode}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
          <div>รูป {s.photos.length} / 10</div>
          <div className="num" style={{ fontSize: 11.5, color: '#94A3B8' }}>{s.updatedAt}</div>
        </div>
      </div>

      {/* Visual 5-step progress line */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, height: 6 }}>
          {STEP_ORDER.map((st, i) => {
            const isDone = i < idx || status === 'RECEIVED';
            const isCur = i === idx && status !== 'RECEIVED';
            const bg = status === 'CANCELLED' ? '#E2E8F0' : isDone ? '#1D4ED8' : isCur ? '#93C5FD' : '#E2E8F0';
            return <div key={st} style={{ flex: 1, borderRadius: 3, background: bg }} />;
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#475569' }}>
          <span>{status === 'CANCELLED' ? 'ยกเลิก' : `${idx + 1}/5 · ${STEPS[Math.max(0, idx)].label.split(' · ')[0]}`}</span>
          <span style={{ color: '#94A3B8' }}>{s.times[Math.max(0, idx)] || ''}</span>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
        <button className="btn btn-s btn-sm" onClick={() => onOpenDetail(s.id)}>
          ดูรายละเอียด
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          {status === 'WAITING_DISPATCH' && (
            <span className="badge t-grey" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }}>
              รอคลังโหลดของขึ้นรถ
            </span>
          )}

          {status === 'LOADED' && (
            <button className="btn btn-p btn-sm" onClick={() => onDepart(s.id)}>
              <Icon name="truck" />
              ออกเดินทาง
            </button>
          )}

          {status === 'IN_TRANSIT' && (
            <button className="btn btn-p btn-sm" onClick={() => onArriveWithPhoto(s.id)}>
              <Icon name="camera" />
              ถึงปลายทาง + รูป
            </button>
          )}

          {status === 'ARRIVED' && (
            <span className="badge t-green" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }}>
              <Icon name="check" className="ic14" />
              ถึงปลายทางแล้ว · รอคลังตรวจรับ
            </span>
          )}

          {status === 'RECEIVED' && (
            <span className="badge t-teal" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }}>
              <Icon name="checkc" className="ic14" />
              ส่งมอบเรียบร้อย
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
