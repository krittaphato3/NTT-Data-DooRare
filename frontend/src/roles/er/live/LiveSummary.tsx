import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { closeIncident, getReconciliation, recordUsage } from '../../../services/incidentApi';
import type { ApiIncidentDetail, ApiReconciliation } from '../../../services/incidentApi';
import { ErrorNote } from './IncidentHeader';
import { dateTime, errorText, num } from './format';
import { useIncident } from './hooks';

interface UseRow {
  key: string;
  kind: 'KIT' | 'DRUG';
  id: string;
  name: string;
  unit: string;
  borrowed: number;
  planned: number;
  used: number;
}

function policyText(kind: 'KIT' | 'DRUG', mode: string | undefined, days: number | null): string {
  if (mode === 'BLOOD_REPLACEMENT') return 'ทดแทนผ่านธนาคารเลือด (BLOOD_REPLACEMENT)';
  const due = days === null ? '' : ` ภายใน ${days} วัน`;
  return kind === 'KIT' ? `คืนเป็นชุดเดียวกัน${due} · ชุดที่ไม่ได้ใช้คืนได้ทันที` : `คืนยาชนิดและจำนวนเดียวกัน${due} · ที่ไม่ได้ใช้คืนได้ทันที`;
}

const obligationBadge = (status: string): { label: string; cls: string } =>
  status === 'RETURNED' ? { label: 'คืนแล้ว', cls: 'st-approved' } : status === 'WAIVED' ? { label: 'ยกเว้น', cls: 't-grey' } : status === 'OVERDUE' ? { label: 'เกินกำหนด', cls: 'st-rejected' } : { label: 'ค้างคืน', cls: 'st-pending' };

interface Props {
  incidentId: string;
  role: RoleCode;
  /** ER and pharmacist record use and sign the close; others read. */
  mayWrite: boolean;
  onChanged?: () => void;
}

/**
 * Post-incident summary (F3 §11): borrowed items per lender and what is owed back, actual use, and the two signatures that
 * close the incident (ER staff requests, the pharmacist signs, or the other way round).
 */
