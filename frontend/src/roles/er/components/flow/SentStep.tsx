import { Icon } from '../../../../components/common/icons';
import type { SentBatch } from '../../data/incidentStore';
import { groupBatchesByHospital } from '../../data/borrowView';

interface SentStepProps {
  batches: SentBatch[];
  trackHref: string;
  onNew: () => void;
}

/** Step 5: everything sent, by hospital. Follow-up (replies, kit assembly) continues on the tracking page. */
export function SentStep({ batches, trackHref, onNew }: SentStepProps) {
  const groups = groupBatchesByHospital(batches);
  return (
    <div className="card" style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }} role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
          <Icon name="checkc" className="ic24" />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f2a5c' }}>ส่งคำขอยืมเร่งด่วนแล้ว · {groups.length} โรงพยาบาล</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>รอผู้ให้ยืมตอบ · ข้อมูลทดลอง ไม่ได้บันทึกเข้าระบบ</div>
        </div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: '22px' }}>
        {groups.map((g) => (
          <li key={g.hospital}>
            <b>{g.hospital}</b> ({g.sentAt} น.): {g.items.map((i) => `${i.item} × ${i.qty} ${i.unit}`).join(', ')}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn-p" style={{ fontWeight: 600 }} href={trackHref}>
          ติดตามคำขอและจัดชุด →
        </a>
        <button type="button" className="btn btn-s" onClick={onNew}>
          แจ้งเหตุใหม่
        </button>
      </div>
    </div>
  );
}
