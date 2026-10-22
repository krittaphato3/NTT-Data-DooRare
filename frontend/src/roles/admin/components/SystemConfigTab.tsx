import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { INITIAL_KILL_SWITCHES, type SystemKillSwitch } from '../data/adminData';
import { killSwitch, listAllConfig, updateConfig, type ApiConfigItem } from '../../../services/adminApi';
import { CONFIG_SECTIONS } from '../../hospital-admin/data/config';

interface SystemConfigTabProps {
  onShowToast: (msg: string) => void;
}

/** Thai labels from the shared mock catalogue (fallback = API `description`). */
const LABEL_MAP = (() => {
  const m = new Map<string, string>();
  for (const s of CONFIG_SECTIONS) for (const k of s.keys) m.set(k.key, k.labelTh);
  return m;
})();

function invalidForItem(item: ApiConfigItem, draft: string | undefined): string {
  if (draft === undefined) return '';
  if (item.type === 'number') {
    const raw = draft.trim();
    if (raw === '') return 'กรุณากรอกค่า';
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'ต้องเป็นตัวเลข';
    if (item.min !== undefined && n < item.min) return `ต้องไม่น้อยกว่า ${item.min}`;
    if (item.max !== undefined && n > item.max) return `ต้องไม่เกิน ${item.max}`;
  }
  if (item.type === 'text' && draft.trim() === '') return 'ห้ามว่าง';
  return '';
}

