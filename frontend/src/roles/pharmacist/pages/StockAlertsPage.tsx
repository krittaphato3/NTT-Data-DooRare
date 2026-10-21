import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import { createBorrowRequest, proposeBorrowRequest } from '../../../services/borrowApi';
import { StockAlertSummary } from '../components/StockAlertSummary';
import { StockAlertTable } from '../components/StockAlertTable';
import type { RowActionCond } from '../components/StockAlertTable';
import { StockAlertToolbar } from '../components/StockAlertToolbar';
import {
  ALERT_HISTORY,
  ALERT_ROWS,
  ALERT_STATUS_META,
  ALERT_TYPE_META,
  PHARMACY_CONTEXT,
  QUEUE_ROWS,
  SEVERITY_META,
  sortAlertRows,
} from '../data/stockAlerts';
import type { Severity, SortMode, StockAlertRow, Ved } from '../data/stockAlerts';
import { useStockAlerts } from '../data/useStockAlerts';

/** Small modal shell (mirrors PageHeader's dialog): scrim click and Escape close it. */
function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,42,92,.45)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={label} className="card dialog">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, padding: '6px 0', borderTop: '1px solid #E2E8F0', fontSize: 13 }}>
      <span style={{ color: '#475569' }}>{label}</span>
      <span style={{ color: '#0F2A5C' }}>{children}</span>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * UI-02 — แจ้งเตือนสต็อกและการพยากรณ์ / Stock alert queue.
 * Roles: PHARMACIST, PROCUREMENT_OFFICER (spec §15.1). Data is mock; actions are local state.
 * APIs it will call when wired: GET /alerts (API-F1a-005), POST /alerts/{id}/ack (006),
 * POST /alerts/{id}/snooze (007); "สร้างคำขอ" → POST /borrow-requests (API-F1b-001).
 */
/**
 * `role` gates the alert actions (ack / snooze / create borrow request) through `lib/rbac.ts` and
 * drives the breadcrumb home.
 */
