import { Icon } from '../../../components/common/icons';
import { requiredRoleHint } from '../../../lib/rbac';
import {
  dueLabel, MODE_META, OBLIGATION_CODES, OBLIGATION_STATE_META, OBLIGATION_STATES, OUR_HOSPITAL,
  outstandingOf, reminderLabel, WAIVABLE_STATES,
} from '../data/obligations';
import type { ObligationState, ObligationTone, ReturnObligation } from '../data/obligations';

/** Tile colours per state tone; the same pairs `BorrowStatusTiles` uses on the request view. */
const TILE_TONE: Record<ObligationTone, [string, string]> = {
  amber: ['#92400E', '#FFFBEB'],
  blue: ['#1E40AF', '#EFF6FF'],
  red: ['#991B1B', '#FEF2F2'],
  green: ['#166534', '#F0FDF4'],
  grey: ['#475569', '#F8FAFC'],
  teal: ['#115E59', '#CCFBF1'],
  orange: ['#9A3412', '#FFEDD5'],
};

interface ObligationTilesProps {
  counts: Record<ObligationState, number>;
  active: ObligationState | null;
  onPick: (s: ObligationState | null) => void;
}

/** SM-7 `return_status` values as filter tiles (click again to clear). */
export function ObligationTiles({ counts, active, onPick }: ObligationTilesProps) {
  return (
    <div className="tiles5" data-part="obligation-tiles">
      {OBLIGATION_STATES.map((s) => {
        const meta = OBLIGATION_STATE_META[s];
        const [fg, bg] = TILE_TONE[meta.tone];
        const on = active === s;
        return (
          <button
            key={s}
            type="button"
            className="tile"
            aria-pressed={on ? 'true' : 'false'}
            onClick={() => onPick(on ? null : s)}
            style={{ borderColor: on ? fg : '#E2E8F0', background: on ? bg : '#FFFFFF', borderWidth: on ? 2 : 1, padding: on ? '9px 11px' : '10px 12px' }}
          >
            <span className="num tile-n">{counts[s]}</span>
            <span className="tl" style={{ color: fg }}>
              <Icon name={meta.icon} className="ic14" />
              {meta.label}
            </span>
            <span className="code" style={{ fontSize: 10.5, lineHeight: '14px' }}>
              {OBLIGATION_CODES[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface WaiveGate {
  allowed: boolean;
  hint: string | undefined;
}

/**
 * Why the waive control is unavailable, if it is (SM-7 + API-XC-005).
 *
 * The server enforces this (SEC-002); the UI only mirrors it: a waive is drawn only from OPEN or
 * OVERDUE, and only HOSPITAL_ADMIN holds the action, so every other role gets a disabled control
 * with the role hint instead of a silent no-op.
 */
export function waiveGate(o: ReturnObligation, mayWaive: boolean): WaiveGate {
  if (!WAIVABLE_STATES.includes(o.state)) {
    return { allowed: false, hint: `ยกเว้นได้เฉพาะภาระสถานะ ${WAIVABLE_STATES.join(' หรือ ')} ตาม SM-7 (สถานะปัจจุบัน ${o.state})` };
  }
  if (!mayWaive) return { allowed: false, hint: requiredRoleHint('waiveReturn') };
  return { allowed: true, hint: undefined };
}

interface ObligationTableProps {
  rows: ReturnObligation[];
  /** `can(role, 'waiveReturn')` — API-XC-005 grants the waive to HOSPITAL_ADMIN only. */
  mayWaive: boolean;
  onWaive: (o: ReturnObligation) => void;
}

/**
 * UI-05 sub-tab "ภาระการคืน · Return obligations" (API-XC-003 rows).
 *
 * One row per return obligation of our own requests: we are the debtor, the counter-party leg is the
 * lender we must return to (Q-19). The waive button stays visible but disabled when the state or the
 * role forbids it, with the reason as its tooltip, so the block is never silent.
 */
export function ObligationTable({ rows, mayWaive, onWaive }: ObligationTableProps) {
  return (
    <>
      <div className="scroll-x">
        <table className="tbl" aria-label="ภาระการคืนของโรงพยาบาล" data-part="obligations-table">
          <thead>
            <tr>
              <th style={{ width: 190 }}>ภาระการคืน</th>
              <th>ยา</th>
              <th style={{ width: 210 }}>โรงพยาบาล</th>
              <th className="r" style={{ width: 128 }}>จำนวน</th>
              <th style={{ width: 168 }}>กำหนดคืน</th>
              <th style={{ width: 170 }}>สถานะ</th>
              <th style={{ width: 168 }}>
                <span className="srt">การดำเนินการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const meta = OBLIGATION_STATE_META[o.state];
              const mode = MODE_META[o.mode];
              const settled = o.state === 'RETURNED' || o.state === 'WAIVED';
              const overdue = o.daysLeft < 0 && !settled;
              const gate = waiveGate(o, mayWaive);
              return (
                <tr key={o.id} data-obligation={o.id} data-state={o.state}>
                  <td>
                    <span className="code" style={{ fontSize: 12.5, fontWeight: 600, color: '#0F2A5C' }}>
                      {o.id}
                    </span>
                    <span className="code" style={{ display: 'block', fontSize: 11 }}>
                      {o.requestId} · {o.leg}
                    </span>
                  </td>
                  <td>
                    <span className="br-drug">
                      <span className={`ved ved-${o.ved} ved-sm`}>{o.ved}</span>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{o.drug}</span>
                    </span>
                    <span className={`badge t-${mode.tone}`} style={{ height: 20, fontSize: 11, marginTop: 4 }}>
                      {mode.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, lineHeight: '18px', color: '#0F2A5C' }}>
                    <span style={{ display: 'block' }}>
                      {OUR_HOSPITAL} <span className="sub">(ผู้ยืม)</span>
                    </span>
                    <span style={{ display: 'block' }}>
                      → {o.creditor} <span className="sub">(ผู้ให้ยืม)</span>
                    </span>
                  </td>
                  <td className="r">
                    <span className="num" style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 14 }}>
                      {o.qty}
                    </span>{' '}
                    <span style={{ fontSize: 11.5 }}>{o.unit}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      คืนแล้ว <span className="num">{o.qtyReturned}</span> / {o.qty}
                      {o.qtyReturned > 0 && o.qtyReturned < o.qty && (
                        <>
                          {' '}
                          · คงเหลือ <span className="num">{outstandingOf(o)}</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, lineHeight: '17px' }}>
                    <span className="num" style={{ display: 'block', fontWeight: 600, color: '#0F2A5C' }}>
                      {o.dueDate}
                    </span>
                    {settled ? (
                      <span className="sub" style={{ display: 'block' }}>
                        {o.state === 'RETURNED' ? `คืนครบ ${o.returnedAt}` : `ยกเว้น ${o.waivedAt}`}
                      </span>
                    ) : (
                      <span style={{ display: 'block', color: overdue ? '#991B1B' : '#475569', fontWeight: overdue ? 600 : 400 }}>
                        {dueLabel(o.daysLeft)}
                      </span>
                    )}
                    {o.reminder && !settled && (
                      <span className="badge t-amber" style={{ height: 20, fontSize: 11, marginTop: 2 }}>
                        {reminderLabel(o.reminder)}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge t-${meta.tone}`} style={{ height: 20, fontSize: 11 }}>
                      <Icon name={meta.icon} className="ic14" />
                      {meta.label}
                    </span>
                    {o.state === 'WAIVED' && (
                      <span className="sub" style={{ display: 'block', marginTop: 4, lineHeight: '16px' }}>
                        ยกเว้นโดย {o.waivedBy} · {o.waivedAt}
                        <span style={{ display: 'block' }}>เหตุผล: {o.waivedReason}</span>
                      </span>
                    )}
                    {o.state === 'RETURNED' && (
                      <span className="sub" style={{ display: 'block', marginTop: 4 }}>
                        ปิดภาระแล้ว (F-30)
                      </span>
                    )}
                  </td>
                  <td className="r">
                    <button
                      type="button"
                      className="btn btn-sm btn-p"
                      data-part="obligation-waive"
                      disabled={!gate.allowed}
                      title={gate.hint}
                      onClick={() => onWaive(o)}
                    >
                      ยกเว้นภาระการคืน
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
          แสดง <span className="num">{rows.length}</span> รายการ · ภาระการคืนของคำขอเรา (เราเป็นผู้ยืม) เท่านั้น
        </span>
        <span>คืนเป็นยาตัวเดิมจำนวนเท่าเดิม (F-30) · เลือดทดแทนผ่านธนาคารเลือด (BR-XC-013)</span>
      </div>
    </>
  );
}