export function SystemConfigTab({ onShowToast }: SystemConfigTabProps) {
  const [switches, setSwitches] = useState<SystemKillSwitch[]>(INITIAL_KILL_SWITCHES);
  const [confirmSwitch, setConfirmSwitch] = useState<SystemKillSwitch | null>(null);
  const [reason, setReason] = useState('');

  // Config (SYSTEM_ADMIN) — GET /config + per-key PUT /config/{key}.
  const [cfgItems, setCfgItems] = useState<ApiConfigItem[]>([]);
  const [cfgDrafts, setCfgDrafts] = useState<Record<string, string>>({});
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgError, setCfgError] = useState('');
  const [cfgConflictKey, setCfgConflictKey] = useState<string | null>(null);
  const [cfgSearch, setCfgSearch] = useState('');
  const [pendingCfg, setPendingCfg] = useState<{ item: ApiConfigItem; next: string } | null>(null);
  const [cfgReason, setCfgReason] = useState('');

  // Only KS-01 (AI Agent Auto-Matching = agent.enabled GLOBAL kill switch, API-AD-004) is wired.
  const AGENT_SWITCH_ID = 'KS-01';

  const loadCfg = async () => {
    setCfgLoading(true);
    setCfgError('');
    try {
      const items = await listAllConfig();
      setCfgItems(items);
    } catch (e: any) {
      setCfgError(e?.message || 'ไม่สามารถโหลดค่าตั้งค่าระบบได้');
    } finally {
      setCfgLoading(false);
    }
  };

  useEffect(() => {
    loadCfg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleSwitch = (sw: SystemKillSwitch) => {
    if (sw.id !== AGENT_SWITCH_ID) {
      onShowToast('ยังไม่รองรับ');
      return;
    }
    setReason('');
    setConfirmSwitch(sw);
  };

  const applySwitchToggle = async (id: string, newEnabled: boolean) => {
    if (id === AGENT_SWITCH_ID) {
      try {
        const res = await killSwitch({ enabled: newEnabled, reason });
        setSwitches((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  enabled: res.data.enabled,
                  lastChanged: new Date(res.data.updatedAt).toLocaleString('th-TH'),
                  changedBy: res.data.updatedBy?.name || 'SYSTEM_ADMIN',
                }
              : s,
          ),
        );
        onShowToast(`สลับสถานะ Kill Switch "Agent Service": ${newEnabled ? 'เปิดทำงาน' : 'ระงับการทำงาน (OFF)'}`);
        setConfirmSwitch(null);
        setReason('');
        return;
      } catch (e: any) {
        onShowToast(e?.message || 'เกิดข้อผิดพลาด');
        setConfirmSwitch(null);
        setReason('');
        return;
      }
    }
    setConfirmSwitch(null);
  };

  const cfgLabel = (item: ApiConfigItem) => LABEL_MAP.get(item.key) ?? item.description;

  const requestCfgSave = (item: ApiConfigItem) => {
    const draft = cfgDrafts[item.key];
    const next = draft !== undefined ? draft.trim() : String(item.value);
    if (invalidForItem(item, next)) return;
    setCfgError('');
    setCfgReason('');
    setPendingCfg({ item, next });
  };

  const commitCfg = async () => {
    if (!pendingCfg) return;
    const { item, next } = pendingCfg;
    const parsed = item.type === 'number' ? Number(next) : item.type === 'boolean' ? next === 'true' : next;
    // If-Match = the row's updatedAt exactly as returned by GET (SA writes at GLOBAL scope).
    const ifMatch = item.updatedAt && item.updatedAt !== '—' ? item.updatedAt : undefined;
    try {
      await updateConfig(item.key, { value: parsed, reason: cfgReason }, ifMatch);
      setCfgDrafts((d) => {
        const c = { ...d };
        delete c[item.key];
        return c;
      });
      setPendingCfg(null);
      setCfgReason('');
      setCfgConflictKey(null);
      onShowToast(`บันทึก ${item.key} แล้ว · เหตุผลถูกบันทึกใน audit log`);
      await loadCfg();
      return;
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === 'VERSION_CONFLICT') {
        setCfgConflictKey(item.key);
        setCfgError('ค่าถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชค่าปัจจุบันก่อนแก้ไข');
      } else if (code === 'CONFIG_READ_ONLY') {
        setCfgError(e?.message || 'คีย์นี้อ่านอย่างเดียว');
      } else if (code === 'FORBIDDEN') {
        setCfgError(e?.message || 'ไม่มีสิทธิ์แก้ไขคีย์นี้');
      } else if (code === 'VALIDATION') {
        setCfgError(e?.message || 'ค่าไม่ถูกต้อง');
      } else {
        setCfgError(e?.message || 'เกิดข้อผิดพลาด');
      }
      onShowToast(e?.message || 'เกิดข้อผิดพลาด');
      setPendingCfg(null);
      setCfgReason('');
    }
  };

  const reloadConflicted = async () => {
    if (cfgConflictKey) {
      setCfgDrafts((d) => {
        const c = { ...d };
        delete c[cfgConflictKey];
        return c;
      });
    }
    setCfgConflictKey(null);
    setCfgError('');
    await loadCfg();
  };

  const search = cfgSearch.trim().toLowerCase();
  const shownItems = search
    ? cfgItems.filter((i) => i.key.toLowerCase().includes(search) || cfgLabel(i).toLowerCase().includes(search))
    : cfgItems;
  const fallbackCount = cfgItems.filter((i) => !LABEL_MAP.has(i.key)).length;

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
                {sw.id === AGENT_SWITCH_ID ? (
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
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    style={{
                      height: 38,
                      padding: '0 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                    disabled
                    title="ยังไม่รองรับ"
                  >
                    ยังไม่รองรับ
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: SYSTEM CONFIGURATION PARAMETERS (GET /config, GLOBAL scope for SA) */}
      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2 className="admin-section-title">
              <Icon name="gear" style={{ width: 18, height: 18, color: '#1E40AF' }} />
              ค่าพารามิเตอร์การทำงานส่วนกลาง (Global System Parameters)
            </h2>
            <div className="admin-section-desc">
              ค่าตั้งค่าระบบระดับส่วนกลาง ({cfgItems.length} คีย์ · ใช้ป้ายชื่อเดิม {cfgItems.length - fallbackCount} · ใช้คำอธิบาย API เป็นป้ายชื่อสำรอง {fallbackCount})
            </div>
          </div>
          <span className="admin-badge" style={{ padding: '6px 12px' }}>
            <Icon name="lock" style={{ width: 14, height: 14 }} />
            GLOBAL · เฉพาะสิทธิ์ SYSTEM_ADMIN
          </span>
        </div>

        {cfgError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 12,
            }}
            role="alert"
          >
            <span style={{ flex: 1 }}>{cfgError}</span>
            {cfgConflictKey && (
              <button className="admin-btn admin-btn-secondary" style={{ height: 30 }} onClick={reloadConflicted}>
                โหลดค่าปัจจุบัน
              </button>
            )}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input
            type="search"
            className="admin-form-input"
            style={{ width: '100%', maxWidth: 360 }}
            placeholder="ค้นหาคีย์หรือชื่อค่าตั้งค่า"
            aria-label="ค้นหาค่าตั้งค่า"
            value={cfgSearch}
            onChange={(e) => setCfgSearch(e.target.value)}
          />
        </div>

        {cfgLoading ? (
          <div aria-busy="true" aria-label="กำลังโหลดค่าตั้งค่า">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="ha-skel-row" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shownItems.map((item) => {
              const label = cfgLabel(item);
              const draft = cfgDrafts[item.key];
              const shown = draft !== undefined ? draft : String(item.value);
              const invalid = invalidForItem(item, draft);
              const dirty = draft !== undefined && draft !== String(item.value);
              const readOnly = item.readOnly || !item.editable;
              const blockedReason = item.readOnly
                ? item.readOnlyReason ?? 'อ่านอย่างเดียว'
                : 'กลุ่มนี้ต้องเป็น SYSTEM_ADMIN (§23)';
              return (
                <div
                  key={item.key}
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>
                      {label}
                      {item.readOnly && (
                        <span className="admin-badge admin-badge-danger" style={{ marginLeft: 8, padding: '2px 8px' }}>
                          อ่านอย่างเดียว
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.description}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2 }}>
                      Key: {item.key} · scope {item.scope}
                    </div>
                    {item.readOnly && item.readOnlyReason && (
                      <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>{item.readOnlyReason}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {readOnly ? (
                      <span
                        className="num"
                        style={{ fontWeight: 600, color: '#475569', background: '#EEF2F7', padding: '6px 10px', borderRadius: 6 }}
                        title={blockedReason}
                      >
                        {String(item.value)}
                      </span>
                    ) : (
                      <input
                        type={item.type === 'number' ? 'number' : 'text'}
                        className="admin-form-input"
                        style={{ width: 110, textAlign: 'right', fontWeight: 600, ...(invalid ? { borderColor: '#DC2626' } : {}) }}
                        value={shown}
                        aria-label={label}
                        aria-invalid={invalid ? true : undefined}
                        onChange={(e) => setCfgDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                      />
                    )}
                    {item.unit && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', minWidth: 40 }}>
                        {item.unit}
                      </span>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        className={`admin-btn ${dirty && !invalid ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                        style={{ height: 34, padding: '0 14px' }}
                        disabled={!dirty || Boolean(invalid)}
                        title={dirty ? 'บันทึกพร้อมเหตุผล' : 'ยังไม่มีการเปลี่ยนแปลง'}
                        onClick={() => requestCfgSave(item)}
                      >
                        บันทึก
                      </button>
                    )}
                    {invalid && <span style={{ color: '#DC2626', fontSize: 12 }}>{invalid}</span>}
                  </div>
                </div>
              );
            })}
            {shownItems.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 13 }}>ไม่พบค่าตั้งค่าที่ตรงกับการค้นหา</div>
            )}
          </div>
        )}
      </div>

      {/* REASON MODAL FOR CONFIG SAVE */}
      {pendingCfg && (
        <div className="admin-modal-overlay" onClick={() => setPendingCfg(null)}>
          <div className="admin-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3 className="admin-modal-title" style={{ color: '#1E40AF' }}>
                ยืนยันการแก้ไขค่าตั้งค่า
              </h3>
              <button type="button" className="admin-btn-icon" onClick={() => setPendingCfg(null)} style={{ border: 'none' }}>
                <Icon name="x" style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#1E293B' }}>
                คีย์ <strong style={{ fontFamily: 'monospace' }}>{pendingCfg.item.key}</strong> (GLOBAL)
              </p>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <span className="num">{String(pendingCfg.item.value)}</span> →{' '}
                <span className="num" style={{ fontWeight: 700 }}>{pendingCfg.next}</span>
                {pendingCfg.item.unit ? ` ${pendingCfg.item.unit}` : ''}
              </div>
              <div style={{ marginTop: 14 }}>
                <label htmlFor="cfg-reason" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#0F2A5C' }}>
                  เหตุผล · Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  id="cfg-reason"
                  className="admin-form-input"
                  style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
                  value={cfgReason}
                  onChange={(e) => setCfgReason(e.target.value)}
                  placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log ตาม SEC-003"
                />
              </div>
            </div>
            <div className="admin-modal-foot">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setPendingCfg(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={!cfgReason.trim()}
                onClick={commitCfg}
              >
                ยืนยันบันทึก
              </button>
            </div>
          </div>
        </div>
      )}

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
                คุณกำลังจะ{confirmSwitch.enabled ? 'ระงับการทำงาน' : 'เปิดการทำงาน'}ของระบบ{' '}
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
                ⚠️ <strong>ผลกระทบ:</strong> การ{confirmSwitch.enabled ? 'ระงับ' : 'เปิด'}สวิตช์นี้จะมีผลบังคับใช้ต่อทุกโรงพยาบาลในเขตสุขภาพที่ 6 ทันที และจะถูกบันทึกใน Audit Trail
              </div>
              <div style={{ marginTop: 14 }}>
                <label
                  htmlFor="ks-reason"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#0F2A5C' }}
                >
                  เหตุผล · Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  id="ks-reason"
                  className="admin-form-input"
                  style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log ตาม SEC-003"
                />
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
                disabled={!reason.trim()}
                onClick={() => applySwitchToggle(confirmSwitch.id, !confirmSwitch.enabled)}
              >
                {confirmSwitch.enabled ? 'ยืนยันการระงับทันที (Kill)' : 'ยืนยันการเปิดใช้งาน (Activate)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
