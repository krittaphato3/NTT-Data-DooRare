import { Icon } from '../../../components/common/icons';
import { erHref } from '../data/navigation';

/** S7: no open incident. */
export function EmptyIncidentCard({ mayWrite }: { mayWrite: boolean }) {
  return (
    <div
      className="card"
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          background: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#16a34a',
        }}
      >
        <Icon name="checkc" className="ic24" />
      </div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f2a5c' }}>
        ไม่มีเหตุฉุกเฉินที่เปิดอยู่
      </h2>
      <div style={{ fontSize: 13, color: '#64748b' }}>
        ชุดพร้อมใช้: Trauma Set 30 · IV Set 12 · Intubation Set 0 (ต่ำกว่าเป้า)
      </div>
      <div style={{ marginTop: 8 }}>
        {mayWrite && (
          <a className="btn btn-p" style={{ background: '#b91c1c', border: 'none', fontWeight: 600, padding: '8px 20px' }} href={erHref('flow')}>
            <Icon name="siren" className="ic14" />
            + แจ้งเหตุใหม่
          </a>
        )}
      </div>
    </div>
  );
}
