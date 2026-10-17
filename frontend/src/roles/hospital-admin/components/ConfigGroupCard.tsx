import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { ConfigKey, ConfigValue } from '../data/config';
import { ConfigKeyRow } from './ConfigKeyRow';

interface ConfigGroupCardProps {
  labelTh: string;
  labelEn: string;
  code: string;
  rows: ConfigKey[];
  values: Record<string, ConfigValue>;
  drafts: Record<string, string | boolean>;
  /** Whether the signed-in role may write this row (already includes scope + §23 restricted checks). */
  editableFor: (row: ConfigKey) => boolean;
  blockedReason: (row: ConfigKey) => string | undefined;
  invalidFor: (row: ConfigKey, draft: string | boolean | undefined) => string;
  onDraft: (key: string, next: string | boolean) => void;
  onSave: (row: ConfigKey) => void;
  onReset: (key: string) => void;
  /** Opens the change history filtered to the clicked key. */
  onHistory: (key: string) => void;
  /** Groups start collapsed except the first, so the page opens compact. */
  defaultOpen?: boolean;
}

/** Collapsible `.card` holding one §23 configuration group. */
export function ConfigGroupCard({
  labelTh,
  labelEn,
  code,
  rows,
  values,
  drafts,
  editableFor,
  blockedReason,
  invalidFor,
  onDraft,
  onSave,
  onReset,
  onHistory,
  defaultOpen = false,
}: ConfigGroupCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const lockedCount = rows.filter((r) => !editableFor(r)).length;

  return (
    <section className="card" data-part={`config-group-${labelEn.toLowerCase().replace(/\s+/g, '-')}`}>
      <div
        style={{
          padding: '14px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          borderBottom: open ? '1px solid #E2E8F0' : undefined,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <h2 className="sec-h">{labelTh}</h2>
          <div className="sub">
            {labelEn} · <span className="code">{code}</span>
          </div>
        </div>

        <span className="ha-hint">
          <span className="num">{rows.length}</span> คีย์
          {lockedCount > 0 && (
            <>
              {' · '}
              <span className="num">{lockedCount}</span> อ่านอย่างเดียว
            </>
          )}
        </span>

        <button
          className="btn btn-s btn-sm"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={`cfg-group-${labelEn.toLowerCase().replace(/\s+/g, '-')}`}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="chev" className="ic14" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          {open ? 'ย่อ' : 'ขยาย'}
        </button>
      </div>

      {open && (
        <div
          id={`cfg-group-${labelEn.toLowerCase().replace(/\s+/g, '-')}`}
          style={{ padding: '4px 20px 16px' }}
        >
          {rows.map((row) => (
            <ConfigKeyRow
              key={row.key}
              row={row}
              value={values[row.key] ?? row.value}
              draft={drafts[row.key]}
              editable={editableFor(row)}
              blockedReason={blockedReason(row)}
              invalid={invalidFor(row, drafts[row.key])}
              onDraft={(next) => onDraft(row.key, next)}
              onSave={() => onSave(row)}
              onReset={() => onReset(row.key)}
              onHistory={() => onHistory(row.key)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
