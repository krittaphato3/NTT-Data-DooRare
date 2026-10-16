import { useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { HOSPITAL_ADMIN_HOME_HREF } from '../../../data/navigation';
import { can } from '../../../lib/rbac';
import { AuditDrawer } from '../components/AuditDrawer';
import { AuditFilterBar, EMPTY_AUDIT_FILTERS } from '../components/AuditFilterBar';
import type { AuditFilters } from '../components/AuditFilterBar';
import { AuditTable, summarizeChange } from '../components/AuditTable';
import { AUDIT_ACTION_META, AUDIT_ENTRIES, verifyAuditChain } from '../data/audit';
import type { ChainVerifyResult } from '../data/audit';
import '../admin.css';

const PAGE_SIZE = 8;

/**
 * Audit log (UI-18). Endpoint it will call when wired: API-AD-003 `GET /api/v1/audit-log`.
 *
 * Access: read-only + export for the hospital's own entries only (spec §5.2 grants HOSPITAL_ADMIN
 * own-hospital audit viewing; SEC-002/003). "ตรวจสอบ hash chain" verifies the tamper-evident chain.
 */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState<ChainVerifyResult | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Permission decision comes from lib/rbac.ts, never from a local role check.
  const mayView = can('HOSPITAL_ADMIN', 'viewAudit');

  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const actor = filters.actor.trim().toLowerCase();
    return AUDIT_ENTRIES.filter((e) => {
      if (filters.role !== 'ALL' && e.role !== filters.role) return false;
      if (filters.action !== 'ALL' && e.action !== filters.action) return false;
      if (filters.entityType !== 'ALL' && e.entityType !== filters.entityType) return false;
      if (actor && !e.actor.toLowerCase().includes(actor)) return false;
      if (filters.from && e.atIso.slice(0, 10) < filters.from) return false;
      if (filters.to && e.atIso.slice(0, 10) > filters.to) return false;
      if (needle && !`${e.id} ${e.entityId} ${e.reason} ${e.ip} ${e.actor}`.toLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => (a.atIso < b.atIso ? 1 : a.atIso > b.atIso ? -1 : 0));
  }, [filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const openEntry = openId ? (AUDIT_ENTRIES.find((e) => e.id === openId) ?? null) : null;

  const changeFilters = (next: AuditFilters) => {
    setFilters(next);
    setPage(1);
    setVerify(null);
  };

  /** Client-side CSV of the currently filtered rows (mock "ส่งออก"). */
  const exportCsv = () => {
    const header = [
      'เวลา', 'ผู้กระทำ', 'บทบาท', 'การกระทำ', 'ประเภทข้อมูล', 'รหัสข้อมูล',
      'การเปลี่ยนแปลง', 'เหตุผล', 'IP', 'Agent run',
    ];
    const lines = filtered.map((e) => [
      e.at, e.actor, e.role, AUDIT_ACTION_META[e.action].labelTh, e.entityType, e.entityId,
      summarizeChange(e.before, e.after), e.reason, e.ip, e.agentRunId ?? '',
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log-hospital-admin.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const verifyChain = () => {
    setLoading(true);
    setVerify(null);
    window.setTimeout(() => {
      // Walks the live chain (oldest → newest), so rows appended by a waive or an escalate-manual
      // are covered too — not a canned "OK" (SEC-003).
      setVerify(verifyAuditChain());
      setLoading(false);
    }, 700);
  };

  return (
    <>
      <section className="pagehead" data-part="page-header">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={HOSPITAL_ADMIN_HOME_HREF} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">บันทึกตรวจสอบ</span>
          </nav>
          <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: '38px', fontWeight: 600, color: '#0F2A5C' }}>
            บันทึกตรวจสอบ <span className="en">Audit log</span>
          </h1>
          <div style={{ fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
            โรงพยาบาลสมุทรปราการ · บันทึกแบบ hash-chain แก้ไขหรือลบไม่ได้ (SEC-003)
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={exportCsv} disabled={!mayView || filtered.length === 0}>
            <Icon name="upload" />
            ส่งออก CSV
          </button>
          <button className="btn btn-p" onClick={verifyChain} disabled={!mayView || loading}>
            <Icon name="shield" />
            {loading ? 'กำลังตรวจสอบ…' : 'ตรวจสอบ hash chain'}
          </button>
        </div>
      </section>

      {verify && (
        <div
          className={`ha-banner ${verify.ok ? 'ha-banner-ok' : 'ha-banner-err'}`}
          role="status"
          data-part="audit-verify"
        >
          <Icon name={verify.ok ? 'checkc' : 'xc'} className="ic14" style={{ marginTop: 2 }} />
          <span>
            {verify.ok
              ? `hash chain ถูกต้องทั้ง ${verify.checked} รายการ · ตรวจสอบเมื่อ ${verify.checkedAt}`
              : `พบความไม่ต่อเนื่องของ hash chain ที่ ${verify.brokenAt ?? '—'}`}
          </span>
        </div>
      )}

      <section className="card" data-part="audit-card" style={{ padding: '16px 20px 8px' }}>
        <AuditFilterBar filters={filters} onChange={changeFilters} resultCount={filtered.length} />

        {loading ? (
          <div aria-busy="true" aria-label="กำลังโหลดบันทึกตรวจสอบ" style={{ padding: '12px 0' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ha-skel-row" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ha-state">
            <Icon name="search" className="ic20" />
            <div className="ha-state-title">ไม่พบบันทึกที่ตรงกับเงื่อนไข</div>
            <div className="ha-state-text">ลองลดช่วงวันที่ หรือล้างตัวกรองเพื่อดูบันทึกทั้งหมดของโรงพยาบาล</div>
            <button className="btn btn-s btn-sm" onClick={() => changeFilters(EMPTY_AUDIT_FILTERS)}>
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <AuditTable
            rows={paged}
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            activeId={openId}
            onPage={setPage}
            onOpen={setOpenId}
          />
        )}
      </section>

      {openEntry && <AuditDrawer entry={openEntry} onClose={() => setOpenId(null)} />}
    </>
  );
}
