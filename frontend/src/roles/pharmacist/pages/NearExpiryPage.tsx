import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExpiryPipelineStepper } from '../components/ExpiryPipelineStepper';
import { ReasonDialog } from '../../hospital-admin/components/ReasonDialog';
import { NearExpiryDrawer } from '../components/NearExpiryDrawer';
import { usePoolAndPlans } from '../data/useExpiryF2';
import { mayActFor } from '../../../lib/rbac';
import { useNearExpiry } from '../data/useNearExpiry';
import { dismissNearExpiry, getValue, keepNearExpiry, releaseNearExpiry, scanNearExpiryNow, withdrawNearExpiry } from '../../../services/expiryApi';
import type { ApiValue } from '../../../services/expiryApi';
import { useAuth } from '../../../context/AuthContext';
import {
  EXPIRY_KPIS,
  REPEAT_LABEL,
  cleanNote,
  lotValue,
  releasable,
} from '../data/nearExpiry';
import type { NearExpiryItem, NearExpiryStatus } from '../data/nearExpiry';
import '../near-expiry.css';

type ExpiryTab = 'review' | 'new7' | 'released' | 'kept' | 'all';

interface TabDef {
  id: ExpiryTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'review', label: 'รอตัดสินใจ' },
  { id: 'new7', label: 'ใหม่กว่า 7 วัน' },
  { id: 'released', label: 'ปล่อยแล้ว' },
  { id: 'kept', label: 'เก็บไว้ใช้เอง' },
  { id: 'all', label: 'ทั้งหมด' },
];

/** Short status line for lots that are no longer waiting for a decision. */
function advice(i: NearExpiryItem): { text: string; cls: string } {
  if (i.status === 'EXPIRED') return { text: 'หมดอายุแล้ว · รอตัดออกจากบัญชี', cls: 'ne-adv-dead' };
  if (i.status === 'TRANSFERRED') return { text: 'โอนให้ รพ.อื่นแล้ว', cls: 'ne-adv-ok' };
  if (i.status === 'DISMISSED') return { text: cleanNote(i.note) || 'ปิดรายการ', cls: 'ne-adv-kept' };
  if (i.status === 'KEPT') return { text: i.keptReason ?? 'เก็บไว้ใช้เอง', cls: 'ne-adv-kept' };
  if (i.status === 'ALLOCATED')
    return { text: 'อยู่ในแผนจัดสรร · รอเอกสารและขนส่ง', cls: 'ne-adv-ok' };
  if (i.status === 'RELEASED')
    return { text: `ปล่อยแล้ว ${i.releasedQty} ${i.unit} · รอจัดสรร`, cls: 'ne-adv-ok' };
  const r = releasable(i);
  if (r === 0) return { text: 'ใช้ทันก่อนหมดอายุ · ไม่ต้องปล่อย', cls: 'ne-adv-kept' };
  return { text: `ปล่อยได้ ${r} ${i.unit}`, cls: 'ne-adv-go' };
}

/**
 * UI-07 Near-expiry review (spec F2a, JOB-05). UI only: mock data, release/keep
 * decisions are local state. Released lots show as ถูกกันไว้ in the central pool.
 */
/**
 * UI-07 Near-expiry review. `role` gates the release/keep decision through `lib/rbac.ts` and drives
 * the breadcrumb home.
 */
