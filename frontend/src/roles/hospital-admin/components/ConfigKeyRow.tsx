import { Icon } from '../../../components/common/icons';
import type { ConfigKey, ConfigValue } from '../data/config';
import { SCOPE_META } from '../data/config';

interface ConfigKeyRowProps {
  row: ConfigKey;
  /** Effective value after the HOSPITAL → REGION → GLOBAL → default lookup. */
  value: ConfigValue;
  /** Uncommitted edit, when the row is dirty. */
  draft: string | boolean | undefined;
  /** False for REGION/GLOBAL scope rows and the §23 REGION_ADMIN-only groups. */
  editable: boolean;
  /** Tooltip explaining why the row is locked (names the required role). */
  blockedReason?: string;
  invalid: string;
  onDraft: (next: string | boolean) => void;
  onSave: () => void;
  onReset: () => void;
  /** Opens the change history filtered to this key. */
  onHistory: () => void;
}

/**
 * One `config_setting` row. Editable rows render their control inline; the actual write is
 * committed only through the reason dialog (SEC-003), so the button stays disabled until dirty.
 */
export function ConfigKeyRow({
  row,
  value,
  draft,
  editable,
  blockedReason,
  invalid,
  onDraft,
  onSave,
  onReset,
  onHistory,
}: ConfigKeyRowProps) {
  const dirty = draft !== undefined;
  const shown = draft !== undefined ? draft : value;
  const scope = SCOPE_META[row.scope];
  const inputId = `cfg-${row.key.replace(/\./g, '-')}`;

  const control = () => {
    if (row.type === 'boolean') {
      const on = Boolean(shown);
      return (
        <button
          type="button"
          className={`sw ${on ? 'sw-on' : 'sw-off'}`}
          role="switch"
          aria-checked={on ? 'true' : 'false'}
          aria-label={row.labelTh}
          disabled={!editable}
          title={editable ? undefined : blockedReason}
          onClick={() => onDraft(!on)}
        >
          <span />
        </button>
      );
    }
    if (!editable) {
      // Locked rows show the resolved value as text rather than a disabled input, so the state is
      // unambiguous and keyboard focus never lands on a field that cannot be written.
      return (
        <span className="ha-readonly num" title={blockedReason}>
          {String(shown)}
        </span>
      );
    }
    return (
      <input
        id={inputId}
        className="ha-input"
        type={row.type === 'number' ? 'number' : 'text'}
        step={row.type === 'number' ? 'any' : undefined}
        value={String(shown)}
        aria-label={row.labelTh}
        aria-invalid={invalid ? true : undefined}
        onChange={(e) => onDraft(e.target.value)}
      />
    );
  };

  return (
    <div className="ha-cfg-row">
      <div className="ha-cfg-main">
        <label className="ha-cfg-label" htmlFor={row.type === 'boolean' ? undefined : inputId}>
          {row.labelTh}
        </label>
        <span className="en">{row.labelEn}</span>
        <span className="code">{row.key}</span>
        <span className="ha-hint">{row.description}</span>
      </div>

      <div className={editable ? 'ha-cfg-ctl' : 'ha-cfg-ctl ha-cfg-locked'}>
        {control()}
        {row.unit && <span className="ha-hint">หน่วย: {row.unit}</span>}
        {invalid && <span className="ha-error">{invalid}</span>}
      </div>

      <div className="ha-cfg-meta">
        <span>
          <span className={`badge ${scope.tone} ha-badge`} title={`config_setting.scope = ${scope.code}`}>
            {scope.labelTh}
          </span>
        </span>
        <span className="ha-hint">
          ค่าเริ่มต้น <span className="num">{String(row.fileDefault)}</span>
        </span>
        <span className="ha-hint">{row.updatedAt === '—' ? 'ยังไม่แก้' : `${row.updatedBy} · ${row.updatedAt}`}</span>
        <button className="link" style={{ fontSize: 12 }} onClick={onHistory}>
          <Icon name="history" className="ic14" />
          ประวัติ
        </button>
      </div>

      <div className="ha-actions">
        {dirty && (
          <button className="btn btn-g btn-sm" onClick={onReset}>
            ยกเลิก
          </button>
        )}
        <button
          className={`btn btn-sm ${dirty && editable && !invalid ? 'btn-p' : 'btn-s'}`}
          disabled={!editable || !dirty || Boolean(invalid)}
          title={
            !editable
              ? blockedReason
              : dirty
                ? 'บันทึกพร้อมเหตุผล (บันทึกใน audit log)'
                : 'ยังไม่มีการเปลี่ยนแปลง'
          }
          onClick={onSave}
        >
          บันทึกพร้อมเหตุผล
        </button>
      </div>
    </div>
  );
}
