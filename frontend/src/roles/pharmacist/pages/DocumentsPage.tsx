import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { DocumentDrawer } from '../components/DocumentDrawer';
import { DOC_TABS, DOC_TYPE_META } from '../data/documents';
import { useDocuments } from '../data/useDocuments';
import type { TransferDoc } from '../data/documents';
import '../documents.css';

type StatusFilter = 'all' | 'ISSUED' | 'VOID';

/**
 * UI-15 Document printing (spec XC-1 / FL-10). UI only: mock documents; print /
 * PDF buttons are visual. Corrections never edit an issued document — a new
 * version is issued and the old one is VOID (FR-XC-005).
 */
/**
 * UI-15 Document printing. `role` gates the print actions through `lib/rbac.ts` and drives the
 * breadcrumb home.
 */
export function DocumentsPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const store = useDocuments();
  const DOCUMENTS = store.docs;
  /* Printing a borrow / transfer document belongs to the pharmacist and the warehouse (§4.1/§4.2). */
  const mayPrint = mayActFor(role, 'PHARMACIST', 'printDocuments');
  const printHint = requiredRoleHint('printDocuments');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabDef = DOC_TABS.find((t) => t.id === tab) ?? DOC_TABS[0];

  const counts = useMemo(
    () =>
      Object.fromEntries(
        DOC_TABS.map((t) => [t.id, t.types ? DOCUMENTS.filter((d) => t.types?.includes(d.type)).length : DOCUMENTS.length]),
      ) as Record<string, number>,
    [DOCUMENTS],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return DOCUMENTS.filter((d) => (tabDef.types ? tabDef.types.includes(d.type) : true))
      .filter((d) => status === 'all' || d.status === status)
      .filter(
        (d) =>
          !needle ||
          [d.id, d.drug, d.code, d.ref, d.partyA.name, d.partyB.name].some((t) => t.toLowerCase().includes(needle)),
      );
  }, [DOCUMENTS, tabDef, status, q]);

  // `?doc=<uuid>` (from the transport screen's "print slip") opens that document once the list is loaded.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('doc');
    if (!wanted) return;
    const found = DOCUMENTS.find((d) => d.uuid === wanted);
    if (found) {
      setTab('all');
      setSelId(found.id);
      setDrawerOpen(true);
    }
  }, [DOCUMENTS]);

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };

  const sel: TransferDoc | undefined = rows.find((d) => d.id === selId) ?? rows[0];

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">พิมพ์เอกสาร</span>
          </nav>
          <h1 className="tr-title">
            เอกสารยืม–คืน <span>/ Documents · UI-15</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            ระบบสร้างเอกสารให้พิมพ์ได้ทันทีหลังอนุมัติ (FR-XC-001) · เนื้อหาตรึงหลังออกเอกสาร แก้ = ออกใหม่ + ยกเลิกฉบับเดิม
            (FR-XC-005) · PDF เก็บใน S3 พร้อม SHA-256
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-p" disabled={!mayPrint} title={mayPrint ? undefined : printHint}>
            <Icon name="printer" />
            พิมพ์ 30
          </button>
        </div>
      </section>

      {store.source === 'mock' && (
        <section role="status" className="syncbar" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <span className="syncbar-text">โหลดเอกสารจริงไม่ได้ ({store.error}) · กำลังแสดงข้อมูลตัวอย่าง</span>
        </section>
      )}

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {DOC_TABS.map((t) => (
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
        </div>

        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาเลขที่ / BR / AP / ล็อต"
              aria-label="ค้นหาเอกสาร"
            />
          </label>
          <select
            className={`sel ${status !== 'all' ? 'sel-on' : ''}`}
            aria-label="สถานะเอกสาร"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            <option value="ISSUED">ออกแล้ว (ISSUED)</option>
            <option value="VOID">ยกเลิก (VOID)</option>
          </select>
          <select className="sel" aria-label="ช่วงเวลา">
            <option>30 วันล่าสุด</option>
            <option>90 วันล่าสุด</option>
            <option>12 เดือน</option>
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: ใหม่สุดก่อน · เก็บถาวร 12 เดือน</span>
        </div>

        <div className="ne-tablewrap">
          <table className="tbl doc-tbl" aria-label="เอกสารทั้งหมด">
            <thead>
              <tr>
                <th style={{ width: 210 }}>เลขที่เอกสาร</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th>รายการ</th>
                <th style={{ width: 130 }}>หมดอายุ</th>
                <th style={{ width: 190 }}>อ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const meta = DOC_TYPE_META[d.type];
                return (
                  <tr key={d.id} className={`${drawerOpen && sel?.id === d.id ? 'r-active' : ''} ${d.status === 'VOID' ? 'doc-r-void' : ''}`}>
                    <td>
                      <button className="rowbtn" onClick={() => open(d.id)} aria-label={`เปิดเอกสาร ${d.id}`}>
                        <span className="code" style={{ fontWeight: 600, color: '#1D4ED8' }}>
                          {d.id}
                        </span>
                        <div className="sub">
                          v{d.version} · {d.at}
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      {d.status === 'VOID' && (
                        <span className="badge t-red" style={{ marginLeft: 4, fontWeight: 700 }}>
                          VOID
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="rowbtn" onClick={() => open(d.id)}>
                        <b style={{ color: '#0F2A5C', fontWeight: 600 }}>{d.drug}</b>
                        <div className="sub">{d.meta}</div>
                      </button>
                    </td>
                    <td className="sub">{d.lines[0].expiry}</td>
                    <td className="sub code">{d.ref}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8' }}>
                    ไม่มีเอกสารในมุมมองนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="tbl-foot">
          <span>
            แสดง {rows.length} ฉบับ · PDF เก็บใน S3 พร้อม SHA-256 · พิมพ์ซ้ำได้เนื้อหาเดิม (FR-XC-006)
          </span>
          <span className="num">อัปเดตล่าสุด 16:45 น.</span>
        </div>
      </section>

      {drawerOpen && sel && (
        <DocumentDrawer
          key={sel.id}
          doc={sel}
          mayPrint={mayPrint}
          onOpenDoc={(id) => setSelId(id)}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
