import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import {
  INITIAL_CONFIG_PARAMS,
  INITIAL_KILL_SWITCHES,
  type SystemConfigParam,
  type SystemKillSwitch,
} from '../data/adminData';

interface SystemConfigTabProps {
  onShowToast: (msg: string) => void;
}

export function SystemConfigTab({ onShowToast }: SystemConfigTabProps) {
  const [switches, setSwitches] = useState<SystemKillSwitch[]>(INITIAL_KILL_SWITCHES);
  const [params, setParams] = useState<SystemConfigParam[]>(INITIAL_CONFIG_PARAMS);
  const [confirmSwitch, setConfirmSwitch] = useState<SystemKillSwitch | null>(null);

  const handleToggleSwitch = (sw: SystemKillSwitch) => {
    // If turning OFF an emergency/safety switch, prompt confirmation
    if (sw.enabled) {
      setConfirmSwitch(sw);
    } else {
      applySwitchToggle(sw.id, true);
    }
  };

  const applySwitchToggle = (id: string, newEnabled: boolean) => {
    setSwitches((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              enabled: newEnabled,
              lastChanged: 'เพิ่งเปลี่ยนสถานะ (เดี๋ยวนี้)',
              changedBy: 'ดร.สมเกียรติ วิจิตรพงศ์',
            }
          : s,
      ),
    );
    const target = switches.find((s) => s.id === id);
    onShowToast(`สลับสถานะ Kill Switch "${target?.name}": ${newEnabled ? 'เปิดทำงาน' : 'ระงับการทำงาน (OFF)'}`);
    setConfirmSwitch(null);
  };

  const handleParamChange = (id: string, newVal: string) => {
    setParams((prev) =>
      prev.map((p) => (p.id === id ? { ...p, value: newVal } : p)),
    );
  };

  const handleSaveParams = (e: React.FormEvent) => {
    e.preventDefault();
    onShowToast('บันทึกค่ากำหนดระบบ (System Configuration) สำเร็จแล้ว');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* SECTION 1: SYSTEM KILL SWITCHES */}
      <div className="admin-section-card" style={{ borderLeft: '4px solid #DC2626' }}>
        <div className="admin-section-head">
          <div>
            <h2 className="admin-section-title" style={{ color: '#DC2626' }}>
              <Icon name="spark" style={{ width: 20, height: 20, color: '#DC2626' }} />
              สวิตช์ควบคุมฉุกเฉินระดับระบบ (System Emergency Kill Switches)
            </h2>
            <div className="admin-section-desc">
              ใช้สำหรับสั่งหยุดการทำงานของระบบย่อยแบบทันทีเมื่อเกิดเหตุขัดข้องหรือเหตุการณ์ความมั่นคงปลอดภัย
            </div>
          </div>
          <span className="admin-badge admin-badge-danger" style={{ padding: '6px 12px' }}>
            <Icon name="lock" style={{ width: 14, height: 14 }} />
            เฉพาะสิทธิ์ SYSTEM_ADMIN
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {switches.map((sw) => (
            <div
              key={sw.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: 10,
                background: sw.enabled ? '#FFFFFF' : '#FEF2F2',
                border: `1px solid ${sw.enabled ? '#E2E8F0' : '#FECACA'}`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ maxWidth: '80%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: sw.enabled ? '#0F2A5C' : '#991B1B',
                    }}
                  >
                    {sw.name}
                  </span>
                  <span
                    className={`admin-badge ${
                      sw.enabled ? 'admin-badge-success' : 'admin-badge-danger'
                    }`}
                  >
                    {sw.enabled ? 'ACTIVE (เปิดใช้งาน)' : 'DISABLED (ถูกระงับ)'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                  {sw.description}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                  เปลี่ยนแปลงล่าสุด: {sw.lastChanged} โดย {sw.changedBy}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className={`admin-btn ${
                    sw.enabled ? 'admin-btn-danger-outline' : 'admin-btn-primary'
                  }`}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                  onClick={() => handleToggleSwitch(sw)}
                >
                  {sw.enabled ? '🛑 ระงับการทำงาน (Kill)' : '✓ เปิดการทำงาน (Activate)'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: SYSTEM CONFIGURATION PARAMETERS */}
      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2 className="admin-section-title">
              <Icon name="gear" style={{ width: 18, height: 18, color: '#1E40AF' }} />
              ค่าพารามิเตอร์การทำงานส่วนกลาง (Global System Parameters)
            </h2>
            <div className="admin-section-desc">
              กำหนดเกณฑ์เวลาตอบรับ (Timeouts) และมาตรฐานความปลอดภัยทางยาของเขตสุขภาพที่ 6
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveParams}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {params.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#F8FAFC',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {p.description}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2 }}>
                    Key: {p.key}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  <input
                    type="text"
                    className="admin-form-input"
                    style={{ width: 100, textAlign: 'right', fontWeight: 600 }}
                    value={p.value}
                    onChange={(e) => handleParamChange(p.id, e.target.value)}
                  />
                  {p.unit && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', minWidth: 40 }}>
                      {p.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="submit" className="admin-btn admin-btn-primary" style={{ padding: '0 24px' }}>
                <Icon name="check" style={{ width: 16, height: 16 }} />
                บันทึกการเปลี่ยนแปลงทั้งหมด
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* CONFIRMATION MODAL FOR KILL SWITCH */}
      {confirmSwitch && (
        <div className="admin-modal-overlay" onClick={() => setConfirmSwitch(null)}>
          <div className="admin-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title" style={{ color: '#DC2626' }}>
                ยืนยันการใช้ Kill Switch
              </h3>
              <button
                type="button"
                className="admin-btn-icon"
                onClick={() => setConfirmSwitch(null)}
                style={{ border: 'none' }}
              >
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="admin-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#1E293B' }}>
                คุณกำลังจะระงับการทำงานของระบบ{' '}
                <strong>{confirmSwitch.name}</strong>
              </p>
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12,
                  color: '#991B1B',
                  marginTop: 10,
                }}
              >
                ⚠️ <strong>ผลกระทบ:</strong> การระงับสวิตช์นี้จะมีผลบังคับใช้ต่อทุกโรงพยาบาลในเขตสุขภาพที่ 6 ทันที และจะถูกบันทึกใน Audit Trail
              </div>
            </div>

            <div className="admin-modal-foot">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setConfirmSwitch(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ background: '#DC2626', borderColor: '#DC2626' }}
                onClick={() => applySwitchToggle(confirmSwitch.id, false)}
              >
                ยืนยันการระงับทันที (Kill)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
