import { useMemo, useState, useEffect, useCallback } from 'react';
import { Icon } from '../../../components/common/icons';
import { HOSPITAL_ADMIN_HOME_HREF } from '../../../data/navigation';
import { can } from '../../../lib/rbac';
import { AuditDrawer } from '../components/AuditDrawer';
import { AuditFilterBar, EMPTY_AUDIT_FILTERS } from '../components/AuditFilterBar';
import type { AuditFilters } from '../components/AuditFilterBar';
import { AuditTable, summarizeChange } from '../components/AuditTable';
import {
  AUDIT_ENTRIES,
  API_ACTION_OPTIONS,
  auditActionMeta,
  mapApiToAuditEntry,
} from '../data/audit';
import type { AuditEntry } from '../data/audit';
import { listAudit } from '../../../services/adminApi';
import * as authApi from '../../../services/authApi';
import '../admin.css';

const PAGE_SIZE = 8;
const API_LIMIT = 50;

function isMockMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mock') === '1';
}

/** Maps the UI filter state to API-AD-003 query params (limit 50 for cursor paging). */
function toApiParams(f: AuditFilters): Record<string, string> {
  const p: Record<string, string> = { limit: String(API_LIMIT) };
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.action && f.action !== 'ALL') p.action = f.action;
  if (f.entityType && f.entityType !== 'ALL') p.entityType = f.entityType;
  if (f.role && f.role !== 'ALL') p.role = f.role;
  if (f.q.trim()) p.q = f.q.trim();
  return p;
}

/**
 * Audit log (UI-18) — API-AD-003 `GET /api/v1/audit-log`.
 *
 * HA sees only its own hospital's rows (+ hospital-entity rows for it) via the server scope
 * (SEC-002). Large logs use cursor "load more" (limit 50). The "verify chain" button is
 * SYSTEM_ADMIN-only and therefore never rendered on this HA screen.
 */