export function LiveSummaryPanel({ incidentId, role, mayWrite, onChanged }: Props) {
  const { incident, reload } = useIncident(incidentId, 15000);
  const [rec, setRec] = useState<ApiReconciliation | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [used, setUsed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const loadRec = useCallback(() => {
    getReconciliation(incidentId)
      .then((r) => { setRec(r.data); setRecError(null); })
      .catch((e) => setRecError(errorText(e)));
  }, [incidentId]);
  useEffect(() => { setRec(null); setUsed({}); loadRec(); }, [loadRec]);

  const rows = useMemo<UseRow[]>(() => {
    if (!incident) return [];
    const map = new Map<string, UseRow>();
    const touch = (key: string, base: Omit<UseRow, 'borrowed' | 'planned' | 'used'>): UseRow => {
      const cur = map.get(key) ?? { ...base, borrowed: 0, planned: 0, used: 0 };
      map.set(key, cur);
      return cur;
    };
    for (const b of rec?.borrowed ?? []) {
      for (const i of b.items) {
        const id = (i.kitTypeId ?? i.drugMasterId) as string;
        touch(id, { key: id, kind: i.kind, id, name: i.name, unit: i.unit }).borrowed += i.qtyBorrowed;
      }
    }
    for (const k of incident.plan?.kits ?? []) {
      if (!k.kitTypeId) continue;
      touch(k.kitTypeId, { key: k.kitTypeId, kind: 'KIT', id: k.kitTypeId, name: k.name, unit: 'ชุด' }).planned = k.estimated;
    }
    for (const e of incident.plan?.extras ?? []) {
      if (!e.drugMasterId) continue;
      touch(e.drugMasterId, { key: e.drugMasterId, kind: 'DRUG', id: e.drugMasterId, name: e.name, unit: e.unit ?? 'หน่วย' }).planned = e.estimated;
    }
    for (const u of incident.usage) {
      const id = (u.kitTypeId ?? u.drugMasterId) as string;
      touch(id, { key: id, kind: u.kind, id, name: u.name, unit: u.unit }).used = u.qtyUsed;
    }
    return [...map.values()].sort((a, b) => b.borrowed - a.borrowed || a.name.localeCompare(b.name));
  }, [incident, rec]);

  if (!incident) return <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>กำลังโหลดสรุป…</div>;

  const running = incident.status === 'ACTIVE' || incident.status === 'CLOSE_REQUESTED';
  const requested = [...incident.updates].reverse().find((u) => u.action === 'INCIDENT_CLOSE_REQUESTED');
  const canSign = mayWrite && (role === 'ER_STAFF' || role === 'PHARMACIST');
  const otherRole = requested?.role === 'ER_STAFF' ? 'เภสัชกร' : 'เจ้าหน้าที่ห้องฉุกเฉิน';
  const sameRole = Boolean(requested && requested.role === role);

  const dirty = rows.filter((r) => (used[r.key] ?? String(r.used)) !== String(r.used));
  const saveUsage = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const lines = dirty.map((r) => ({ [r.kind === 'KIT' ? 'kitTypeId' : 'drugMasterId']: r.id, qtyUsed: Number(used[r.key]) }) as { drugMasterId?: string; kitTypeId?: string; qtyUsed: number });
      await recordUsage(incident.id, lines);
      setUsed({});
      setSaved(`บันทึกการใช้จริง ${lines.length} รายการแล้ว`);
      reload();
      loadRec();
      onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async (mode: 'REQUEST' | 'APPROVE') => {
    setBusy(true);
    setError(null);
    try {
      await closeIncident(incident.id, { mode, reason: reason.trim() || undefined });
      setReason('');
      reload();
      loadRec();
      onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ClosePanel incident={incident} running={running} canSign={canSign} requestedRole={requested?.role ?? null} requestedBy={requested?.by ?? null} requestedAt={requested?.at ?? null} otherRole={otherRole} sameRole={sameRole} reason={reason} setReason={setReason} busy={busy} close={close} />
      <ErrorNote message={error} />
      {saved && <div style={{ fontSize: 12.5, color: '#166534' }}>{saved}</div>}

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 12 }}>ยืม-คืนระหว่างโรงพยาบาล</div>
        {recError ? (
          <ErrorNote message={recError} />
        ) : !rec ? (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>กำลังโหลด…</div>
        ) : rec.borrowed.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>ยังไม่มีรายการที่ผู้ให้ยืมยืนยัน</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="qt" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th scope="col">ผู้ให้ยืม</th>
                  <th scope="col">รายการ</th>
                  <th scope="col" className="r">ยืนยัน/ได้รับ</th>
                  <th scope="col">สถานะ</th>
                  <th scope="col">การคืน</th>
                </tr>
              </thead>
              <tbody>
                {rec.borrowed.flatMap((b) =>
                  b.items.map((i) => {
                    const ob = i.obligation;
                    const bd = ob ? obligationBadge(ob.status) : null;
                    const days = ob ? Math.max(0, Math.round((new Date(ob.dueDate).getTime() - Date.now()) / 86_400_000)) : null;
                    return (
                      <tr key={i.legId}>
                        <td style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{b.lender.name}</td>
                        <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 13 }}>
                          {i.name} <span className="badge t-grey" style={{ height: 18, fontSize: 10.5 }}>{i.kind === 'KIT' ? 'ชุดทั้งชุด' : ob?.mode === 'BLOOD_REPLACEMENT' ? 'โลหิต' : 'ยา/เวชภัณฑ์'}</span>
                        </td>
                        <td className="r">{num(i.qtyBorrowed)} {i.unit}</td>
                        <td>{i.legStatus === 'RECEIVED' ? <span className="badge st-delivered">รับของแล้ว</span> : <span className="badge st-transit">ยังไม่ถึง</span>}</td>
                        <td style={{ fontSize: 12, color: '#334155' }}>
                          {ob && bd ? (
                            <>
                              <span className={`badge ${bd.cls}`} style={{ marginRight: 6 }}>{bd.label}</span>
                              {ob.status === 'RETURNED' ? `คืนครบ ${num(ob.returned)}` : `ค้าง ${num(ob.outstanding)} · ครบกำหนด ${new Date(ob.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
                              <div style={{ color: '#94a3b8', fontSize: 11 }}>{policyText(i.kind, ob.mode, ob.status === 'RETURNED' ? null : days)}</div>
                            </>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>ภาระการคืนเกิดเมื่อรับของแล้ว</span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>การใช้เวชภัณฑ์จริง <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>ใช้ประกอบการเบิก พ.ร.บ./UCEP</span></div>
          {mayWrite && running && <button type="button" className="btn btn-p btn-sm" disabled={busy || dirty.length === 0} onClick={() => void saveUsage()}>บันทึกการใช้จริง{dirty.length ? ` (${dirty.length})` : ''}</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">รายการ</th>
                <th scope="col" className="r">ในแผน</th>
                <th scope="col" className="r">ยืมมา</th>
                <th scope="col" style={{ width: 110, textAlign: 'center' }}>ใช้จริง</th>
                <th scope="col" className="r">มูลค่า (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#94a3b8', fontSize: 12.5 }}>ไม่มีรายการ</td></tr>}
              {rows.map((r) => {
                const value = rec?.usage.find((u) => (u.kitTypeId ?? u.drugMasterId) === r.id)?.valueThb ?? null;
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{r.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>{r.unit}</span></td>
                    <td className="r">{r.planned ? num(r.planned) : '—'}</td>
                    <td className="r">{r.borrowed ? num(r.borrowed) : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        step={r.kind === 'KIT' ? 1 : 'any'}
                        value={used[r.key] ?? String(r.used)}
                        disabled={!mayWrite || !running}
                        aria-label={`ใช้จริง ${r.name}`}
                        onChange={(e) => setUsed((prev) => ({ ...prev, [r.key]: e.target.value }))}
                        style={{ width: 84, height: 28, textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#0f2a5c', fontFamily: 'inherit' }}
                      />
                    </td>
                    <td className="r">{value === null ? <span style={{ color: '#cbd5e1' }}>—</span> : num(value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rec && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#475569', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>มูลค่ารวมที่ระบุได้ <b>{num(rec.totals.usageValueThb)}</b> บาท{rec.totals.unpricedUsageLines > 0 ? ` (ไม่รวม ${rec.totals.unpricedUsageLines} รายการที่ไม่มีราคา เช่น ชุดยา)` : ''}</span>
            <span>ค้างคืน <b>{rec.totals.outstandingReturns}</b> รายการ</span>
          </div>
        )}
        {rec && rec.unusedBorrowed.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
            ยืมมาแต่ไม่ได้ใช้ (ส่งคืนทันทีได้): {rec.unusedBorrowed.map((u) => `${u.name} ${num(u.unused)} ${u.unit}`).join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-s btn-sm" disabled title="ยังไม่รองรับการออกเอกสารสรุปเหตุการณ์ในระบบ (INCIDENT_REPORT)">
              <Icon name="printer" className="ic14" />
              สรุปยืม-คืน INCIDENT_REPORT
            </button>
            <button type="button" className="btn btn-s btn-sm" disabled title="ยังไม่รองรับการออกเอกสารสรุปเหตุการณ์ในระบบ (UCEP_REPORT)">
              <Icon name="printer" className="ic14" />
              สรุปการใช้เวชภัณฑ์ UCEP_REPORT
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>ใช้ประกอบการเบิก พ.ร.บ./UCEP ตามช่องทางปกติของโรงพยาบาล — ระบบไม่ขึ้นเบิกให้ · เอกสารสรุปยังออกจากระบบไม่ได้ ใช้ตารางด้านบนประกอบ</div>
        </div>
      </div>
    </div>
  );
}

function ClosePanel(p: {
  incident: ApiIncidentDetail;
  running: boolean;
  canSign: boolean;
  requestedRole: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  otherRole: string;
  sameRole: boolean;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  close: (mode: 'REQUEST' | 'APPROVE') => Promise<void>;
}) {
  const { incident } = p;
  if (incident.status === 'RECONCILED') {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 18px', fontSize: 12.5, color: '#166534' }}>
        สรุปเหตุการณ์แล้วเมื่อ {dateTime(incident.closedAt)} · ER และเภสัชกรลงนามร่วมกัน · ชุดที่จองไว้ถูกปล่อยแล้ว
      </div>
    );
  }
  if (incident.status === 'CANCELLED') {
    return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 18px', fontSize: 12.5, color: '#991b1b' }}>เหตุการณ์ถูกยกเลิก: {incident.cancelReason}</div>;
  }
  const requested = incident.status === 'CLOSE_REQUESTED';
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 320px' }}>
        <Icon name="link" className="ic16" style={{ color: '#2563eb', flex: 'none' }} />
        <div style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: '18px' }}>
          {requested
            ? `${p.requestedRole === 'ER_STAFF' ? 'เจ้าหน้าที่ห้องฉุกเฉิน' : 'เภสัชกร'}${p.requestedBy ? ` (${p.requestedBy})` : ''} ขอปิดเหตุการณ์ ${dateTime(p.requestedAt)} · รอ${p.otherRole}ลงนามร่วม จึงจะสรุปและปล่อยชุดที่จองไว้`
            : 'บันทึกจำนวนที่ใช้จริงหลังเหตุการณ์สงบ แล้ว “ขอปิดเหตุการณ์” — ER และเภสัชกรลงนามร่วมกัน ระบบจึงสรุปเหตุการณ์ (คำขอยืมที่ยังรอตอบจะถูกยกเลิก)'}
        </div>
      </div>
      {p.running && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={p.reason} onChange={(e) => p.setReason(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" aria-label="หมายเหตุการปิดเหตุการณ์" style={{ width: 200, height: 34, border: '1px solid #bfdbfe', borderRadius: 6, padding: '0 10px', fontFamily: 'inherit' }} />
          {requested ? (
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!p.canSign || p.sameRole || p.busy} title={p.sameRole ? `ต้องให้${p.otherRole}เป็นผู้ลงนาม` : p.canSign ? undefined : 'ต้องเป็นเจ้าหน้าที่ห้องฉุกเฉินหรือเภสัชกร'} onClick={() => void p.close('APPROVE')}>
              ลงนามปิดเหตุการณ์
            </button>
          ) : (
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!p.canSign || p.busy} title={p.canSign ? undefined : 'ต้องเป็นเจ้าหน้าที่ห้องฉุกเฉินหรือเภสัชกร'} onClick={() => void p.close('REQUEST')}>
              ขอปิดเหตุการณ์
            </button>
          )}
        </div>
      )}
    </div>
  );
}
