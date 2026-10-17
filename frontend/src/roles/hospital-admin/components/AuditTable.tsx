import { Icon } from '../../../components/common/icons';
import { AUDIT_ACTION_META } from '../data/audit';
import type { AuditEntry, AuditValue } from '../data/audit';

/** Compact `field: before → after` summary for the table cell (full detail lives in the drawer). */
export function summarizeChange(before: Record<string, AuditValue>, after: Record<string, AuditValue>): string {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const parts: string[] = [];
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (String(b ?? '') === String(a ?? '')) continue;
    parts.push(`${k}: ${b ?? '—'} → ${a ?? '—'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

interface AuditTableProps {
  rows: AuditEntry[];
  page: number;
  pageCount: number;
  total: number;
  activeId: string | null;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}

/** Result table for UI-18. Own-hospital entries only; read-only. */
export function AuditTable({ rows, page, pageCount, total, activeId, onPage, onOpen }: AuditTableProps) {
  return (
    <>
      <div className="scroll-x">
        <table className="tbl" aria-label="บันทึกตรวจสอบ">
          <thead>
            <tr>
              <th style={{ width: 150 }}>เวลา</th>
              <th style={{ width: 190 }}>ผู้กระทำ</th>
              <th style={{ width: 150 }}>การกระทำ</th>
              <th style={{ width: 160 }}>ประเภทข้อมูล</th>
              <th style={{ width: 150 }}>รหัสข้อมูล</th>
              <th style={{ width: 260 }}>การเปลี่ยนแปลง</th>
              <th style={{ width: 220 }}>เหตุผล</th>
              <th style={{ width: 120 }}>IP</th>
              <th style={{ width: 96 }}>
                <span className="srt">รายละเอียด</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const meta = AUDIT_ACTION_META[e.action];
              return (
                <tr key={e.id} className={activeId === e.id ? 'r-active' : ''}>
                  <td>
                    <button
                      className="rowbtn code"
                      style={{ fontSize: 11.5, color: '#1D4ED8', fontWeight: 600 }}
                      onClick={() => onOpen(e.id)}
                    >
                      {e.at}
                    </button>
                    <span className="code" style={{ display: 'block', fontSize: 10.5 }}>
                      {e.id}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'block', fontWeight: 600, color: '#0F2A5C' }}>{e.actor}</span>
                    <span className="badge t-grey ha-badge" style={{ marginTop: 4 }}>
                      {e.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${meta.tone}`}>{meta.labelTh}</span>
                  </td>
                  <td className="code" style={{ fontSize: 11.5 }}>
                    {e.entityType}
                  </td>
                  <td className="code" style={{ fontSize: 11.5 }}>
                    {e.entityId}
                  </td>
                  <td style={{ fontSize: 12, lineHeight: '17px' }}>
                    {summarizeChange(e.before, e.after)}
                    {e.agentRunId && (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        <span className="badge t-teal ha-badge">
                          <Icon name="spark" className="ic14" /> {e.agentRunId}
                        </span>
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, lineHeight: '18px' }}>{e.reason || '—'}</td>
                  <td className="code" style={{ fontSize: 11 }}>
                    {e.ip}
                  </td>
                  <td className="r">
                    <button className="btn btn-s btn-sm" onClick={() => onOpen(e.id)}>
                      ดู
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>
          แสดง <span className="num">{rows.length}</span> จาก <span className="num">{total}</span> รายการ · เฉพาะโรงพยาบาลสมุทรปราการ
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-s btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ก่อนหน้า
          </button>
          <span className="num">
            {page} / {pageCount}
          </span>
          <button className="btn btn-s btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            ถัดไป
          </button>
        </span>
      </div>
    </>
  );
}