export function AuditLogPage() {
  const [mock] = useState(isMockMode());
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!isMockMode());
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Mock path: fixed fixtures + optional recent-login merge.
  const [allEntries, setAllEntries] = useState<AuditEntry[]>(AUDIT_ENTRIES);

  // API path: accumulated rows + cursor.
  const [apiEntries, setApiEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  // Permission decision comes from lib/rbac.ts, never from a local role check.
  const mayView = can('HOSPITAL_ADMIN', 'viewAudit');

  const loadFirst = useCallback(
    async (f: AuditFilters) => {
      setLoading(true);
      setError('');
      try {
        const res = await listAudit(toApiParams(f));
        setApiEntries(res.items.map(mapApiToAuditEntry));
        setCursor(res.nextCursor);
      } catch (e: any) {
        setApiEntries([]);
        setCursor(null);
        setError(e?.message || 'ไม่สามารถโหลดบันทึกตรวจสอบได้');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (mock) return;
    loadFirst(EMPTY_AUDIT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mock only: merge recent login events into the fixture list.
  useEffect(() => {
    if (!mock) return;
    let mounted = true;
    authApi.getRecentLogins(15).then(({ events }) => {
      if (!mounted || !events || events.length === 0) return;
      const loginAuditRows: AuditEntry[] = events.map((e) => {
        const d = new Date(e.occurred_at);
        const p = (n: number) => String(n).padStart(2, '0');
        const atStr = `${d.getDate()} ต.ค. 69 ${p(d.getHours())}:${p(d.getMinutes())}`;
        const afterMap: Record<string, string | null> = e.success
          ? { result: 'SUCCESS', device: e.device ?? null, browser: e.browser ?? null }
          : { result: 'FAILED', note: e.failure_reason || 'รหัสผ่านไม่ถูกต้อง' };
        return {
          id: `AUD-LGN-${e.id}`,
          at: atStr,
          atIso: e.occurred_at,
          actor: e.display_name || e.email,
          role: (e.role as any) || 'PHARMACIST',
          action: e.success ? 'LOGIN' : 'LOGIN_FAILED',
          entityType: 'session',
          entityId: `SES-${e.id}`,
          before: {},
          after: afterMap,
          reason: e.success ? 'เข้าสู่ระบบสำเร็จ' : e.failure_reason || 'เข้าสู่ระบบไม่สำเร็จ',
          ip: e.ip || '127.0.0.1',
          hash: `e${e.id}b…${String(e.id).padStart(4, '0')}`,
          prevHash: `c510…${String(e.id).padStart(4, '0')}`,
        };
      });
      setAllEntries((prev) => {
        const existing = new Set(prev.map((x) => x.id));
        return [...loginAuditRows.filter((x) => !existing.has(x.id)), ...prev];
      });
    });
    return () => {
      mounted = false;
    };
  }, [mock]);

  // Mock path: client-side filter.
  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const actor = filters.actor.trim().toLowerCase();
    return allEntries
      .filter((e) => {
        if (filters.role !== 'ALL' && e.role !== filters.role) return false;
        if (filters.action !== 'ALL' && e.action !== filters.action) return false;
        if (filters.entityType !== 'ALL' && e.entityType !== filters.entityType) return false;
        if (actor && !e.actor.toLowerCase().includes(actor)) return false;
        if (filters.from && e.atIso.slice(0, 10) < filters.from) return false;
        if (filters.to && e.atIso.slice(0, 10) > filters.to) return false;
        if (needle && !`${e.id} ${e.entityId} ${e.reason} ${e.ip} ${e.actor}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => (a.atIso < b.atIso ? 1 : a.atIso > b.atIso ? -1 : 0));
  }, [allEntries, filters]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listAudit(toApiParams(filters), cursor);
      setApiEntries((prev) => [...prev, ...res.items.map(mapApiToAuditEntry)]);
      setCursor(res.nextCursor);
    } catch (e: any) {
      setError(e?.message || 'โหลดเพิ่มไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  };

  const changeFilters = (next: AuditFilters) => {
    setFilters(next);
    setPage(1);
    if (!mock) loadFirst(next);
  };

  // Rows + pagination mode.
  const rows: AuditEntry[] = mock ? filtered : apiEntries;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = mock ? filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) : apiEntries;
  const openEntry = openId ? (rows.find((e) => e.id === openId) ?? null) : null;

  const exportCsv = () => {
    const header = ['เวลา', 'ผู้กระทำ', 'บทบาท', 'การกระทำ', 'ประเภทข้อมูล', 'รหัสข้อมูล', 'การเปลี่ยนแปลง', 'เหตุผล', 'IP', 'Agent run'];
    const lines = rows.map((e) => [
      e.at, e.actor, e.role, auditActionMeta(e.action).labelTh, e.entityType, e.entityId,
      summarizeChange(e.before, e.after), e.reason, e.ip, e.agentRunId ?? '',
    ]);
    const csv = [header, ...lines].map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log-hospital-admin.csv';
    a.click();
    URL.revokeObjectURL(url);
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
            เห็นเฉพาะบันทึกของโรงพยาบาลตนเอง · บันทึกแบบ hash-chain แก้ไขหรือลบไม่ได้ (SEC-003)
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={exportCsv} disabled={!mayView || rows.length === 0}>
            <Icon name="upload" />
            ส่งออก CSV
          </button>
        </div>
      </section>

      {error && (
        <div className="ha-banner ha-banner-err" role="alert" data-part="audit-error">
          <Icon name="alertc" className="ic14" style={{ marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      <section className="card" data-part="audit-card" style={{ padding: '16px 20px 8px' }}>
        <AuditFilterBar
          filters={filters}
          onChange={changeFilters}
          resultCount={rows.length}
          actionOptions={mock ? undefined : API_ACTION_OPTIONS}
          hideActor={!mock}
        />

        {loading ? (
          <div aria-busy="true" aria-label="กำลังโหลดบันทึกตรวจสอบ" style={{ padding: '12px 0' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ha-skel-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
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
            total={rows.length}
            activeId={openId}
            onPage={setPage}
            onOpen={setOpenId}
            hasMore={Boolean(cursor)}
            loadingMore={loadingMore}
            onLoadMore={mock ? undefined : loadMore}
          />
        )}
      </section>

      {openEntry && <AuditDrawer entry={openEntry} onClose={() => setOpenId(null)} />}
    </>
  );
}
