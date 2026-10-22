import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { setKitStock } from '../../../services/incidentApi';
import type { ApiKitStockRow } from '../../../services/incidentApi';
import { listReturnObligations, recordReturn } from '../../../services/returnsApi';
import type { ApiReturnObligation } from '../../../services/returnsApi';
import { ErrorNote } from '../../er/live/IncidentHeader';
import { LiveInbox } from '../../er/live/LiveInbox';
import { LiveKitStockCard, LivePackPanel } from '../../er/live/LivePack';
import { clock, dateTime, errorText, incidentStatusMeta, num, TRIAGE } from '../../er/live/format';
import { useEmergencyInbox, useIncidentList, useKitStockLive, useKitTasks } from '../../er/live/hooks';
import { getIncidentAccess } from '../../er/data/access';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'urgent' | 'pack' | 'stock' | 'incidents' | 'returns';

/** Count the ready sets after a physical count (API-F3-015). The count may not drop below the sets reserved for an incident. */
function StockEditor({ rows, reload }: { rows: ApiKitStockRow[]; reload: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (k: ApiKitStockRow) => {
    setBusy(k.kitTypeId);
    setError(null);
    try {
      await setKitStock(k.kitTypeId, Number(draft[k.kitTypeId]), 'นับสต็อกโดยคลัง');
      setDraft((d) => { const { [k.kitTypeId]: _x, ...rest } = d; return rest; });
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>นับสต็อกเซ็ตพร้อมใช้ <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>PUT /kit-stock</span></div>
      <ErrorNote message={error} />
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th scope="col">ชุด</th>
              <th scope="col" className="r">พร้อมใช้ (ระบบ)</th>
              <th scope="col" className="r">จองไว้ให้เหตุ</th>
              <th scope="col" style={{ width: 130, textAlign: 'center' }}>นับได้จริง</th>
              <th scope="col" style={{ width: 110 }}><span className="srt">บันทึก</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const v = draft[k.kitTypeId];
              const changed = v !== undefined && v !== '' && Number(v) !== k.ready;
              return (
                <tr key={k.kitTypeId}>
                  <td style={{ fontWeight: 600, color: '#0f2a5c' }}>{k.name}</td>
                  <td className="r">{num(k.ready)}</td>
                  <td className="r" style={{ color: k.held ? '#b45309' : '#94a3b8' }}>{num(k.held)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="number" min={k.held} value={v ?? String(k.ready)} aria-label={`นับได้จริง ${k.name}`} onChange={(e) => setDraft({ ...draft, [k.kitTypeId]: e.target.value })} style={{ width: 90, height: 30, textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, fontFamily: 'inherit' }} />
                  </td>
                  <td><button type="button" className="btn btn-p btn-sm" disabled={!changed || busy === k.kitTypeId} onClick={() => void save(k)}>บันทึก</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>นับต่ำกว่าจำนวนที่จองไว้ให้เหตุไม่ได้ · ทุกการแก้ถูกบันทึกใน audit log (ก่อน/หลัง)</div>
    </div>
  );
}

/** Post-incident returns: sets and items we owe, and what is owed to us. */
function ReturnsPanel() {
  const [rows, setRows] = useState<ApiReturnObligation[]>([]);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await listReturnObligations({ direction: 'all' });
      onLoadSuccess('wh-returns');
      setRows(r.items);
      setState('live');
    } catch (e) {
      onLoadFailure('wh-returns', e, [] as ApiReturnObligation[], [] as ApiReturnObligation[]);
      setState('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = rows.filter((r) => ['OPEN', 'REMINDED', 'OVERDUE'].includes(r.status));
  const done = rows.filter((r) => !['OPEN', 'REMINDED', 'OVERDUE'].includes(r.status)).slice(0, 10);
  const act = async (r: ApiReturnObligation) => {
    setBusy(r.id);
    setError(null);
    try {
      await recordReturn(r.id, Number(qty[r.id] ?? r.qtyRemaining));
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <ErrorNote message={error} />
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th scope="col">รายการ</th>
              <th scope="col">คู่ค้า</th>
              <th scope="col" className="r">ค้าง/ทั้งหมด</th>
              <th scope="col">กำหนดคืน</th>
              <th scope="col">สถานะ</th>
              <th scope="col" style={{ width: 230 }}><span className="srt">การดำเนินการ</span></th>
            </tr>
          </thead>
          <tbody>
            {[...open, ...done].length === 0 && <tr><td colSpan={6} style={{ color: '#94a3b8', fontSize: 12.5 }}>{state === 'loading' ? 'กำลังโหลด…' : 'ไม่มีภาระการคืน'}</td></tr>}
            {[...open, ...done].map((r) => {
              const owe = r.direction === 'OWE';
              const isOpen = ['OPEN', 'REMINDED', 'OVERDUE'].includes(r.status);
              const kit = Boolean(r.kitTypeId);
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                    {r.drug.name}
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{r.requestNo}{kit ? ' · ชุดทั้งชุด' : r.returnMode === 'BLOOD_REPLACEMENT' ? ' · โลหิต' : ''}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{owe ? `เราต้องคืน ${r.creditor.name}` : r.direction === 'OWED' ? `${r.debtor.name} ต้องคืนเรา` : `${r.debtor.name} → ${r.creditor.name}`}</td>
                  <td className="r">{num(r.qtyRemaining)} / {num(r.qty)} {r.drug.baseUnit}</td>
                  <td style={{ fontSize: 12.5, color: r.pastDue && isOpen ? '#b91c1c' : undefined }}>{new Date(r.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}{r.pastDue && isOpen ? ' · เกินกำหนด' : ''}</td>
                  <td><span className={`badge ${r.status === 'RETURNED' ? 'st-approved' : r.status === 'WAIVED' ? 't-grey' : r.pastDue ? 'st-rejected' : 'st-pending'}`}>{r.status === 'RETURNED' ? 'คืนแล้ว' : r.status === 'WAIVED' ? 'ยกเว้น' : r.pastDue ? 'เกินกำหนด' : 'ค้างคืน'}</span></td>
                  <td className="r">
                    {isOpen && owe && r.returnMode === 'IN_KIND' ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input type="number" min={kit ? 1 : 0.001} step={kit ? 1 : 'any'} max={r.qtyRemaining} value={qty[r.id] ?? String(r.qtyRemaining)} aria-label={`จำนวนที่คืน ${r.drug.name}`} onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })} style={{ width: 80, height: 30, textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit' }} />
                        <button type="button" className="btn btn-p btn-sm" disabled={busy === r.id} onClick={() => void act(r)}>บันทึกการคืน</button>
                      </span>
                    ) : isOpen && r.returnMode === 'BLOOD_REPLACEMENT' ? (
                      <span className="sub">ทดแทนผ่านธนาคารเลือด</span>
                    ) : isOpen ? (
                      <span className="sub">รอ {r.debtor.name} คืน</span>
                    ) : (
                      <span className="sub">บันทึกแล้ว</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * F3 for the warehouse officer, on the live API.
 *  - คำขอเร่งด่วน: urgent requests from other hospitals (we are the lender): confirm, give part, or decline.
 *  - แพ็กชุดยา: our own incidents' pack tasks; แพ็กเสร็จ → ของแยกถูกตัดตามสูตร ชุดพร้อมใช้เพิ่ม.
 *  - สต็อกชุด: count the ready sets. เหตุการณ์: read-only list. รับคืนหลังเหตุ: returns of sets and items.
 */
export function LiveKitPage() {
  const access = getIncidentAccess('WAREHOUSE_OFFICER');
  const [tab, setTab] = useState<Tab>('urgent');
  const inbox = useEmergencyInbox('all');
  const tasks = useKitTasks();
  const incidents = useIncidentList('all');
  const stock = useKitStockLive();
  const pending = inbox.legs.filter((l) => l.status === 'SENT');
  const packWaiting = tasks.tasks.filter((t) => t.status === 'TODO').length;
  const openIncidents = incidents.items.filter((i) => i.group === 'active');
  const lowKits = stock.rows.filter((k) => k.free <= 0).length;

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'urgent', label: 'คำขอเร่งด่วนจาก รพ.อื่น', n: pending.length, hint: 'รพ.อื่นเกิดเหตุและขอยืมของเรา · WH ยืนยัน/ปฏิเสธ (F1/F2 เภสัชกรเป็นผู้ตัดสิน)' },
    { id: 'pack', label: 'แพ็กชุดยา', n: packWaiting, hint: 'เหตุของ รพ.เรา · แพ็กตามแผนที่ ER อนุมัติ' },
    { id: 'stock', label: 'สต็อกชุด', n: lowKits, hint: 'นับเซ็ตพร้อมใช้หลังตรวจนับ' },
    { id: 'incidents', label: 'เหตุการณ์', n: openIncidents.length, hint: 'ดูอย่างเดียว · เหตุของ รพ.เรา' },
    { id: 'returns', label: 'รับคืนหลังเหตุ', n: 0, hint: 'บันทึกส่งคืน/รับคืนชุดและเวชภัณฑ์ที่ยืมกัน' },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">เตรียมชุดยา · เหตุฉุกเฉิน</span>
          </nav>
          <h1 className="tr-title">เตรียมชุดยา · เหตุฉุกเฉิน <span>/ Emergency (F3)</span></h1>
          <div style={{ fontSize: 13 }}>ตอบคำขอเร่งด่วนจาก รพ.อื่น (เราเป็นผู้ให้) · แพ็กชุดยาและดูแลเหตุของ รพ.เรา · เมื่อยืนยันแล้วงานส่งไปต่อที่ติดตามการขนส่ง</div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
            <Icon name="truck" />
            ติดตามการขนส่ง
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุป F3">
        <div className={`ib-kpi ${pending.length ? 'ib-kpi-crit' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">คำขอเร่งด่วนรอยืนยัน <span className="en">LENDER</span></div>
          <div className="ib-kpi-val num" style={{ color: pending.length ? '#B91C1C' : undefined }}>{pending.length} คำขอ</div>
          <div className="ib-kpi-sub">{pending.length ? 'ตอบภายใน 3-5 นาที · ฝั่งผู้ให้' : 'ไม่มีคำขอค้าง'}</div>
        </div>
        <div className={`ib-kpi ${packWaiting ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">งานแพ็กรอทำ <span className="en">PACK TASKS</span></div>
          <div className="ib-kpi-val num">{packWaiting} งาน</div>
          <div className="ib-kpi-sub">{packWaiting ? 'ยืนยันเมื่อแพ็กเสร็จ' : 'ไม่มีงานค้าง'}</div>
        </div>
        <div className={`ib-kpi ${lowKits ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">ชุดที่ไม่มีว่างให้ยืม <span className="en">KITS</span></div>
          <div className="ib-kpi-val num">{lowKits} ชนิด</div>
          <div className="ib-kpi-sub">จาก {stock.rows.length} ชนิด · ว่าง = พร้อมใช้ − จอง</div>
        </div>
        <div className="ib-kpi ib-kpi-ok">
          <div className="ib-kpi-label">เหตุการณ์ที่เปิดอยู่ <span className="en">INCIDENTS</span></div>
          <div className="ib-kpi-val num">{openIncidents.length} เหตุ</div>
          <div className="ib-kpi-sub">ของ รพ.เรา</div>
        </div>
      </section>

      <div role="tablist" aria-label="F3" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 4px' }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" className={tab === t.id ? 'btn btn-p btn-sm' : 'btn btn-s btn-sm'} onClick={() => setTab(t.id)}>
            {t.label}{t.n > 0 ? ` (${t.n})` : ''}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>{active.hint}</div>

      {tab === 'urgent' && <LiveInbox legs={inbox.legs} canAct reload={() => { inbox.reload(); stock.reload(); }} />}
      {tab === 'pack' && <LivePackPanel access={access} />}
      {tab === 'stock' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 560px', minWidth: 300 }}><StockEditor rows={stock.rows} reload={stock.reload} /></div>
          <div style={{ flex: '1 1 300px', minWidth: 260 }}><LiveKitStockCard rows={stock.rows} /></div>
        </div>
      )}
      {tab === 'incidents' && (
        <div className="card" style={{ padding: '14px 18px', overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th scope="col">เลขที่</th>
                <th scope="col">เหตุการณ์</th>
                <th scope="col">ผู้ป่วย (แดง/เหลือง/เขียว)</th>
                <th scope="col">แจ้งเมื่อ</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {incidents.items.length === 0 && <tr><td colSpan={5} style={{ color: '#94a3b8', fontSize: 12.5 }}>ไม่มีเหตุการณ์</td></tr>}
              {incidents.items.map((i) => {
                const m = incidentStatusMeta(i.status);
                return (
                  <tr key={i.id}>
                    <td style={{ fontFamily: 'Inter, monospace', fontWeight: 600 }}>{i.incidentNo}</td>
                    <td>{i.type ?? '—'}{i.location.text ? ` · ${i.location.text}` : ''}</td>
                    <td>{TRIAGE.slice(0, 3).map((t) => <span key={t.key} style={{ background: t.bg, color: t.color, borderRadius: 6, padding: '1px 8px', fontSize: 11.5, fontWeight: 600, marginRight: 4 }}>{i.counts[t.key]}</span>)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{dateTime(i.createdAt)}</td>
                    <td><span className={`badge ${m.cls}`}>{m.label}</span>{i.closedAt ? <span style={{ fontSize: 11, color: '#94a3b8' }}> {clock(i.closedAt)}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'returns' && <ReturnsPanel />}
    </>
  );
}
