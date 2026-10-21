import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { homeHrefFor, withRole } from '../../../data/navigation';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { fmtTime, useTick } from '../../../lib/time';
import {
  BORROW_REQUESTS,
  BR_URGENCY_META,
  LENDABLE_STOCK,
  LOTS,
  SM1B,
} from '../data/lender';
import type { BorrowRequest, BRStatus, LendableStock, LotOption } from '../data/lender';
import { useLenderQueue } from '../data/useLenderQueue';
import { respondToLeg } from '../../../services/borrowApi';

const UG_ICON: Record<string, IconName> = {
  critical: 'tri',
  urgent: 'alertc',
  normal: 'minusc',
};

// ─── Filter options ──────────────────────────────────────────────────
const URGENCY_OPTS = [
  { value: '', label: 'ความเร่งด่วน: ทั้งหมด' },
  { value: 'critical', label: 'เร่งด่วนมาก' },
  { value: 'urgent', label: 'เร่งด่วน' },
  { value: 'normal', label: 'ปกติ' },
];
const TRIGGER_OPTS = [
  { value: '', label: 'บริบท: ทั้งหมด' },
  { value: 'STOCK_ALERT', label: 'STOCK_ALERT' },
  { value: 'MANUAL', label: 'MANUAL' },
];
const STATUS_FILTER: { value: '' | BRStatus; label: string }[] = [
  { value: '', label: 'สถานะ: ทั้งหมด' },
  { value: 'waiting', label: 'รอตอบกลับ' },
  { value: 'accepted', label: 'ตอบรับแล้ว' },
  { value: 'loaded', label: 'กำลังส่ง' },
  { value: 'declined', label: 'ปฏิเสธ' },
];

type ResponsePhase = 'idle' | 'confirm' | 'done';
type ResponseKind = 'full' | 'partial' | 'decline';

const selectStyle: React.CSSProperties = {
  height: 36,
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 13,
  color: '#0f2a5c',
  background: '#ffffff',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ─── Summary tile SM-1b ──────────────────────────────────────────────
function SummaryTile({
  count,
  badgeText,
  badgeCls,
  icon,
  en,
}: {
  count: number;
  badgeText: string;
  badgeCls: string;
  icon: IconName;
  en: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '12px 18px',
        minWidth: 140,
        flex: '1 1 0',
      }}
    >
      <span
        style={{
          fontSize: 26,
          lineHeight: '32px',
          fontWeight: 700,
          color: '#0f2a5c',
          fontFamily: 'Inter, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
      <div>
        <span className={`badge ${badgeCls}`}>
          <Icon name={icon} className="ic12" />
          {badgeText}
        </span>
      </div>
      <span style={{ fontSize: 11, lineHeight: '14px', color: '#94a3b8' }}>{en}</span>
    </div>
  );
}

// ─── Countdown timer ─────────────────────────────────────────────────
function CountdownTimer({
  deadlineSecs,
  deadlineLabel,
}: {
  deadlineSecs: number;
  deadlineLabel?: string;
}) {
  const tick = useTick();
  const left = Math.max(0, deadlineSecs - tick);
  const crit = left < 1800;

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#b45309',
          }}
        >
          <Icon name="clock" className="ic16" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            {deadlineLabel || 'ตอบภายใน 23:40 น.'}
          </div>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
            เตือน 50% 20:40 · ไม่ตอบ = หมดเวลา ระบบส่งต่อผู้ให้ยืมถัดไป
          </div>
        </div>
      </div>
      <div
        style={{
          fontFamily: 'Inter, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 22,
          fontWeight: 700,
          color: crit ? '#b91c1c' : '#0f2a5c',
          letterSpacing: 0.5,
          flex: 'none',
        }}
      >
        {fmtTime(left)}
      </div>
    </div>
  );
}

