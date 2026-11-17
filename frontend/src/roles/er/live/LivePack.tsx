import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { confirmKitTask } from '../../../services/incidentApi';
import type { ApiKitStockRow, ApiKitTask } from '../../../services/incidentApi';
import type { IncidentAccess } from '../data/access';
import { ErrorNote } from './IncidentHeader';
import { clock, errorText, num } from './format';
import { useKitStockLive, useKitTasks } from './hooks';

/** Ready-set stock of the hospital: ready, reserved for an incident, free, and how many more could be packed from loose stock. */
export function LiveKitStockCard({ rows, note }: { rows?: ApiKitStockRow[]; note?: boolean }) {
  const own = useKitStockLive();
  const list = rows ?? own.rows;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
        ชุดพร้อมใช้ในคลัง
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th scope="col">ชุด</th>
              <th scope="col" className="r">พร้อมใช้</th>
              <th scope="col" className="r">จองไว้</th>
              <th scope="col" className="r">ว่าง</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4} style={{ color: '#94a3b8', fontSize: 12 }}>{own.source === 'loading' ? 'กำลังโหลด…' : 'ไม่มีข้อมูล'}</td></tr>}
            {list.map((k) => (
              <tr key={k.kitTypeId}>
                <td style={{ fontWeight: 600, color: '#0f172a', fontSize: 12.5 }}>
                  {k.name}
                  {!k.noRecipe && k.canPackMore > 0 && <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }} title={k.limitedBy ? `จำกัดโดย ${k.limitedBy}` : undefined}>จัดเพิ่มได้อีก {num(k.canPackMore)} ชุด</div>}
                </td>
                <td className="r" style={{ fontWeight: 700 }}>{num(k.ready)}</td>
                <td className="r" style={{ color: '#64748b' }}>{num(k.held)}</td>
                <td className="r">{num(k.free)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note !== false && (
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 8, fontSize: 10.5, color: '#94a3b8', lineHeight: '15px' }}>
          จองไว้ = ชุดที่แผนเหตุฉุกเฉินจะใช้ ให้ยืมไม่ได้
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, mayConfirm, hint, reload }: { task: ApiKitTask; mayConfirm: boolean; hint?: string; reload: () => void }) {
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = task.status === 'DONE';
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmKitTask(task.id);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const picked = task.components.filter((c) => ticks.has(c.drugMasterId)).length;
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>จัด {task.kit.name} × {task.qty} ชุด</span>
            <span className={`badge ${done ? 'st-approved' : 'st-pending'}`}>
              {done ? <Icon name="checkc" className="ic12" /> : <Icon name="hourglass" className="ic12" />}
              {done ? 'จัดเสร็จแล้ว' : 'รอจัด'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
            เหตุ {task.incident.incidentNo}{task.incident.type ? ` · ${task.incident.type}` : ''}
            {done && task.confirmedAt ? ` · ยืนยัน ${clock(task.confirmedAt)}${task.confirmedBy ? ` โดย ${task.confirmedBy.name}` : ''}` : ''}
          </div>
        </div>
        {!done && <span style={{ fontSize: 12, color: '#64748b' }}>หยิบแล้ว <b style={{ color: '#0f2a5c' }}>{picked}</b> จาก {task.components.length} รายการ</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 380 }}>
          <thead>
            <tr>
              {!done && <th scope="col" aria-label="หยิบแล้ว" style={{ width: 36 }} />}
              <th scope="col">ส่วนประกอบ</th>
              <th scope="col" className="r">ต้องหยิบ</th>
              <th scope="col" className="r">ของแยกคงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {task.components.map((c) => (
              <tr key={c.drugMasterId} >
                {!done && (
                  <td>
                    <input type="checkbox" checked={ticks.has(c.drugMasterId)} aria-label={`หยิบ ${c.name} แล้ว`} onChange={() => setTicks((prev) => { const n = new Set(prev); if (n.has(c.drugMasterId)) n.delete(c.drugMasterId); else n.add(c.drugMasterId); return n; })} style={{ cursor: 'pointer', accentColor: '#2563eb', width: 16, height: 16 }} />
                  </td>
                )}
                <td style={{ fontWeight: 500, color: '#0f172a', fontSize: 12.5 }}>{c.name}</td>
                <td className="r">
                  <b style={{ color: '#0f2a5c' }}>{num(c.need)}</b> <span style={{ color: '#94a3b8', fontSize: 11 }}>{c.unit}</span>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>ชุดละ {num(c.perKit)}</div>
                </td>
                <td className="r" style={{ color: c.enough ? '#64748b' : '#dc2626', fontWeight: c.enough ? 400 : 700 }}>
                  {num(c.free)}
                  {!c.enough && !done && <div style={{ fontSize: 11 }}>ไม่พอ</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!done && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!mayConfirm || busy || !task.canConfirm} title={mayConfirm ? (task.canConfirm ? undefined : 'ของแยกไม่ครบ ยืนยันไม่ได้') : hint} onClick={() => void confirm()}>
            {busy ? 'กำลังบันทึก…' : 'ยืนยันจัดชุดเสร็จ'}
          </button>
          {task.canConfirm ? (
            <span style={{ fontSize: 11.5, color: '#64748b' }}>กดแล้วระบบตัดของแยกและเพิ่มชุดพร้อมใช้ {task.qty} ชุด จองไว้ให้เหตุนี้</span>
          ) : (
            <span style={{ fontSize: 12, color: '#b91c1c' }}>ของแยกบางรายการไม่พอ จึงยืนยันไม่ได้</span>
          )}
        </div>
      )}
      <div style={{ marginTop: 6 }}><ErrorNote message={error} /></div>
    </div>
  );
}

