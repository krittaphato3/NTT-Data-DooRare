import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { INITIAL_AUDIT_LOGS, type AuditLogRow } from '../data/adminData';

interface AuditLogTabProps {
  externalQuery?: string;
  onShowToast: (msg: string) => void;
}

export function AuditLogTab({ externalQuery = '', onShowToast }: AuditLogTabProps) {
  const [search, setSearch] = useState(externalQuery);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [logs] = useState<AuditLogRow[]>(INITIAL_AUDIT_LOGS);

  const effectiveSearch = (externalQuery || search).toLowerCase();

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      !effectiveSearch ||
      log.actorName.toLowerCase().includes(effectiveSearch) ||
      log.action.toLowerCase().includes(effectiveSearch) ||
      log.hospitalName.toLowerCase().includes(effectiveSearch) ||
      log.entity.toLowerCase().includes(effectiveSearch) ||
      log.details.toLowerCase().includes(effectiveSearch) ||
      log.ip.includes(effectiveSearch);

    const matchAction = actionFilter === 'ALL' || log.actionCode === actionFilter;
    return matchSearch && matchAction;
  });

  const handleExport = () => {
    onShowToast('ส่งออกบันทึกตรวจสอบ (Audit Trail) ในรูปแบบไฟล์ที่มีการเข้ารหัส SHA-256 เรียบร้อยแล้ว');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER / TOOLBAR */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search-input">
            <Icon name="search" style={{ width: 16, height: 16, color: '#94A3B8' }} />
            <input
              type="search"
              placeholder="ค้นหาผู้กระทำ, การกระทำ, IP, รายละเอียด..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="กรองประเภทการกระทำ"
          >
            <option value="ALL">ทุกประเภทการกระทำ (All Actions)</option>
            <option value="LOGIN_SUCCESS">การเข้าสู่ระบบ (LOGIN_SUCCESS)</option>
            <option value="CONFIG_UPDATE">การเปลี่ยนค่าระบบ (CONFIG_UPDATE)</option>
            <option value="SEC_BLOCK">ความปลอดภัยบล็อก (SEC_BLOCK)</option>
            <option value="DISPATCH_FULFILLED">การส่งมอบยา (DISPATCH_FULFILLED)</option>
            <option value="REQUEST_APPROVED">การอนุมัติคำขอ (REQUEST_APPROVED)</option>
            <option value="EMERGENCY_REQUEST">คำขอฉุกเฉิน (EMERGENCY_REQUEST)</option>
            <option value="REQUEST_REJECTED">การปฏิเสธคำขอ (REQUEST_REJECTED)</option>
          </select>

          {(search || actionFilter !== 'ALL') && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ height: 36, padding: '0 10px', fontSize: 12 }}
              onClick={() => {
                setSearch('');
                setActionFilter('ALL');
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        <button type="button" className="admin-btn admin-btn-secondary" onClick={handleExport}>
          <Icon name="download" style={{ width: 16, height: 16 }} />
          ส่งออก Audit Trail (Cryptographic Export)
        </button>
      </div>

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
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                    ไม่พบบันทึกการตรวจสอบตามเงื่อนไขที่กำหนด
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#334155' }}>
                      <div style={{ fontWeight: 600 }}>{log.timestamp}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>
                        ID: {log.id}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`admin-badge ${
                          log.actionTone === 'green'
                            ? 'admin-badge-success'
                            : log.actionTone === 'red'
                            ? 'admin-badge-danger'
                            : log.actionTone === 'amber'
                            ? 'admin-badge-warning'
                            : 'admin-badge-info'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#0F2A5C' }}>{log.actorName}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{log.actorRole}</div>
                    </td>

                    <td>
                      <div style={{ fontSize: 13, color: '#0F2A5C' }}>{log.hospitalName}</div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          background: '#F1F5F9',
                          padding: '2px 6px',
                          borderRadius: 4,
                          color: '#334155',
                        }}
                      >
                        {log.entity}
                      </span>
                    </td>

                    <td style={{ maxWidth: 320, fontSize: 12, color: '#1E293B' }}>
                      {log.details}
                    </td>

                    <td>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>
                        IP: {log.ip}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: '#15803D',
                          marginTop: 2,
                        }}
                        title={`SHA-256 Hash Chain: ${log.sha256Hash}`}
                      >
                        🔒 {log.sha256Hash.slice(0, 14)}…
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