export function NearExpiryPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [tab, setTab] = useState<ExpiryTab>('review');
  const ne = useNearExpiry();
  const f2 = usePoolAndPlans();
  const mayRelease = mayActFor(role, 'PHARMACIST', 'releaseNearExpiry');
  /** Quantity the pharmacist chose to release per lot (default = the FEFO suggestion). */
  const [relQty, setRelQty] = useState<Record<string, number>>({});
  /** Row whose quantity box is open (the suggested amount is shown as plain text until the user asks to change it). */
  const [editId, setEditId] = useState<string | null>(null);
  /** Dialog for a row action: release a quantity, or keep the whole lot (needs a reason). */
  const [rowAction, setRowAction] = useState<{ kind: 'release'; item: NearExpiryItem; rel: number } | { kind: 'keep'; item: NearExpiryItem } | null>(null);
  const { user } = useAuth();
  const live = ne.source === 'live';
  const [localItems, setItems] = useState<NearExpiryItem[] | null>(null);
  const items = live ? ne.items : (localItems ?? ne.items);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [value, setValue] = useState<ApiValue | null>(null);
  useEffect(() => {
    if (live) getValue(12).then(setValue).catch(() => setValue(null));
  }, [live]);
  const [selId, setSelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inTab = (i: NearExpiryItem): boolean => {
    switch (tab) {
      case 'review':
        return i.status === 'PENDING';
      case 'new7':
        return i.status === 'PENDING' && i.detectedAgoDays <= 7;
      case 'released':
        return i.status === 'RELEASED' || i.status === 'ALLOCATED' || i.status === 'TRANSFERRED';
      case 'kept':
        return i.status === 'KEPT';
      default:
        return true;
    }
  };

  const counts = {
    review: items.filter((i) => i.status === 'PENDING').length,
    new7: items.filter((i) => i.status === 'PENDING' && i.detectedAgoDays <= 7).length,
    released: items.filter((i) => i.status === 'RELEASED' || i.status === 'ALLOCATED' || i.status === 'TRANSFERRED').length,
    kept: items.filter((i) => i.status === 'KEPT').length,
    all: items.length,
  } as Record<ExpiryTab, number>;
  const kpis = live
    ? [
        { label: 'รอตัดสินใจ', en: 'pending', value: `${counts.review} ล็อต`, sub: `รวมมูลค่า ฿${Math.round(items.filter((i) => i.status === 'PENDING').reduce((s, i) => s + lotValue(i), 0)).toLocaleString()} · ใหม่กว่า 7 วัน ${counts.new7} ล็อต`, accent: '#D97706', accentBg: '#FFF7ED' },
        { label: 'ปล่อยเข้าคลังกลางแล้ว', en: 'released', value: `${counts.released} ล็อต`, sub: `รวมมูลค่า ฿${Math.round(items.filter((i) => ['RELEASED', 'ALLOCATED', 'TRANSFERRED'].includes(i.status)).reduce((s, i) => s + lotValue(i), 0)).toLocaleString()}`, accent: '#166534', accentBg: '#F0FDF4' },
        { label: 'มูลค่ายาที่ไม่ต้องทิ้ง (12 เดือน)', en: 'avoided', value: value ? `฿${Math.round(value.totals.transferredValueThb).toLocaleString()}` : '–', sub: value ? `ค่าขนส่ง ฿${Math.round(value.totals.transportCostThb).toLocaleString()} · หมดอายุทิ้งไปแล้ว ฿${Math.round(value.totals.expiredWriteOffThb).toLocaleString()}` : 'ยังไม่มีข้อมูล', accent: '#1D4ED8', accentBg: '#EFF6FF' },
      ]
    : EXPIRY_KPIS;

  const rows = items.filter(inTab);
  const stepCounts = {
    expiry: counts.review,
    pool: f2.pool.length,
    plans: f2.plans.filter((p) => p.status === 'PENDING_MY_APPROVAL').length,
    discussion: f2.plans.filter((p) => p.status === 'NEEDS_DISCUSSION').length,
  };
  const sel = items.find((i) => i.id === selId) ?? rows[0];

  /** Live: every decision is an API call (release holds the quantity, keep/dismiss/withdraw need a reason). */
  const decideLive = (item: NearExpiryItem, status: NearExpiryStatus, qty?: number, reason?: string) => {
    if (!item.uuid) return;
    const call =
      status === 'RELEASED' ? releaseNearExpiry(item.uuid, qty ?? releasable(item), item.version)
      : status === 'KEPT' ? keepNearExpiry(item.uuid, reason ?? '', item.version)
      : status === 'DISMISSED' ? dismissNearExpiry(item.uuid, reason ?? '')
      : withdrawNearExpiry(item.uuid, reason ?? '');
    setBusy(true);
    setActionError(null);
    call.then(() => ne.reload()).catch((e: Error) => setActionError(e.message)).finally(() => setBusy(false));
  };

  /** Demo / on-demand: run the near-expiry scan now instead of waiting for the server timer. */
  const scanNow = () => {
    setBusy(true);
    setActionError(null);
    setScanNote(null);
    scanNearExpiryNow()
      .then((r) => { setScanNote(['ตรวจเสร็จแล้ว', r.detected > 0 ? `พบล็อตใหม่ ${r.detected} ล็อต` : 'ไม่พบล็อตใหม่', r.reevaluated > 0 ? `กลับมาให้ตัดสินใจใหม่ ${r.reevaluated}` : '', r.writeOffs > 0 ? `หมดอายุแล้ว ${r.writeOffs}` : ''].filter(Boolean).join(' · ')); return ne.reload(); })
      .catch((e: Error) => setActionError(e.message))
      .finally(() => setBusy(false));
  };

  const decide = (id: string, status: NearExpiryStatus, qty?: number) => {
    setItems((prev) =>
      (prev ?? items).map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              releasedQty: status === 'RELEASED' ? qty ?? releasable(i) : i.releasedQty,
              keptReason:
                status === 'KEPT'
                  ? `เภสัชกรตัดสินใจเก็บใช้เอง ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                  : i.keptReason,
            }
          : i,
      ),
    );
  };

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };

  /** Client-side CSV export of filtered near-expiry items (QA-PHARM-007). */
  const exportCsv = () => {
    const header = ['รหัสรายการ', 'ยา', 'VED', 'เลขล็อต', 'วันหมดอายุ', 'เหลืออีก (วัน)', 'สต็อกคงเหลือ', 'หน่วย', 'มูลค่า (บาท)', 'สถานะ', 'จำนวนที่ปล่อย'];
    const lines = rows.map((r) => [
      r.id,
      r.drug,
      r.ved,
      r.lot,
      r.expiry,
      r.daysLeft,
      r.qty,
      r.unit,
      Math.round(lotValue(r)),
      r.status,
      r.releasedQty ?? '',
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `near-expiry-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">ยาใกล้หมดอายุ</span>
          </nav>
          <h1 className="tr-title">ยาใกล้หมดอายุ</h1>
          <div style={{ fontSize: 13 }}>
            {user?.hospitalName ?? 'รพ.สมุทรปราการ'} · ระบบตรวจให้อัตโนมัติ ล็อตที่เหลืออายุไม่ถึง 180 วันจะขึ้นที่นี่
          </div>
        </div>
        <div className="pagehead-actions">
          {live && (
            <button className="btn btn-p" onClick={scanNow} disabled={busy} title="ตรวจล็อตใกล้หมดอายุของทุกโรงพยาบาลตอนนี้ (ระบบตรวจให้เองทุก 15 นาทีอยู่แล้ว)">
              <Icon name="refresh" />
              {busy ? 'กำลังตรวจ…' : 'ตรวจตอนนี้'}
            </button>
          )}
          <button className="btn btn-s" onClick={exportCsv} title="ส่งออกข้อมูลเป็นไฟล์ CSV">
            <Icon name="download" />
            ส่งออก CSV
          </button>
          <button className="btn btn-s" onClick={() => window.print()} title="พิมพ์หรือบันทึกเป็น PDF">
            <Icon name="fileText" />
            พิมพ์
          </button>
        </div>
      </section>

      {(scanNote || actionError) && (
        <div className="card" role={actionError ? 'alert' : 'status'} style={{ padding: '10px 16px', fontSize: 13, color: actionError ? '#B91C1C' : '#0F2A5C' }}>{actionError ?? scanNote}</div>
      )}

      <ExpiryPipelineStepper current="expiry" counts={stepCounts} role={role} />

      {/* KPI row — colored accent tiles from the mockup */}
      <section className="ne-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="ne-kpi" style={{ background: k.accentBg, borderColor: k.accent }}>
            <div className="ne-kpi-label">{k.label}</div>
            <div className="ne-kpi-val" style={{ color: k.accent }}>
              {k.value}
            </div>
            <div className="ne-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab ${tab === t.id ? 'tab-on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} <span className="cnt">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="sub">
            เรียงจากมูลค่าที่เสี่ยงเสียหายมากสุด · แถบแดงซ้าย = ยาที่เคยหมดอายุมาแล้ว · กดแถวเพื่อดูรายละเอียด
          </div>
        </div>

        <div className="ne-tablewrap">
          <table className="tbl ne-tbl" aria-label="รายการยาใกล้หมดอายุ">
            <thead>
              <tr>
                <th style={{ width: 40 }}><span className="srt">ระดับความจำเป็นของยา</span></th>
                <th style={{ width: '28%' }}>ยา</th>
                <th style={{ width: '11%' }}>คงคลัง</th>
                <th style={{ width: '17%' }}>หมดอายุ</th>
                <th style={{ width: '11%', textAlign: 'right' }}>มูลค่า</th>
                <th style={{ width: 420 }}>ตัดสินใจ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const a = advice(i);
                const pct = Math.max(0, Math.min(1, i.daysLeft / i.thresholdDays));
                return (
                  <tr
                    key={i.id}
                    className={`${drawerOpen && sel?.id === i.id ? 'r-active' : ''} ${
                      i.repeatFlag ? 'ne-r-flag' : ''
                    }`}
                  >
                    <td>
                      <button className="rowbtn" onClick={() => open(i.id)} aria-label={`เปิดรายละเอียด ${i.drug}`}>
                        <span className={`ved ved-${i.ved} ved-sm`}>{i.ved}</span>
                      </button>
                    </td>
                    <td>
                      <button className="rowbtn" onClick={() => open(i.id)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <b style={{ color: '#0F2A5C', fontWeight: 600 }}>{i.drug}</b>
                          {i.repeatFlag && (
                            <span className="badge t-red" style={{ height: 20, fontSize: 12, fontWeight: 600 }} title="ยาตัวนี้เคยหมดอายุมาแล้วในรอบ 12 เดือน">
                              {REPEAT_LABEL[i.repeatFlag]}
                            </span>
                          )}
                        </div>
                        <div className="sub" style={{ marginTop: 2 }}>
                          {i.code} · ล็อต {i.lot}
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                        {i.qty} {i.unit}
                      </span>
                      {i.releasedQty !== undefined && i.status !== 'PENDING' && (
                        <div className="sub">
                          ปล่อยแล้ว {i.releasedQty} {i.unit}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ color: '#0F2A5C' }}>{i.expiry}</div>
                      <div className="ne-bar" title={`เหลือ ${i.daysLeft} วัน จากเกณฑ์ ${i.thresholdDays} วัน`}>
                        <span
                          style={{
                            width: `${pct * 100}%`,
                            background: i.daysLeft < 0 ? '#94A3B8' : i.daysLeft <= 30 ? '#DC2626' : pct > 0.66 ? '#F59E0B' : '#EA580C',
                          }}
                        />
                      </div>
                      <div className="sub num" style={i.daysLeft >= 0 && i.daysLeft <= 30 ? { color: '#B91C1C', fontWeight: 600 } : undefined}>
                        {i.daysLeft >= 0 ? `เหลือ ${i.daysLeft} วัน` : 'หมดอายุแล้ว'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                        ฿{lotValue(i).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {i.status === 'PENDING' ? (
                        (() => {
                          const maxRel = releasable(i);
                          const rel = Math.min(maxRel, Math.max(0, relQty[i.id] ?? maxRel));
                          const stay = i.qty - rel;
                          const editing = editId === i.id || (maxRel > 0 && rel !== maxRel);
                          const keepAll = (auto: boolean) => {
                            if (!auto) { setRowAction({ kind: 'keep', item: i }); return; }
                            const why = 'ใช้ทันก่อนหมดอายุ ไม่ต้องปล่อยเข้าคลังกลาง';
                            if (live) decideLive(i, 'KEPT', undefined, why);
                            else decide(i.id, 'KEPT');
                          };
                          return (
                            <div className="ne-act">
                              {maxRel > 0 ? (
                                <>
                                  {editing ? (
                                    <div className="ne-edit">
                                      <span>ปล่อย</span>
                                      <label className="ne-qty" title={`ปล่อยได้สูงสุด ${maxRel.toLocaleString()} ${i.unit}`}>
                                        <input
                                          className="num"
                                          type="number"
                                          min={0}
                                          max={maxRel}
                                          value={rel}
                                          disabled={!mayRelease || busy}
                                          aria-label={`จำนวนที่จะปล่อย ${i.drug}`}
                                          onChange={(e) => setRelQty((m) => ({ ...m, [i.id]: Math.max(0, Math.min(maxRel, Math.floor(Number(e.target.value) || 0))) }))}
                                        />
                                        <span>{i.unit}</span>
                                      </label>
                                      <span className="ne-hint num">จาก {maxRel.toLocaleString()}</span>
                                      <button
                                        type="button"
                                        className="link"
                                        onClick={() => { setRelQty((m) => ({ ...m, [i.id]: maxRel })); setEditId(null); }}
                                      >
                                        ใช้ค่าแนะนำ
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="ne-sum num">
                                      <span>ปล่อยได้ <b>{rel.toLocaleString()} {i.unit}</b></span>
                                      <span className="ne-sum-keep">เก็บไว้ใช้เอง {stay.toLocaleString()}</span>
                                    </div>
                                  )}
                                  <div className="ne-act-line">
                                    <button
                                      className="btn btn-p btn-sm"
                                      disabled={!mayRelease || busy || rel <= 0}
                                      title={mayRelease ? (rel <= 0 ? 'ใส่จำนวนที่จะปล่อยก่อน' : undefined) : 'เฉพาะเภสัชกรเจ้าของล็อตปล่อยเข้าคลังกลางได้'}
                                      onClick={() => setRowAction({ kind: 'release', item: i, rel })}
                                    >
                                      ปล่อยเข้าคลังกลาง
                                    </button>
                                    <button className="btn btn-g btn-sm" disabled={!mayRelease || busy} onClick={() => keepAll(false)}>
                                      เก็บไว้ทั้งล็อต
                                    </button>
                                    {!editing && mayRelease && (
                                      <button type="button" className="link ne-adjust" disabled={busy} onClick={() => setEditId(i.id)}>
                                        ปรับจำนวน
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="ne-sum"><span className="ne-sum-keep">ใช้ทันก่อนหมดอายุ · ไม่ต้องปล่อย</span></div>
                                  <div className="ne-act-line">
                                    <button className="btn btn-p btn-sm" disabled={!mayRelease || busy} onClick={() => keepAll(true)}>
                                      ยืนยันเก็บไว้ใช้เอง
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <span className={a.cls}>{a.text}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8' }}>
                    ไม่มีรายการในมุมมองนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="tbl-foot">
          <span>
            แสดง {rows.length} รายการ · ยาที่ปล่อยเข้าคลังกลางแล้วจะไม่นับเป็นสต็อกใช้งาน
          </span>
          <span>ตรวจอัตโนมัติทุก 15 นาที</span>
        </div>
      </section>

      {rowAction?.kind === 'release' && (
        <ConfirmDialog
          title="ปล่อยเข้าคลังกลาง"
          detail={
            <>
              <div><b>{rowAction.item.drug}</b> · ล็อต {rowAction.item.lot}</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                <li>ปล่อยเข้าคลังกลาง <b className="num">{rowAction.rel.toLocaleString()} {rowAction.item.unit}</b> (ถูกกันออกจากสต็อกใช้งานทันที)</li>
                <li>เก็บไว้ใช้เอง <b className="num">{(rowAction.item.qty - rowAction.rel).toLocaleString()} {rowAction.item.unit}</b></li>
                <li>ถอนกลับได้ก่อนแผนจัดสรรอนุมัติ</li>
              </ul>
            </>
          }
          confirmLabel={`ปล่อย ${rowAction.rel.toLocaleString()} ${rowAction.item.unit}`}
          busy={busy}
          onConfirm={() => {
            const { item, rel } = rowAction;
            setRowAction(null);
            if (live) decideLive(item, 'RELEASED', rel);
            else decide(item.id, 'RELEASED', rel);
          }}
          onClose={() => setRowAction(null)}
        />
      )}
      {rowAction?.kind === 'keep' && (
        <ReasonDialog
          title="เก็บไว้ใช้เองทั้งล็อต"
          detail={
            <>
              <div><b>{rowAction.item.drug}</b> · ล็อต {rowAction.item.lot} · <span className="num">{rowAction.item.qty.toLocaleString()} {rowAction.item.unit}</span></div>
              <div style={{ marginTop: 8 }}>จะไม่ปล่อยเข้าคลังกลาง และกลับมาให้ตัดสินใจใหม่เมื่อถึงวันทบทวน</div>
            </>
          }
          confirmLabel="เก็บไว้ใช้เอง"
          defaultReason="ต้องการเก็บไว้ใช้เอง"
          minLength={3}
          onConfirm={(reason) => {
            const { item } = rowAction;
            setRowAction(null);
            if (live) decideLive(item, 'KEPT', undefined, reason);
            else decide(item.id, 'KEPT');
          }}
          onClose={() => setRowAction(null)}
        />
      )}
      {drawerOpen && sel && (
        <NearExpiryDrawer
          key={sel.id}
          item={sel}
          role={role}
          onDecide={(status, qty, reason) => (live ? decideLive(sel, status, qty, reason) : decide(sel.id, status, qty))}
          live={live}
          busy={busy}
          error={actionError}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