export function StockAlertsPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [tab, setTab] = useState<'queue' | 'all'>('queue');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [ved, setVed] = useState<Ved | null>(null);
  const [sort, setSort] = useState<SortMode>('default');
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
  const [snoozed, setSnoozed] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Live data: alerts + forecasts + usable stock from the API; mock rows when the alert API cannot be reached.
  const sa = useStockAlerts();
  const live = sa.source === 'live';
  const [actionError, setActionError] = useState<string | null>(null);
  const [snoozeTarget, setSnoozeTarget] = useState<StockAlertRow | null>(null);
  const [snoozeReason, setSnoozeReason] = useState('');
  const [snoozeHours, setSnoozeHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (sa.source === 'live') setTab(sa.rows.some((r) => r.alert) ? 'queue' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sa.source]);

  const demo = sa.source === 'mock';
  const allRows = live ? sa.rows : demo ? ALERT_ROWS : [];
  const queueRows = live ? sa.rows.filter((r) => r.alert) : demo ? QUEUE_ROWS : [];
  const base = tab === 'queue' ? queueRows : allRows;
  const tabCounts = { queue: queueRows.length, all: allRows.length };

  const severityCounts = useMemo(() => {
    const c: Record<'all' | Severity, number> = { all: base.length, critical: 0, urgent: 0, normal: 0 };
    for (const r of base) if (r.alert) c[r.alert.severity] += 1;
    return c;
  }, [base]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = base.filter((r) => {
      if (severity !== 'all' && r.alert?.severity !== severity) return false;
      if (ved && r.ved !== ved) return false;
      if (needle && !`${r.drug} ${r.code}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return sortAlertRows(filtered, sort);
  }, [base, severity, ved, search, sort]);

  const selectedRow = selected ? ([...allRows, ...ALERT_ROWS].find((r) => r.id === selected) ?? null) : null;
  const justCreated = selectedRow ? created.has(selectedRow.id) : false;

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAction = (row: StockAlertRow, cond: RowActionCond) => {
    if (live) {
      // Live: the server owns the alert state (SM-8). Creating a borrow request waits for the F1b API.
      if (cond === 'ack' && row.alert) void runAction(() => sa.ack(row.alert!.alertId));
      else if (cond === 'snooze') {
        setSnoozeReason('');
        setSnoozeHours(24);
        setSnoozeTarget(row);
      } else if (cond === 'create' && row.alert) {
        // API-F1b-001 then -004: the request is created and its lender ladder proposed; approval happens on the requests page.
        void runAction(async () => {
          const created = await createBorrowRequest({ stockAlertId: row.alert!.alertId });
          const proposed = await proposeBorrowRequest(created.id);
          await sa.reload();
          setNotice(`สร้างคำขอ ${proposed.data.requestNo} แล้ว (${proposed.data.status === 'ESCALATED' ? 'ไม่พบผู้ให้ยืมที่เหมาะสม' : 'รออนุมัติที่หน้า “คำขอยืม”'})`);
        });
      }
      else setSelected(row.id);
      return;
    }
    if (cond === 'ack') setAcked((prev) => new Set(prev).add(row.id));
    else if (cond === 'snooze') setSnoozed((prev) => new Set(prev).add(row.id));
    else if (cond === 'create') {
      setCreated((prev) => new Set(prev).add(row.id));
      setSelected(row.id);
    } else setSelected(row.id); // request | detail
  };

  /** Status after the pharmacist's local ack / snooze / create actions (same rule the table uses). */
  const effectiveStatus = (r: StockAlertRow) =>
    live ? (r.alert?.status ?? 'open') : snoozed.has(r.id) ? 'snoozed' : acked.has(r.id) ? 'acknowledged' : created.has(r.id) ? 'linked' : (r.alert?.status ?? 'open');

  /** Client-side CSV of the currently filtered rows (mock "ส่งออก"). */
  const exportCsv = () => {
    const header = ['ยา', 'รหัส HIS', 'ABC', 'VED', 'คงเหลือ', 'หน่วย', 'ใช้ได้อีก(วัน)', 'ใช้/วัน', 'Predict', 'Total Target', 'วิธีพยากรณ์', 'แจ้งเตือน', 'สถานะ', 'เวลา', 'เลขคำขอ'];
    const lines = rows.map((r) => [
      r.drug, r.code, r.abc, r.ved, r.onHand, r.unit, r.daysLeft, r.dailyUse,
      r.predict ?? '', r.totalTarget ?? (r.max ?? ''), r.method ?? '',
      r.alert ? ALERT_TYPE_META[r.alert.type].th : '',
      r.alert ? ALERT_STATUS_META[effectiveStatus(r)].labelTh : '',
      r.alert?.time ?? '', r.alert?.brNo ?? (created.has(r.id) ? 'BR-2026-000126' : ''),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-alerts-ui02.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="pagehead" data-part="page-header">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">แจ้งเตือนสต็อก</span>
          </nav>
          <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: '38px', fontWeight: 600, color: '#0F2A5C' }}>
            แจ้งเตือนสต็อกและการพยากรณ์
          </h1>
          <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2 }}>{PHARMACY_CONTEXT.subtitle}</div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={() => setHistoryOpen(true)}>
            <Icon name="history" />
            ประวัติ
          </button>
          <button className="btn btn-s" onClick={exportCsv}>
            <Icon name="upload" />
            ส่งออก
          </button>
        </div>
      </section>

      <StockAlertSummary cards={live ? sa.cards ?? undefined : undefined} />

      {sa.source === 'mock' && (
        <div className="card" role="status" style={{ padding: '10px 16px', fontSize: 13, color: '#0F2A5C' }}>
          โหลดแจ้งเตือนจริงไม่ได้ ({sa.error}) · แสดงข้อมูลตัวอย่างแทน
        </div>
      )}
      {live && (
        <div className="card" role="status" style={{ padding: '10px 16px', fontSize: 13, color: '#0F2A5C' }}>
          แจ้งเตือนมาจากระบบจริง (ประเมินจากสต็อกที่ใช้ได้เทียบผลพยากรณ์)
          {sa.forecastMeta ? ` · โมเดล ${sa.forecastMeta.modelVersion ?? '—'}${sa.forecastMeta.originUsed ? ` รอบ ${sa.forecastMeta.originUsed}` : ''}${sa.forecastMeta.mockData ? ' · ข้อมูลสมมติ' : ''}` : ' · ยังไม่มีผลพยากรณ์ (ผู้ดูแลระบบต้องสั่งรัน)'}
        </div>
      )}
      {(notice || actionError) && (
        <div className="card" role={actionError ? 'alert' : 'status'} style={{ padding: '10px 16px', fontSize: 13, color: actionError ? '#B91C1C' : '#0F2A5C' }}>
          {actionError ?? notice}
        </div>
      )}

      <section className="card" data-part="stock-alert-toolbar" style={{ padding: '16px 20px 8px' }}>
        <StockAlertToolbar
          tab={tab}
          onTab={setTab}
          tabCounts={tabCounts}
          search={search}
          onSearch={setSearch}
          severity={severity}
          onSeverity={setSeverity}
          severityCounts={severityCounts}
          ved={ved}
          onVed={setVed}
          sort={sort}
          onSort={setSort}
        />
        <StockAlertTable rows={rows} acked={acked} snoozed={snoozed} created={created} onAction={handleAction} role={role} />
        <div className="num" style={{ textAlign: 'right', fontSize: 12, color: '#475569', marginTop: 10 }}>
          แสดง {rows.length} จาก {base.length} รายการ
        </div>
      </section>

      {snoozeTarget && (
        <Modal label={`เลื่อนเตือน ${snoozeTarget.drug}`} onClose={() => setSnoozeTarget(null)}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0F2A5C' }}>เลื่อนเตือน · {snoozeTarget.drug}</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label style={{ fontSize: 13 }}>
              เลื่อนไป (ชั่วโมง, สูงสุด 168)
              <input className="inp num" type="number" min={1} max={168} value={snoozeHours} onChange={(e) => setSnoozeHours(Number(e.target.value))} style={{ display: 'block', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13 }}>
              เหตุผล (บังคับ · บันทึกใน audit)
              <textarea className="inp" rows={2} value={snoozeReason} onChange={(e) => setSnoozeReason(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn btn-s btn-sm" onClick={() => setSnoozeTarget(null)}>ยกเลิก</button>
            <button
              className="btn btn-p btn-sm"
              disabled={busy || snoozeReason.trim().length < 3 || snoozeHours < 1 || snoozeHours > 168}
              onClick={() => {
                const target = snoozeTarget;
                if (!target.alert) return;
                void runAction(async () => {
                  await sa.snooze(target.alert!.alertId, snoozeReason.trim(), snoozeHours);
                  setSnoozeTarget(null);
                });
              }}
            >
              {busy ? 'กำลังบันทึก…' : 'ยืนยันเลื่อนเตือน'}
            </button>
          </div>
        </Modal>
      )}

      {historyOpen && (
        <Modal label="ประวัติการแจ้งเตือน / Alert history" onClose={() => setHistoryOpen(false)}>
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ประวัติ
          </h2>
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
            {ALERT_HISTORY.map((h) => (
              <li key={h.time + h.text} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid #E2E8F0', fontSize: 13 }}>
                <span className="num" style={{ minWidth: 56, color: '#475569' }}>{h.time}</span>
                <span style={{ flex: 1, color: '#0F2A5C' }}>{h.text}</span>
                <span style={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>{h.actor}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-s btn-sm" onClick={() => setHistoryOpen(false)}>ปิด</button>
          </div>
        </Modal>
      )}

      {selectedRow && (
        <Modal label={`รายละเอียด ${selectedRow.drug}`} onClose={() => setSelected(null)}>
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            {selectedRow.drug}
          </h2>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <span className="code">{selectedRow.code}</span> · VED {selectedRow.ved} · ABC {selectedRow.abc}
          </div>

          {justCreated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              <Icon name="checkc" className="ic14" />
              สร้างคำขอยืมแล้ว (ตัวอย่าง) · BR-2026-000126 · รอผู้ให้ยืมตอบรับ
            </div>
          )}

          <Field label="คงเหลือ">
            <span className="num">{fmt(selectedRow.onHand)}</span> {selectedRow.unit}
          </Field>
          <Field label="ใช้ได้อีก">
            <span className="num">{fmt(selectedRow.daysLeft)}</span> วัน · ใช้ {fmt(selectedRow.dailyUse)}/วัน
          </Field>
          <Field label="Predict · Total Target">
            {selectedRow.totalTarget ? (
              <>
                <span className="num">{fmt(selectedRow.predict ?? 0)} · {fmt(selectedRow.totalTarget)}</span>
              </>
            ) : selectedRow.max ? (
              <span className="num">Min {fmt(selectedRow.min ?? 0)} · Max {fmt(selectedRow.max)}</span>
            ) : (
              <span style={{ color: '#94A3B8' }}>—</span>
            )}
          </Field>
          <Field label="วิธีพยากรณ์">
            <span className="code">{selectedRow.method ?? '—'}</span> · {selectedRow.methodNote}
          </Field>
          <Field label="เทียบกับเป้า">
            <span style={{ color: '#0F2A5C' }}>{selectedRow.note}</span>
          </Field>
          {selectedRow.alert && (
            <Field label="แจ้งเตือน">
              {ALERT_TYPE_META[selectedRow.alert.type].th} · {SEVERITY_META[selectedRow.alert.severity].labelTh} ·{' '}
              {ALERT_STATUS_META[selectedRow.alert.status].labelTh} · <span className="num">{selectedRow.alert.time}</span>
              {selectedRow.alert.brNo && <> · <span className="code">{selectedRow.alert.brNo}</span></>}
            </Field>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn btn-g btn-sm" onClick={() => setSelected(null)}>ปิด</button>
            <button className="btn btn-p btn-sm" onClick={() => setSelected(null)}>รับทราบ</button>
          </div>
        </Modal>
      )}
    </>
  );
}
