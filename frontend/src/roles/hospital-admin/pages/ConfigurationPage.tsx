import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { HOSPITAL_ADMIN_HOME_HREF } from '../../../data/navigation';
import { can, HOSPITAL_ADMIN_ROLE, isRestrictedConfigKey, ROLE_LABEL } from '../../../lib/rbac';
import { ConfigGroupCard } from '../components/ConfigGroupCard';
import { ConfigHistoryList } from '../components/ConfigHistoryList';
import { Modal } from '../components/Modal';
import { ReasonDialog } from '../components/ReasonDialog';
import { CONFIG_DRUGS, CONFIG_HISTORY, CONFIG_SECTIONS, SCOPE_FILTERS } from '../data/config';
import type { ConfigChange, ConfigDrugRow, ConfigKey, ConfigScope, ConfigValue, VedCode } from '../data/config';
import { HOSPITAL_ADMIN_USER } from '../data/session';
import '../admin.css';

type Tab = 'settings' | 'drugs';

interface PendingConfigSave {
  kind: 'config';
  row: ConfigKey;
  next: ConfigValue;
}
interface PendingDrugSave {
  kind: 'drug';
  row: ConfigDrugRow;
  ved: VedCode;
  days: number;
}
type Pending = PendingConfigSave | PendingDrugSave;

interface DrugDraft {
  ved: VedCode;
  days: string;
}

const VED_OPTIONS: VedCode[] = ['V', 'E', 'D'];
/** Mock "now" for locally recorded mock changes (the dashboard uses Thai short Buddhist dates). */
const NOW = '13 ต.ค. 69 09:10';

/**
 * Configuration · Kill switch (UI-17). Endpoints it will call when wired:
 * API-AD-001 `GET /config`, API-AD-002 `PUT /config/{key}` (audited, reason required),
 * and the per-drug editor API-F1a-004 `PATCH /hospital-drugs/{id}/classification`.
 *
 * Access: HOSPITAL_ADMIN writes at HOSPITAL scope only, plus the §23 rule that
 * `borrow.score.*`, `ved.z.*` and `agent.*` need REGION_ADMIN or above. REGION/GLOBAL rows and the
 * kill switch are read-only here. Every permission answer comes from `can()` in lib/rbac.ts.
 */
