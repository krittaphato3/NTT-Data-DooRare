import { useEffect, useRef, useState } from 'react';
import { USER } from '../../../data/session';
import { Icon } from '../../../components/common/icons';

interface PageHeaderProps {
  isAdmin: boolean;
  hospital: string;
  onHospital: (v: string) => void;
}

type DialogKind = null | 'create' | 'emergency';

const HOSPITALS = ['ทุกโรงพยาบาล (12)', 'โรงพยาบาลสมุทรปราการ', 'รพ.บางพลี', 'รพ.บางบ่อ'];
const DRUGS = ['Insulin Glargine pen', 'Adrenaline 1 mg/mL amp', 'Amlodipine 5 mg tab', 'Metformin 500 mg tab'];

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function DialogShell({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => { boxRef.current?.focus(); }, []);
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,42,92,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="card dialog"
      >
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = { height: 36, border: '1px solid #94A3B8', borderRadius: 8, padding: '0 10px', font: 'inherit', color: '#0F2A5C', background: '#FFFFFF', width: '100%' };

export function PageHeader({ isAdmin, hospital, onHospital }: PageHeaderProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [sent, setSent] = useState(false);
  const roleTh = isAdmin ? 'ผู้ดูแลระบบ (Admin)' : USER.roleTh;

  const open = (k: Exclude<DialogKind, null>) => { setSent(false); setDialog(k); };

  return (
    <section className="pagehead" data-part="page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: '40px', fontWeight: 600, color: '#0F2A5C' }}>
          ภาพรวม <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8' }}>/ Dashboard</span>
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginTop: 2 }}>
          <span>
            สวัสดี <strong style={{ color: '#0F2A5C', fontWeight: 600 }}>{USER.name}</strong> · {roleTh}
          </span>
          <span style={{ color: '#CBD5E1' }} aria-hidden="true">
            |
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" />
            วันอังคารที่ 13 ตุลาคม 2569 · <span className="num">19:11</span> น.
          </span>
          {isAdmin && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              โรงพยาบาล
              <select aria-label="กรองโรงพยาบาล / Hospital filter" value={hospital} onChange={(e) => onHospital(e.target.value)} style={{ height: 32, border: '1px solid #94A3B8', borderRadius: 8, padding: '0 8px', font: 'inherit', color: '#0F2A5C', background: '#FFFFFF' }}>
                {HOSPITALS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="pagehead-actions">
        <button className="btn btn-s" onClick={() => open('emergency')}>
          <Icon name="siren" />
          รายงานเหตุฉุกเฉิน <span className="label-en" style={{ fontWeight: 400, opacity: 0.8 }}>Report Emergency</span>
        </button>
        <button className="btn btn-p" onClick={() => open('create')}>
          <Icon name="plus" />
          สร้างคำขอยืม <span className="label-en" style={{ fontWeight: 400, opacity: 0.85 }}>Create Request</span>
        </button>
      </div>

      {dialog !== null && (
        <DialogShell label={dialog === 'create' ? 'สร้างคำขอยืม / Create Request' : 'รายงานเหตุฉุกเฉิน / Report Emergency'} onClose={() => setDialog(null)}>
          {!sent ? (
            <form
              onSubmit={(e) => { e.preventDefault(); setSent(true); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F2A5C' }}>
                {dialog === 'create' ? 'สร้างคำขอยืม' : 'รายงานเหตุฉุกเฉิน'} <span className="en">{dialog === 'create' ? 'Create Request' : 'Report Emergency'}</span>
              </h2>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                ยา / เวชภัณฑ์
                <select aria-label="ยา / เวชภัณฑ์" style={fieldStyle} defaultValue={DRUGS[0]}>
                  {DRUGS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                จำนวน
                <input aria-label="จำนวน" type="number" min={1} defaultValue={20} style={fieldStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                {dialog === 'create' ? 'โรงพยาบาลผู้ให้ยืม' : 'สถานที่เกิดเหตุ'}
                <select aria-label={dialog === 'create' ? 'โรงพยาบาลผู้ให้ยืม' : 'สถานที่เกิดเหตุ'} style={fieldStyle} defaultValue="รพ.บางพลี">
                  <option>รพ.บางพลี</option>
                  <option>รพ.บางบ่อ</option>
                  <option>รพ.บางเสาธง</option>
                  <option>รพ.พระสมุทรเจดีย์สวาทยานนท์</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-g btn-sm" onClick={() => setDialog(null)}>ยกเลิก</button>
                <button type="submit" className="btn btn-p btn-sm">{dialog === 'create' ? 'ส่งคำขอ' : 'รายงาน'}</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
                <Icon name="checkc" />
                {dialog === 'create' ? 'ส่งคำขอแล้ว #REQ-1057 · รอโรงพยาบาลผู้ให้ยืมตอบรับ' : 'รับรายงานเหตุฉุกเฉินแล้ว · ศูนย์ประสานยา เขต 6 รับทราบ'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-s btn-sm" onClick={() => setDialog(null)}>ปิด</button>
              </div>
            </div>
          )}
        </DialogShell>
      )}
    </section>
  );
}