// ─── FEFO lot row ─────────────────────────────────────────────────────
function LotRow({
  lot,
  selected,
  onToggle,
  qty,
  onQtyChange,
  partial,
}: {
  lot: LotOption;
  selected: boolean;
  onToggle: () => void;
  qty: number;
  onQtyChange: (v: number) => void;
  partial: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 0',
        borderTop: '1px solid #f1f5f9',
        opacity: lot.fefoEligible ? 1 : 0.6,
      }}
    >
      <input
        type="checkbox"
        checked={selected && lot.fefoEligible}
        disabled={!lot.fefoEligible}
        onChange={onToggle}
        style={{
          marginTop: 3,
          cursor: lot.fefoEligible ? 'pointer' : 'not-allowed',
          flex: 'none',
          accentColor: '#1d4ed8',
        }}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span
            style={{
              fontWeight: 600,
              color: lot.fefoEligible ? '#0f2a5c' : '#64748b',
              fontSize: 13,
            }}
          >
            {lot.lotId} · หมดอายุ {lot.expDate} ({lot.daysLeft} วัน)
          </span>
          {lot.fefoEligible && selected && partial ? (
            <input
              type="number"
              min={1}
              max={lot.qty}
              value={qty}
              onChange={(e) => onQtyChange(Number(e.target.value))}
              style={{
                width: 80,
                height: 26,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '0 6px',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: lot.fefoEligible ? '#0f2a5c' : '#94a3b8',
              }}
            >
              {lot.fefoEligible ? `${lot.qty} VIAL` : '—'}
            </span>
          )}
        </div>
        {lot.note && (
          <div
            style={{
              fontSize: 11.5,
              marginTop: 2,
              color: lot.fefoEligible ? '#15803d' : '#ea580c',
              fontWeight: 500,
            }}
          >
            {lot.note}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────
function DetailPanel({
  req,
  onClose,
  role = 'PHARMACIST',
  liveLots,
  liveStock,
  onResponded,
}: {
  req: BorrowRequest;
  onClose: () => void;
  /** Set when the row came from the API: FEFO lots and lendable stock of that leg, and the refresh after answering. */
  liveLots?: LotOption[];
  liveStock?: LendableStock | null;
  onResponded?: () => void;
  /** Role viewing the panel; the lender response is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}) {
  /* Answering a borrow request (give in full / partial / decline) confirms a lending. */
  const mayRespond = mayActFor(role, 'PHARMACIST', 'confirmLend');
  const respondHint = requiredRoleHint('confirmLend');
  const [phase, setPhase] = useState<ResponsePhase>('idle');
  const [kind, setKind] = useState<ResponseKind>('full');
  const live = Boolean(req.legId);
  const [declineReason, setDeclineReason] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedLots, setSelectedLots] = useState<Record<string, boolean>>(() => {
    const lots = liveLots ?? LOTS[req.drug] ?? [];
    return Object.fromEntries(lots.filter((l) => l.fefoEligible).map((l) => [l.lotId, true]));
  });
  const [lotQtys, setLotQtys] = useState<Record<string, number>>(() => {
    const lots = liveLots ?? LOTS[req.drug] ?? [];
    return Object.fromEntries(lots.map((l) => [l.lotId, l.qty]));
  });

  const lots = liveLots ?? LOTS[req.drug] ?? [];
  const stock = live ? (liveStock ?? undefined) : LENDABLE_STOCK[req.drug];
  const urgencyMeta = BR_URGENCY_META[req.urgency];

  const totalLotQty = lots
    .filter((l) => selectedLots[l.lotId] && l.fefoEligible)
    .reduce((s, l) => s + (lotQtys[l.lotId] ?? l.qty), 0);

  const confirmLabel =
    kind === 'full'
      ? `ยืนยันให้ยืม ${req.qty} ${req.unit}`
      : kind === 'partial'
      ? `ยืนยันให้ยืม ${totalLotQty} ${req.unit} (บางส่วน)`
      : 'ยืนยันปฏิเสธคำขอนี้';

  if (phase === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#dcfce7',
            color: '#166534',
            borderRadius: 10,
            padding: '14px 16px',
            fontWeight: 600,
          }}
        >
          <Icon name="checkc" className="ic16" />
          {kind === 'decline'
            ? `ปฏิเสธ ${req.id} แล้ว · ระบบจะส่งต่อให้ผู้ให้ยืมรายอื่น`
            : `ตอบรับ ${req.id} แล้ว · ระบบส่งงานจัดยาให้ทีมคลัง`}
        </div>
        <button className="btn btn-s" onClick={onClose}>
          ปิด
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Panel header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          flex: 'none',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
            คิวตอบคำขอยืม (เราเป็นผู้ให้ยืม) - Lender response - UI-06
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#0f2a5c',
                fontFamily: 'Inter, monospace',
              }}
            >
              {req.id}
            </span>
            <span className="badge st-pending">
              <Icon name="hourglass" className="ic12" />
              รอเราตอบ
            </span>
            <span className={`badge ${urgencyMeta.cls}`}>
              <Icon name={UG_ICON[req.urgency]} className="ic12" />
              {req.urgencyLabel}
            </span>
            <span className="badge t-grey code">{req.trigger}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span className={`ved ved-${req.ved} ved-sm`}>{req.ved}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f2a5c' }}>
              {req.drug} · {req.qty} {req.unit}
            </span>
          </div>
        </div>
        <button
          className="icbtn"
          aria-label="ปิดรายละเอียด"
          onClick={onClose}
          style={{ flex: 'none' }}
        >
          <Icon name="x" className="ic14" />
        </button>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: '1 1 auto',
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Countdown */}
        {req.status === 'waiting' && req.deadlineSecs !== undefined && (
          <CountdownTimer
            deadlineSecs={req.deadlineSecs}
            deadlineLabel={req.deadlineLabel}
          />
        )}

        {/* Metadata grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 12px',
            fontSize: 12.5,
          }}
        >
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>ผู้ขอ</div>
            <div style={{ color: '#0f2a5c', fontWeight: 600 }}>{req.requester}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>จำนวนที่ขอ</div>
            <div style={{ color: '#0f2a5c', fontWeight: 600 }}>
              {req.qty} {req.unit} - รอบ {req.round}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>บริบท</div>
            <div style={{ color: '#0f2a5c', fontWeight: 600 }}>{req.trigger}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>ได้รับเมื่อ</div>
            <div style={{ color: '#0f2a5c', fontWeight: 600 }}>{req.receivedDate}</div>
          </div>
        </div>

        {/* Requester message */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12.5,
            lineHeight: '19px',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
            ข้อความจาก {req.requester} (อนุมัติโดยเภสัชกรผู้ขอ)
          </div>
          <div style={{ color: '#334155' }}>
            {req.message.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        {/* Lendable stock */}
        {stock && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#0f2a5c',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>ผลต่อสต็อกของเรา</span>
              <span
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  background: '#f1f5f9',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                F-13 LendableStock
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: 10.5, color: '#64748b' }}>คงเหลือตอนนี้</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#0f2a5c',
                    fontFamily: 'Inter, sans-serif',
                    marginTop: 2,
                  }}
                >
                  {stock.current}
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: 10.5, color: '#64748b' }}>ให้ยืมได้สูงสุด</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#2563eb',
                    fontFamily: 'Inter, sans-serif',
                    marginTop: 2,
                  }}
                >
                  {stock.maxLendable}
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: 10.5, color: '#64748b' }}>หลังให้ยืม</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#16a34a',
                    fontFamily: 'Inter, sans-serif',
                    marginTop: 2,
                  }}
                >
                  {stock.afterLend}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                lineHeight: '16px',
                background: '#f8fafc',
                borderRadius: 6,
                padding: '6px 8px',
                border: '1px solid #e2e8f0',
              }}
            >
              {stock.explanation.split('\n').map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.includes('ให้ยืมได้') ? '#15803d' : '#475569',
                    fontWeight: line.includes('ให้ยืมได้') ? 600 : 400,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FEFO lot selector */}
        {req.status === 'waiting' && lots.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#0f2a5c',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>ล็อตที่จะให้ยืม</span>
              <span
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  background: '#f1f5f9',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                FEFO · อายุคงเหลือ &gt; 180 วัน
              </span>
            </div>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '6px 12px',
                background: '#ffffff',
              }}
            >
              {lots.map((lot) => (
                <LotRow
                  key={lot.lotId}
                  lot={lot}
                  selected={!!selectedLots[lot.lotId]}
                  onToggle={() => setSelectedLots((p) => ({ ...p, [lot.lotId]: !p[lot.lotId] }))}
                  qty={lotQtys[lot.lotId] ?? lot.qty}
                  onQtyChange={(v) => setLotQtys((p) => ({ ...p, [lot.lotId]: v }))}
                  partial={kind === 'partial'}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {req.status === 'waiting' && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: '#ffffff',
            flex: 'none',
          }}
        >
          {/* A role that may not answer still sees the pending decision, disabled with the owner named. */}
          {!mayRespond && (
            <button
              type="button"
              className="btn btn-p"
              style={{ width: '100%', height: 42, borderRadius: 8, fontSize: 14, fontWeight: 600 }}
              disabled
              title={respondHint}
            >
              {confirmLabel}
            </button>
          )}
          {mayRespond && phase === 'idle' && (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: kind === 'full' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: kind === 'full' ? '#eff6ff' : '#ffffff',
                    color: kind === 'full' ? '#1d4ed8' : '#334155',
                  }}
                  onClick={() => setKind('full')}
                >
                  ให้ครบ
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: kind === 'partial' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: kind === 'partial' ? '#eff6ff' : '#ffffff',
                    color: kind === 'partial' ? '#1d4ed8' : '#334155',
                  }}
                  onClick={() => setKind('partial')}
                >
                  ให้บางส่วน
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: kind === 'decline' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: kind === 'decline' ? '#fef2f2' : '#ffffff',
                    color: kind === 'decline' ? '#dc2626' : '#334155',
                  }}
                  onClick={() => setKind('decline')}
                >
                  ปฏิเสธ
                </button>
              </div>

              <button
                type="button"
                style={{
                  width: '100%',
                  height: 42,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
                onClick={() => setPhase('confirm')}
              >
                {confirmLabel}
              </button>
            </>
          )}

          {mayRespond && phase === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  fontSize: 13,
                  background: '#fef3c7',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#92400e',
                }}
              >
                ยืนยัน: {confirmLabel}?
              </div>
              {live && kind === 'decline' && (
                <input className="sel" aria-label="เหตุผลที่ปฏิเสธ" placeholder="เหตุผลที่ปฏิเสธ (จำเป็น)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
              )}
              {sendError && <div role="alert" style={{ fontSize: 12.5, color: '#b91c1c' }}>{sendError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-g btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setPhase('idle')}
                >
                  ย้อนกลับ
                </button>
                <button
                  className={`btn btn-sm ${kind === 'decline' ? '' : 'btn-p'}`}
                  style={{
                    flex: 2,
                    background: kind === 'decline' ? '#b91c1c' : undefined,
                    color: kind === 'decline' ? '#fff' : undefined,
                  }}
                  disabled={sending || (live && kind === 'decline' && declineReason.trim().length < 3)}
                  onClick={() => {
                    if (!live) return setPhase('done');
                    // API-F1b-009: full = ACCEPT (server picks FEFO lots >= 180 days), partial = PARTIAL with the chosen lots, decline needs a reason.
                    const chosen = lots.filter((l) => selectedLots[l.lotId] && l.fefoEligible && l.uuid).map((l) => ({ lotId: l.uuid!, qty: lotQtys[l.lotId] ?? l.qty }));
                    const body = kind === 'full' ? { decision: 'ACCEPT' as const } : kind === 'partial' ? { decision: 'PARTIAL' as const, qty: totalLotQty, lots: chosen } : { decision: 'REJECT' as const, reason: declineReason.trim() };
                    setSending(true);
                    setSendError(null);
                    respondToLeg(req.legId!, body)
                      .then(() => { setPhase('done'); onResponded?.(); })
                      .catch((e: Error) => setSendError(e.message))
                      .finally(() => setSending(false));
                  }}
                >
                  {kind === 'decline' ? 'ยืนยันปฏิเสธ' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              fontSize: 10.5,
              color: '#94a3b8',
              textAlign: 'center',
              lineHeight: '15px',
            }}
          >
            ตอบแล้วระบบสร้างงานขนส่งทันที · สต็อกของเราตัดเมื่อขึ้นรถ (LOADED) · ผู้ยืมต้องคืนเป็นยาตัวเดิมภายใน 30 วัน
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lender Queue Page ────────────────────────────────────────────────
/**
 * `role` gates the lender response (give in full / partial / decline) through `lib/rbac.ts` and
 * drives the breadcrumb home and the switch back to UI-05.
 */