/** Kit assembly for the hospital's incidents (all of them, or one when `incidentId` is given). */
export function LivePackPanel({ access, incidentId, showStock = true }: { access: IncidentAccess; incidentId?: string; showStock?: boolean }) {
  const { tasks, source, reload } = useKitTasks(incidentId);
  const stock = useKitStockLive();
  const refresh = () => { reload(); stock.reload(); };
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => t.status === 'TODO');
  // finished tasks of old incidents are history: only those of incidents still running are shown by default
  const done = tasks.filter((t) => t.status === 'DONE');
  const doneRunning = done.filter((t) => ['OPEN', 'PLAN_REVIEW', 'ACTIVE', 'CLOSE_REQUESTED'].includes(t.incident.status));
  const doneShown = showDone ? done.slice(0, 20) : doneRunning;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 600px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tasks.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#475569' }}>
            รอจัด <b style={{ color: '#0f2a5c' }}>{open.length}</b> งาน{open.length > 0 ? ` · รวม ${open.reduce((n, t) => n + t.qty, 0)} ชุด` : ''}
          </div>
        )}
        {tasks.length === 0 && <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>{source === 'loading' ? 'กำลังโหลด…' : 'ไม่มีงานจัดชุดจากแผนเหตุฉุกเฉิน'}</div>}
        {open.map((t) => <TaskCard key={t.id} task={t} mayConfirm={access.mayWrite} hint={access.writeHint} reload={refresh} />)}
        {doneShown.map((t) => <TaskCard key={t.id} task={t} mayConfirm={false} reload={refresh} />)}
        {done.length > doneRunning.length && (
          <button type="button" className="btn btn-s btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'ซ่อนงานจัดชุดของเหตุที่ปิดแล้ว' : `ดูงานจัดชุดของเหตุที่ปิดแล้ว (${done.length - doneRunning.length})`}
          </button>
        )}
      </div>
      {showStock && (
        <div style={{ flex: '1 1 300px', minWidth: 260 }}>
          <LiveKitStockCard rows={stock.rows} />
        </div>
      )}
    </div>
  );
}
