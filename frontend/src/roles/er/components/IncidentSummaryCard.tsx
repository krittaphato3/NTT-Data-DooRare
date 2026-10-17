import { Icon } from '../../../components/common/icons';
import { fmtTime, useTick } from '../../../lib/time';
import { INCIDENT_HEADER } from '../data/incident';

/** Active incident card: description, ETA countdown and triage counts. */
export function IncidentSummaryCard({ mayWrite, onEditTriage }: { mayWrite: boolean; onEditTriage: () => void }) {
  const tick = useTick();
  const etaLeft = Math.max(0, INCIDENT_HEADER.etaMinutes - tick);

  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      {/* Left Side: Detail & Quote */}
      <div style={{ flex: '1 1 450px', minWidth: 280 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontFamily: 'Inter, monospace', fontSize: 13, fontWeight: 700, color: '#0f2a5c' }}>
            {INCIDENT_HEADER.id}
          </span>
          <span className="badge st-pending">
            <Icon name="siren" className="ic12" />
            {INCIDENT_HEADER.statusLabel}
          </span>
          <span className="badge t-grey code">{INCIDENT_HEADER.activePlan}</span>
          <span className="badge st-approved">
            <Icon name="checkc" className="ic12" />
            ไม่พบเหตุดิบ
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f2a5c', lineHeight: '28px' }}>
          {INCIDENT_HEADER.title} · {INCIDENT_HEADER.location}
        </h2>
        <div
          style={{
            margin: '8px 0',
            padding: '6px 12px',
            borderLeft: '3px solid #cbd5e1',
            color: '#334155',
            fontSize: 13,
            lineHeight: '19px',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{INCIDENT_HEADER.quote}&rdquo;
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b' }}>
          แจ้งโดย {INCIDENT_HEADER.reporter} - {INCIDENT_HEADER.reportTime} · ไม่บันทึกข้อมูลระบุตัวผู้ป่วย นับเป็นจำนวนตามระดับคัดแยกเท่านั้น
        </div>
      </div>

      {/* Right Side: 3 Info Boxes */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* Box 1: ETA Timer */}
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: 10,
            padding: '10px 14px',
            textAlign: 'center',
            minWidth: 150,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 11.5, color: '#be123c', fontWeight: 600 }}>
            ผู้ป่วยถึงโรงพยาบาลใน
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#e11d48',
              fontFamily: 'Inter, monospace',
              margin: '2px 0',
            }}
          >
            {fmtTime(etaLeft)}
          </div>
          <div style={{ fontSize: 11, color: '#9f1239' }}>ถึงประมาณ {INCIDENT_HEADER.etaTimeStr}</div>
          <div style={{ fontSize: 10, color: '#fda4af', marginTop: 2 }}>{INCIDENT_HEADER.etaDesc}</div>
        </div>

        {/* Box 2: Triage levels */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '10px 14px',
            minWidth: 220,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11.5, color: '#0f2a5c', fontWeight: 600 }}>
              ผู้ป่วยตามระดับคัดแยก
            </span>
            {mayWrite && (
              <button
                className="link"
                style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => onEditTriage()}
              >
                แก้จำนวนผู้ป่วย
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              style={{
                flex: 1,
                background: '#fee2e2',
                borderRadius: 6,
                padding: '6px 4px',
                textAlign: 'center',
                color: '#b91c1c',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 600 }}>แดง</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {INCIDENT_HEADER.triage.red}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#fef3c7',
                borderRadius: 6,
                padding: '6px 4px',
                textAlign: 'center',
                color: '#b45309',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 600 }}>เหลือง</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {INCIDENT_HEADER.triage.yellow}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#dcfce7',
                borderRadius: 6,
                padding: '6px 4px',
                textAlign: 'center',
                color: '#15803d',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 600 }}>เขียว</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {INCIDENT_HEADER.triage.green}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#f1f5f9',
                borderRadius: 6,
                padding: '6px 4px',
                textAlign: 'center',
                color: '#334155',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 600 }}>ดำ</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {INCIDENT_HEADER.triage.black}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
            {INCIDENT_HEADER.triage.lastUpdate}
          </div>
        </div>
      </div>
    </div>
  );
}