export function ConfigurationPage() {
  const [tab, setTab] = useState<Tab>('settings');
  const [scopeFilter, setScopeFilter] = useState<ConfigScope | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [history, setHistory] = useState<{ key?: string } | null>(null);

  const [values, setValues] = useState<Record<string, ConfigValue>>(() => {
    const initial: Record<string, ConfigValue> = {};
    for (const section of CONFIG_SECTIONS) for (const k of section.keys) initial[k.key] = k.value;
    return initial;
  });
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>({});
  const [changes, setChanges] = useState<ConfigChange[]>(CONFIG_HISTORY);
  const [drugs, setDrugs] = useState<ConfigDrugRow[]>(CONFIG_DRUGS);
  const [drugDrafts, setDrugDrafts] = useState<Record<string, DrugDraft>>({});

  // ---- permissions (single source: lib/rbac.ts) ----
  const mayConfigure = can(HOSPITAL_ADMIN_ROLE, 'configureRules');
  const mayConfigureRestricted = can(HOSPITAL_ADMIN_ROLE, 'configureRestrictedRules');

  /** `configureRules` means "may configure at own scope" (spec §5.2 grants HOSPITAL_ADMIN own scope). */
  const editableFor = (row: ConfigKey) =>
    mayConfigure && row.scope === 'HOSPITAL' && (!isRestrictedConfigKey(row.key) || mayConfigureRestricted);

  /** Why a value cannot be written — always names the scope or the role that would be required. */
  const scopeBlockedReason = (scope: ConfigScope, key: string): string => {
    if (!mayConfigure) return `ต้องเป็น ${ROLE_LABEL.HOSPITAL_ADMIN} ขึ้นไป`;
    if (scope === 'REGION') return `ค่าขอบเขตเขตสุขภาพ — ต้องเป็น ${ROLE_LABEL.REGION_ADMIN} ขึ้นไป`;
    if (scope === 'GLOBAL') return `ค่าส่วนกลาง — ต้องเป็น ${ROLE_LABEL.SYSTEM_ADMIN}`;
    if (isRestrictedConfigKey(key)) return `คีย์กลุ่มนี้ (§23) — ต้องเป็น ${ROLE_LABEL.REGION_ADMIN} ขึ้นไป`;
    return 'อ่านอย่างเดียว';
  };

  const blockedReason = (row: ConfigKey): string => scopeBlockedReason(row.scope, row.key);

  const killSwitchReason = `สวิตช์นี้เปลี่ยนได้เฉพาะ ${ROLE_LABEL.SYSTEM_ADMIN} หรือ ${ROLE_LABEL.REGION_ADMIN} (API-AD-004) — ผู้ดูแลโรงพยาบาลดูได้อย่างเดียว`;

  const invalidFor = (row: ConfigKey, draft: string | boolean | undefined): string => {
    if (draft === undefined || typeof draft === 'boolean') return '';
    const raw = draft.trim();
    if (raw === '') return 'กรุณากรอกค่า';
    if (row.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'ต้องเป็นตัวเลข';
      if (row.min !== undefined && n < row.min) return `ต้องไม่น้อยกว่า ${row.min}`;
      if (row.max !== undefined && n > row.max) return `ต้องไม่เกิน ${row.max}`;
    }
    return '';
  };

  const parseValue = (row: ConfigKey, draft: string | boolean): ConfigValue => {
    if (typeof draft === 'boolean') return draft;
    const raw = draft.trim();
    return row.type === 'number' ? Number(raw) : raw;
  };

  /** Rules that span two keys — checked before the confirm dialog opens, reported in the banner. */
  const crossError = (row: ConfigKey, next: ConfigValue): string => {
    if (row.key === 'abc.cutoff_a' && Number(next) >= Number(values['abc.cutoff_b'])) {
      return 'จุดตัด ABC ระดับ A ต้องน้อยกว่าจุดตัดระดับ B';
    }
    if (row.key === 'forecast.price_low_thb' && Number(next) > Number(values['forecast.price_high_thb'])) {
      return 'เกณฑ์ราคาต่ำต้องไม่เกินเกณฑ์ราคาสูง';
    }
    return '';
  };

  const scopeCounts = (() => {
    const counts: Record<ConfigScope | 'ALL', number> = { ALL: 0, HOSPITAL: 0, REGION: 0, GLOBAL: 0 };
    for (const section of CONFIG_SECTIONS) {
      for (const k of section.keys) {
        counts[k.scope] += 1;
        counts.ALL += 1;
      }
    }
    return counts;
  })();

  const dirtyCount = Object.keys(drafts).length + Object.keys(drugDrafts).length;

  const refresh = () => {
    setError('');
    setLoading(true);
    window.setTimeout(() => setLoading(false), 600);
  };

  const requestConfigSave = (row: ConfigKey) => {
    const draft = drafts[row.key];
    if (draft === undefined) return;
    if (invalidFor(row, draft)) return;
    const next = parseValue(row, draft);
    const conflict = crossError(row, next);
    if (conflict) {
      setError(`${conflict} — ยังไม่บันทึก ${row.key}`);
      setNotice('');
      return;
    }
    setError('');
    setPending({ kind: 'config', row, next });
  };

  const applyPending = (reason: string) => {
    if (!pending) return;

    if (pending.kind === 'config') {
      const { row, next } = pending;
      const before = String(values[row.key] ?? row.value);
      setValues((v) => ({ ...v, [row.key]: next }));
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[row.key];
        return copy;
      });
      setChanges((c) => [
        {
          at: NOW, key: row.key, scope: row.scope, from: before, to: String(next),
          actor: HOSPITAL_ADMIN_USER.name, role: HOSPITAL_ADMIN_ROLE, reason,
        },
        ...c,
      ]);
      setNotice(`บันทึก ${row.key} แล้ว (ตัวอย่าง) · เหตุผลถูกบันทึกใน audit log`);
    } else {
      const { row, ved, days } = pending;
      setDrugs((list) => list.map((d) => (d.id === row.id ? { ...d, ved, expiryThresholdDays: days, updatedBy: HOSPITAL_ADMIN_USER.name, updatedAt: NOW } : d)));
      setDrugDrafts((d) => {
        const copy = { ...d };
        delete copy[row.id];
        return copy;
      });
      setChanges((c) => [
        {
          at: NOW, key: `hospital_drug.${row.code}.classification`, scope: 'HOSPITAL',
          from: `${row.ved} / ${row.expiryThresholdDays} วัน`, to: `${ved} / ${days} วัน`,
          actor: HOSPITAL_ADMIN_USER.name, role: HOSPITAL_ADMIN_ROLE, reason,
        },
        ...c,
      ]);
      setNotice(`บันทึกการจัดกลุ่ม ${row.name} แล้ว (ตัวอย่าง) · เหตุผลถูกบันทึกใน audit log`);
    }

    setError('');
    setPending(null);
  };

  const pendingDetail = () => {
    if (!pending) return null;
    if (pending.kind === 'config') {
      const current = values[pending.row.key] ?? pending.row.value;
      return (
        <>
          <div>
            คีย์ <span className="code">{pending.row.key}</span> · ขอบเขต{' '}
            <strong>{pending.row.scope}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="num">{String(current)}</span> → <span className="num" style={{ fontWeight: 600 }}>{String(pending.next)}</span>
            {pending.row.unit ? ` ${pending.row.unit}` : ''}
          </div>
        </>
      );
    }
    return (
      <>
        <div>
          ยา <strong>{pending.row.name}</strong> · <span className="code">{pending.row.code}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          VED <span className="num">{pending.row.ved}</span> → <span className="num" style={{ fontWeight: 600 }}>{pending.ved}</span> · เกณฑ์หมดอายุ{' '}
          <span className="num">{pending.row.expiryThresholdDays}</span> → <span className="num" style={{ fontWeight: 600 }}>{pending.days}</span> วัน
        </div>
      </>
    );
  };

  const killSwitchOn = Boolean(values['agent.enabled']);

  return (
    <>
      <section className="pagehead" data-part="page-header">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={HOSPITAL_ADMIN_HOME_HREF} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">ตั้งค่า · Kill switch</span>
          </nav>
          <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: '38px', fontWeight: 600, color: '#0F2A5C' }}>
            ตั้งค่า · Kill switch <span className="en">Configuration</span>
          </h1>
          <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
            โรงพยาบาลสมุทรปราการ · แก้ไขได้เฉพาะค่าขอบเขตโรงพยาบาล · ลำดับการใช้ค่า HOSPITAL → REGION → GLOBAL → ค่าเริ่มต้น
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={refresh} disabled={loading}>
            <Icon name="refresh" />
            รีเฟรช
          </button>
          <button className="btn btn-s" onClick={() => setHistory({})}>
            <Icon name="history" />
            ประวัติการเปลี่ยนแปลง
          </button>
        </div>
      </section>

      {notice && (
        <div className="ha-banner ha-banner-ok" role="status" data-part="config-notice">
          <Icon name="checkc" className="ic14" style={{ marginTop: 2 }} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="ha-banner ha-banner-err" role="alert" data-part="config-error">
          <Icon name="alertc" className="ic14" style={{ marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="sa-tabs" role="tablist" aria-label="มุมมองการตั้งค่า" data-part="config-tabs">
        <button
          role="tab"
          className={`tab ${tab === 'settings' ? 'tab-on' : ''}`}
          aria-selected={tab === 'settings' ? 'true' : 'false'}
          onClick={() => setTab('settings')}
        >
          ค่าตั้งต้นระบบ
          <span className="cnt">{scopeCounts.ALL}</span>
        </button>
        <button
          role="tab"
          className={`tab ${tab === 'drugs' ? 'tab-on' : ''}`}
          aria-selected={tab === 'drugs' ? 'true' : 'false'}
          onClick={() => setTab('drugs')}
        >
          เกณฑ์ต่อตัวยา · VED / แก้ไข API-F1a-004
          <span className="cnt">{drugs.length}</span>
        </button>
      </div>

      {tab === 'settings' && (
        <>
          <section className="card" data-part="config-killswitch" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <h2 className="sec-h">สวิตช์ปิด-เปิด Agent</h2>
                <div className="sub">
                  Kill switch · <span className="code">agent.enabled</span> · API-AD-004
                </div>
                <div className="ha-hint" style={{ marginTop: 4 }}>{killSwitchReason}</div>
              </div>
              <span className={`badge ${killSwitchOn ? 't-green' : 't-grey'}`}>
                {killSwitchOn ? 'Agent พร้อม' : 'Agent ปิด · ใช้แม่แบบ'}
              </span>
              <button
                className={`sw ${killSwitchOn ? 'sw-on' : 'sw-off'}`}
                role="switch"
                aria-checked={killSwitchOn ? 'true' : 'false'}
                aria-label="สวิตช์ปิด-เปิด Agent"
                disabled
                title={killSwitchReason}
              >
                <span />
              </button>
            </div>
          </section>

          <div className="sa-toolbar" style={{ marginTop: 0 }} data-part="config-scope-filter">
            <span className="ha-label">กรองตามขอบเขตของค่าที่ใช้จริง</span>
            <span className="sa-chips" role="group" aria-label="กรองตามขอบเขต">
              {SCOPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`sa-chip ${scopeFilter === f.value ? 'sa-chip-on' : ''}`}
                  aria-pressed={scopeFilter === f.value}
                  onClick={() => setScopeFilter(f.value)}
                >
                  {f.labelTh}
                  <span className="cnt num">{scopeCounts[f.value]}</span>
                </button>
              ))}
            </span>
            <span style={{ flex: '1 1 0' }} />
            {dirtyCount > 0 && <span className="ha-hint">มีการแก้ไขที่ยังไม่บันทึก {dirtyCount} รายการ</span>}
          </div>

          {loading ? (
            <section className="card" aria-busy="true" aria-label="กำลังโหลดค่าตั้งต้น" style={{ padding: '12px 20px' }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="ha-skel-row" />
              ))}
            </section>
          ) : (
            CONFIG_SECTIONS.map((section, index) => {
              const rows = scopeFilter === 'ALL' ? section.keys : section.keys.filter((k) => k.scope === scopeFilter);
              if (rows.length === 0) return null;
              return (
                <ConfigGroupCard
                  key={section.id}
                  labelTh={section.labelTh}
                  labelEn={section.labelEn}
                  code={section.code}
                  rows={rows}
                  values={values}
                  drafts={drafts}
                  editableFor={editableFor}
                  blockedReason={blockedReason}
                  invalidFor={invalidFor}
                  onDraft={(key, next) => {
                    setError('');
                    setDrafts((d) => ({ ...d, [key]: next }));
                  }}
                  onSave={requestConfigSave}
                  onReset={(key) =>
                    setDrafts((d) => {
                      const copy = { ...d };
                      delete copy[key];
                      return copy;
                    })
                  }
                  onHistory={(key) => setHistory({ key })}
                  defaultOpen={index === 0}
                />
              );
            })
          )}
        </>
      )}

      {tab === 'drugs' && (
        <section className="card" data-part="config-drugs" style={{ padding: '16px 20px 8px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <h2 className="sec-h">เกณฑ์ต่อตัวยา · VED และอายุคงเหลือขั้นต่ำ</h2>
            <span className="ha-hint">
              กำหนด VED และเกณฑ์ใกล้หมดอายุต่อยา (ค่าเริ่มต้นจาก <span className="code">expiry.threshold_days_default</span>)
            </span>
          </div>

          <div className="scroll-x">
            <table className="tbl" aria-label="เกณฑ์ต่อตัวยา">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>รหัส HIS</th>
                  <th>ชื่อยา</th>
                  <th style={{ width: 80 }}>ABC</th>
                  <th style={{ width: 130 }}>VED</th>
                  <th style={{ width: 170 }}>เกณฑ์หมดอายุ (วัน)</th>
                  <th style={{ width: 190 }}>แก้ไขล่าสุด</th>
                  <th style={{ width: 190 }}>
                    <span className="srt">การดำเนินการ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((d) => {
                  const draft = drugDrafts[d.id];
                  const ved = draft?.ved ?? d.ved;
                  const days = draft?.days ?? String(d.expiryThresholdDays);
                  const daysNum = Number(days);
                  const invalid = days.trim() === '' || !Number.isFinite(daysNum) || daysNum < 0;
                  const dirty = draft !== undefined && (ved !== d.ved || days !== String(d.expiryThresholdDays));
                  return (
                    <tr key={d.id}>
                      <td className="code" style={{ fontSize: 11.5 }}>{d.code}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{d.name}</span>
                        <span className="code" style={{ display: 'block', fontSize: 10.5 }}>{d.id}</span>
                      </td>
                      <td>
                        <span className="badge t-grey ha-badge">{d.abc}</span>
                      </td>
                      <td>
                        <select
                          className="sel"
                          aria-label={`VED ของ ${d.name}`}
                          value={ved}
                          disabled={!mayConfigure}
                          title={mayConfigure ? undefined : scopeBlockedReason('HOSPITAL', 'hospital_drug.ved')}
                          onChange={(e) => {
                            const next = e.target.value as VedCode;
                            setDrugDrafts((s) => ({ ...s, [d.id]: { ved: next, days } }));
                          }}
                        >
                          {VED_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {mayConfigure ? (
                          <input
                            className="ha-input"
                            type="number"
                            min={0}
                            step={1}
                            value={days}
                            aria-label={`เกณฑ์หมดอายุของ ${d.name}`}
                            aria-invalid={invalid ? true : undefined}
                            onChange={(e) => setDrugDrafts((s) => ({ ...s, [d.id]: { ved, days: e.target.value } }))}
                          />
                        ) : (
                          <span className="num ha-readonly">{days}</span>
                        )}
                        {invalid && <span className="ha-error">ต้องเป็นตัวเลข ≥ 0</span>}
                      </td>
                      <td style={{ fontSize: 12, lineHeight: '17px' }}>
                        {d.updatedBy}
                        <span className="num" style={{ display: 'block' }}>{d.updatedAt}</span>
                      </td>
                      <td className="r">
                        <button
                          className={`btn btn-sm ${dirty && mayConfigure && !invalid ? 'btn-p' : 'btn-s'}`}
                          disabled={!mayConfigure || !dirty || invalid}
                          title={mayConfigure ? (dirty ? 'บันทึกพร้อมเหตุผล' : 'ยังไม่มีการเปลี่ยนแปลง') : scopeBlockedReason('HOSPITAL', 'hospital_drug.ved')}
                          onClick={() => setPending({ kind: 'drug', row: d, ved, days: daysNum })}
                        >
                          บันทึกพร้อมเหตุผล
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="tbl-foot">
            <span>
              แสดง <span className="num">{drugs.length}</span> รายการ · เฉพาะยาของโรงพยาบาลสมุทรปราการ
            </span>
            <span>ค่าเริ่มต้นเกณฑ์ใกล้หมดอายุมาจากค่าตั้งต้นระบบ</span>
          </div>
        </section>
      )}

      {pending && (
        <ReasonDialog
          title={pending.kind === 'config' ? 'ยืนยันการแก้ไขค่าตั้งต้น' : 'ยืนยันการแก้ไขเกณฑ์ต่อตัวยา'}
          detail={pendingDetail()}
          confirmLabel="บันทึกพร้อมเหตุผล"
          onClose={() => setPending(null)}
          onConfirm={(reason) => applyPending(reason)}
        />
      )}

      {history && (
        <Modal
          label={history.key ? `ประวัติการแก้ไข ${history.key}` : 'ประวัติการแก้ไขค่าตั้งต้น'}
          onClose={() => setHistory(null)}
        >
          <h2 className="sec-h">ประวัติการแก้ไขค่าตั้งต้น</h2>
          <div className="sub">
            {history.key ? <span className="code">{history.key}</span> : 'ทุกรายการของโรงพยาบาลสมุทรปราการ'}
          </div>
          <div style={{ marginTop: 8 }}>
            <ConfigHistoryList items={changes} keyFilter={history.key} />
          </div>
          <div className="ha-dialog-foot">
            <button className="btn btn-s" onClick={() => setHistory(null)}>
              ปิด
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
