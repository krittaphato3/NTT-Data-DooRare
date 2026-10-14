import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
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

function Field({ label, en, children }: { label: string; en?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, padding: '6px 0', borderTop: '1px solid #E2E8F0', fontSize: 13 }}>
      <span style={{ color: '#475569' }}>
        {label}
        {en && <span className="en" style={{ display: 'block' }}>{en}</span>}
      </span>
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
export function StockAlertsPage() {
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

  const base = tab === 'queue' ? QUEUE_ROWS : ALERT_ROWS;
  const tabCounts = { queue: QUEUE_ROWS.length, all: ALERT_ROWS.length };

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

  const selectedRow = selected ? (ALERT_ROWS.find((r) => r.id === selected) ?? null) : null;
  const justCreated = selectedRow ? created.has(selectedRow.id) : false;

  const handleAction = (row: StockAlertRow, cond: RowActionCond) => {
    if (cond === 'ack') setAcked((prev) => new Set(prev).add(row.id));
    else if (cond === 'snooze') setSnoozed((prev) => new Set(prev).add(row.id));
    else if (cond === 'create') {
      setCreated((prev) => new Set(prev).add(row.id));
      setSelected(row.id);
    } else setSelected(row.id); // request | detail
  };

  /** Status after the pharmacist's local ack / snooze / create actions (same rule the table uses). */
  const effectiveStatus = (r: StockAlertRow) =>
    snoozed.has(r.id) ? 'snoozed' : acked.has(r.id) ? 'acknowledged' : created.has(r.id) ? 'linked' : (r.alert?.status ?? 'open');

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
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href="/" className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">แจ้งเตือนสต็อก</span>
          </nav>
          <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: '38px', fontWeight: 600, color: '#0F2A5C' }}>
            แจ้งเตือนสต็อกและการพยากรณ์{' '}
            <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8' }}>/ Stock alert queue · UI-02</span>
          </h1>
          <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
            {PHARMACY_CONTEXT.name} · ประเมินเมื่อ <span className="num">{PHARMACY_CONTEXT.evaluatedAt}</span> ·
            แจ้งเตือนล่าสุด <span className="num">{PHARMACY_CONTEXT.latestAlertAt}</span> ·
            HIS ซิงก์ล่าสุด <span className="num">{PHARMACY_CONTEXT.hisSyncedAt}</span>
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={() => setHistoryOpen(true)}>
            <Icon name="history" />
            ประวัติ
          </button>
          <button className="btn btn-s" onClick={exportCsv}>
            <Icon name="outArrow" />
            ส่งออก
          </button>
        </div>
      </section>

      <StockAlertSummary />

      <section className="card" style={{ padding: '16px 20px 8px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '8px 0 4px', fontSize: 12 }}>
          <span>เรียงตาม: ยา V ก่อน → มูลค่า ABC → วันคงเหลือ</span>
          <span className="num">แสดง {rows.length} จาก {base.length} รายการ</span>
        </div>
        <StockAlertTable rows={rows} acked={acked} snoozed={snoozed} created={created} onAction={handleAction} />
      </section>

      {historyOpen && (
        <Modal label="ประวัติการแจ้งเตือน / Alert history" onClose={() => setHistoryOpen(false)}>
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
            ประวัติ <span className="en">Alert history · audit_log</span>
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

          <Field label="คงเหลือ" en="On hand">
            <span className="num">{fmt(selectedRow.onHand)}</span> {selectedRow.unit}
          </Field>
          <Field label="ใช้ได้อีก" en="Days left">
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
          <Field label="วิธีพยากรณ์" en="Forecast method">
            <span className="code">{selectedRow.method ?? '—'}</span> · {selectedRow.methodNote}
          </Field>
          <Field label="เทียบกับเป้า">
            <span style={{ color: '#0F2A5C' }}>{selectedRow.note}</span>
          </Field>
          {selectedRow.alert && (
            <Field label="แจ้งเตือน" en="Alert">
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