export function LenderQueuePage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [urgency, setUrgency] = useState('');
  const [trigger, setTrigger] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | BRStatus>('');
  const lq = useLenderQueue();
  const isLive = lq.source === 'live';
  const data = isLive ? lq.requests : BORROW_REQUESTS;
  const [selected, setSelected] = useState<BorrowRequest | null>(BORROW_REQUESTS[0]);
  const panelRef = useRef<HTMLDivElement>(null);
  // A mock row must not stay selected once the live queue has loaded (and vice versa).
  useEffect(() => {
    if (lq.source === 'live') setSelected((cur) => (cur && cur.legId ? (data.find((r) => r.legId === cur.legId) ?? null) : null));
  }, [lq.source, data]);

  const q = query.trim().toLowerCase();
  const rows = data.filter((r) => {
    if (urgency && r.urgency !== urgency) return false;
    if (trigger && r.trigger !== trigger) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (q && !(r.id + r.drug + r.requester).toLowerCase().includes(q)) return false;
    return true;
  });

  // Close detail on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Breadcrumb */}
      <nav
        style={{
          fontSize: 12.5,
          color: '#64748b',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12.5, color: '#2563eb' }}>
          หน้าหลัก
        </a>
        <Icon name="chev" className="ic12" style={{ transform: 'rotate(-90deg)', color: '#94a3b8' }} />
        <span style={{ color: '#64748b' }}>คิวตอบคำขอยืม</span>
      </nav>

      {/* Page heading */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            color: '#0f2a5c',
            lineHeight: '32px',
          }}
        >
          คำขอยืมระหว่างโรงพยาบาล{' '}
          <span style={{ fontSize: 16, fontWeight: 400, color: '#94a3b8' }}>
            / Borrow requests
          </span>
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 12,
            color: '#64748b',
            lineHeight: '18px',
          }}
        >
          {user?.hospitalName ?? 'รพ.สมุทรปราการ'} · ข้อมูล ณ {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. · ทุกคำขอต้องให้เภสัชกรอนุมัติก่อนส่ง · ไม่ตอบในเวลา = ส่งต่อผู้ให้ยืมถัดไปอัตโนมัติ
        </p>
      </div>

      {/* Top 2 Action/Mode cards: UI-05 (เราเป็นผู้ยืม) vs UI-06 (เราเป็นผู้ให้ยืม) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {/* Card 1: เราเป็นผู้ยืม (UI-05) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '14px 18px',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
          onClick={() => { window.location.search = withRole('?page=borrow', role); }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <Icon name="inArrow" className="ic16" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                คำขอของเรา
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                เราเป็นผู้ยืม · UI-05
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#0f2a5c',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              9
            </span>
            <span className="badge st-pending">
              รออนุมัติ 1
            </span>
          </div>
        </div>

        {/* Card 2: เราเป็นผู้ให้ยืม (UI-06) - ACTIVE */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '2px solid #2563eb',
            borderRadius: 12,
            padding: '14px 18px',
            cursor: 'default',
            boxShadow: '0 2px 4px rgba(37,99,235,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#fff7ed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ea580c',
              }}
            >
              <Icon name="hand" className="ic16" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                คิวตอบคำขอยืม
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                เราเป็นผู้ให้ยืม · UI-06
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#0f2a5c',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              2
            </span>
            <span className="badge st-pending">
              <Icon name="hourglass" className="ic12" />
              รอเราตอบ 2
            </span>
          </div>
        </div>
      </div>

      {/* Summary tiles SM-1b */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: '#0f2a5c',
            marginBottom: 10,
          }}
        >
          สถานะรอบที่ส่งถึงเรา (SM-1b)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <SummaryTile
            count={isLive ? data.filter((r) => r.status === 'waiting').length : SM1B.sent}
            badgeText="รอเราตอบ"
            badgeCls="st-pending"
            icon="hourglass"
            en="SENT"
          />
          <SummaryTile
            count={isLive ? data.filter((r) => r.status === 'accepted' || r.status === 'partial').length : SM1B.accepted}
            badgeText="ตอบรับแล้ว"
            badgeCls="st-approved"
            icon="checkc"
            en="ACCEPTED · PARTIAL"
          />
          <SummaryTile
            count={isLive ? data.filter((r) => r.status === 'loaded' || r.status === 'in_transit').length : SM1B.loaded}
            badgeText="กำลังส่ง"
            badgeCls="st-transit"
            icon="truck"
            en="LOADED · IN_TRANSIT"
          />
        </div>
      </div>

      {/* Main content: list + detail panel */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 0 }}>
        {/* Left: table */}
        <div className="card" style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}>
          {/* Filters */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
              <Icon
                name="search"
                className="ic14"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="search"
                placeholder="เลขคำขอ BR- / ชื่อยา / โรงพยาบาล"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...selectStyle, width: '100%', paddingLeft: 32 }}
              />
            </div>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              style={selectStyle}
            >
              {URGENCY_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              style={selectStyle}
            >
              {TRIGGER_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | BRStatus)}
              style={selectStyle}
            >
              {STATUS_FILTER.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '4px 10px',
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {rows.length}
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th scope="col">เลขคำขอ</th>
                  <th scope="col">ยา</th>
                  <th scope="col" className="r">
                    จำนวน
                  </th>
                  <th scope="col">ผู้ขอ · ได้รับเมื่อ</th>
                  <th scope="col">ความเร่งด่วน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSelected = selected?.id === r.id;
                  const urgMeta = BR_URGENCY_META[r.urgency];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(isSelected ? null : r)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? '#eff6ff' : undefined,
                        borderLeft: isSelected
                          ? '3px solid #2563eb'
                          : '3px solid transparent',
                      }}
                    >
                      <td style={{ minWidth: 150 }}>
                        <a
                          href="#"
                          className="link"
                          style={{
                            fontSize: 13,
                            fontFamily: 'Inter, monospace',
                            fontWeight: 600,
                            color: '#2563eb',
                          }}
                          onClick={(e) => e.preventDefault()}
                        >
                          {r.id}
                        </a>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          รอบ {r.round} · <span className="code">{r.trigger}</span>
                        </div>
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={`ved ved-${r.ved} ved-sm`}>{r.ved}</span>
                          <span style={{ fontWeight: 500, color: '#0f2a5c' }}>{r.drug}</span>
                        </div>
                      </td>
                      <td
                        className="r"
                        style={{
                          fontWeight: 600,
                          color: '#0f2a5c',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span className="num">{r.qty}</span> {r.unit}
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, color: '#0f2a5c' }}>
                          {r.requester} (ผู้ขอ) · {r.receivedDate}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${urgMeta.cls}`}>
                          <Icon name={UG_ICON[r.urgency]} className="ic12" />
                          {urgMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}
                    >
                      ไม่พบคำขอที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid #e2e8f0',
              fontSize: 12,
              color: '#94a3b8',
            }}
          >
            แสดง {rows.length} รายการ
          </div>
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div
            ref={panelRef}
            className="card"
            style={{
              flex: '0 0 420px',
              width: 420,
              height: 'calc(100vh - 140px)',
              position: 'sticky',
              top: 70,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
            }}
          >
            <DetailPanel key={selected.legId ?? selected.id} req={selected} role={role} onClose={() => setSelected(null)} {...(selected.legId ? { liveLots: lq.lots[selected.legId] ?? [], liveStock: lq.stock[selected.legId] ?? null, onResponded: () => void lq.reload() } : {})} />
          </div>
        )}
      </div>
    </div>
  );
}
