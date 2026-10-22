import { useEffect, useState, useCallback, useRef } from 'react';
import { Icon } from '../../../components/common/icons';
import { auditActionMeta, API_ACTION_OPTIONS, formatThaiDateTime, mapApiToAuditEntry } from '../../hospital-admin/data/audit';
import type { AuditEntry } from '../../hospital-admin/data/audit';
import { listAudit, verifyAudit } from '../../../services/adminApi';
import { getHospitals } from '../../../services/catalogApi';

const API_LIMIT = 50;

interface AuditLogTabProps {
  externalQuery?: string;
  onShowToast: (msg: string) => void;
}

type Tone = 'green' | 'red' | 'blue' | 'amber' | 'purple';
function toneFor(tone: string): Tone {
  if (tone === 't-green') return 'green';
  if (tone === 't-red') return 'red';
  if (tone === 't-amber') return 'amber';
  if (tone === 't-orange') return 'purple';
  return 'blue';
}

function summarizeChange(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const parts: string[] = [];
  for (const k of keys) {
    const b = (before ?? {})[k];
    const a = (after ?? {})[k];
    if (String(b ?? '') === String(a ?? '')) continue;
    parts.push(`${k}: ${b ?? '—'} → ${a ?? '—'}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

export function AuditLogTab({ externalQuery = '', onShowToast }: AuditLogTabProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(externalQuery);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [hospitals, setHospitals] = useState<{ id: string; name: string }[]>([]);
  const [verify, setVerify] = useState<{ intact: boolean; problems: number; checkedAt: string } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const buildParams = useCallback(
    () => {
      const p: Record<string, string> = { limit: String(API_LIMIT) };
      const q = (externalQuery || search).trim();
      if (q) p.q = q;
      if (actionFilter !== 'ALL') p.action = actionFilter;
      if (hospitalFilter !== 'ALL') p.hospitalId = hospitalFilter;
      return p;
    },
    [externalQuery, search, actionFilter, hospitalFilter],
  );

  const loadFirst = useCallback(
    async (params: Record<string, string>) => {
      setLoading(true);
      setError('');
      try {
        const res = await listAudit(params);
        setEntries(res.items.map(mapApiToAuditEntry));
        setCursor(res.nextCursor);
      } catch (e: any) {
        setEntries([]);
        setCursor(null);
        setError(e?.message || 'ไม่สามารถโหลดบันทึกตรวจสอบได้');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Hospital list for the SA-only hospitalId filter.
  useEffect(() => {
    getHospitals({ limit: 200 })
      .then((res) => setHospitals((res.items || []).map((h) => ({ id: h.id, name: h.nameTh || h.code || h.id }))))
      .catch(() => setHospitals([]));
  }, []);

  // Initial load + reload on filter change (debounced for search).
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      loadFirst(buildParams());
    }, search ? 300 : 0);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, hospitalFilter, externalQuery]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listAudit(buildParams(), cursor);
      setEntries((prev) => [...prev, ...res.items.map(mapApiToAuditEntry)]);
      setCursor(res.nextCursor);
    } catch (e: any) {
      onShowToast(e?.message || 'โหลดเพิ่มไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  };

  const runVerify = async () => {
    setVerifyLoading(true);
    setVerify(null);
    try {
      const res = await verifyAudit();
      setVerify(res.data);
      onShowToast(res.data.intact ? 'hash chain ถูกต้องทั้งหมด' : `พบปัญหา ${res.data.problems} จุด`);
    } catch (e: any) {
      onShowToast(e?.message || 'ตรวจสอบ hash chain ไม่สำเร็จ');
    } finally {
      setVerifyLoading(false);
    }
  };

  const hasFilter = search || actionFilter !== 'ALL' || hospitalFilter !== 'ALL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER / TOOLBAR */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search-input">
            <Icon name="search" style={{ width: 16, height: 16, color: '#94A3B8' }} />
            <input
              type="search"
              placeholder="ค้นหา action / entity / เหตุผล..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="ค้นหาบันทึกตรวจสอบ"
            />
          </div>

          <select
            className="admin-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="กรองประเภทการกระทำ"
          >
            {API_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={hospitalFilter}
            onChange={(e) => setHospitalFilter(e.target.value)}
            aria-label="กรองตามโรงพยาบาล"
          >
            <option value="ALL">ทุกโรงพยาบาล</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          {hasFilter && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ height: 36, padding: '0 10px', fontSize: 12 }}
              onClick={() => {
                setSearch('');
                setActionFilter('ALL');
                setHospitalFilter('ALL');
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        <button type="button" className="admin-btn admin-btn-primary" disabled={verifyLoading} onClick={runVerify}>
          <Icon name="shield" style={{ width: 16, height: 16 }} />
          {verifyLoading ? 'กำลังตรวจสอบ…' : 'ตรวจสอบ hash chain'}
        </button>
      </div>

      {verify && (
        <div
          style={{
            background: verify.intact ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${verify.intact ? '#BBF7D0' : '#FECACA'}`,
            color: verify.intact ? '#166534' : '#991B1B',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
          }}
          role="status"
        >
          {verify.intact
            ? `hash chain ถูกต้องทั้งหมด · ปัญหา 0 · ตรวจสอบเมื่อ ${formatThaiDateTime(verify.checkedAt)}`
            : `พบความไม่ต่อเนื่องของ hash chain ${verify.problems} จุด · ตรวจสอบเมื่อ ${formatThaiDateTime(verify.checkedAt)}`}
        </div>
      )}

      {error && (
        <div
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* AUDIT LOG TABLE */}
      <div className="admin-table-container">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>เวลา (Timestamp)</th>
                <th>การกระทำ (Action)</th>
                <th>ผู้กระทำ / บทบาท</th>
                <th>โรงพยาบาล</th>
                <th>เป้าหมาย (Entity)</th>
                <th>รายละเอียด (Details)</th>
                <th>IP / Integrity Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                    กำลังโหลดบันทึกตรวจสอบ…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                    ไม่พบบันทึกการตรวจสอบตามเงื่อนไขที่กำหนด
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const meta = auditActionMeta(e.action);
                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#334155' }}>
                        <div style={{ fontWeight: 600 }}>{e.at}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>ID: {e.id}</div>
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge-${toneFor(meta.tone)}`}>{meta.labelTh}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F2A5C' }}>{e.actor}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{e.role}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, color: '#0F2A5C' }}>{e.hospitalName ?? '—'}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>
                          {e.entityType}
                          {e.entityId && e.entityId !== '—' ? ` · ${e.entityId}` : ''}
                        </span>
                      </td>
                      <td style={{ maxWidth: 320, fontSize: 12, color: '#1E293B' }}>
                        {e.reason || summarizeChange(e.before, e.after)}
                      </td>
                      <td>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>IP: {e.ip}</div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#15803D', marginTop: 2 }} title={`SHA-256: ${e.hash}`}>
                          🔒 {e.hash.slice(0, 14)}…
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOAD MORE */}
      {!loading && entries.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={!cursor || loadingMore} onClick={loadMore}>
            {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
          </button>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            แสดง {entries.length} รายการ{cursor ? ' · ยังมีรายการเพิ่มเติม' : ' · โหลดครบแล้ว'}
          </span>
        </div>
      )}
    </div>
  );
}
