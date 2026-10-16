import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { HospitalSummary, UserAccount } from '../data/adminData';

interface HospitalDetailViewProps {
  hospital: HospitalSummary;
  allUsers: UserAccount[];
  onBack: () => void;
  onUpdateHospital?: (id: string, updates: Partial<HospitalSummary>) => void;
  onShowToast?: (msg: string) => void;
}

export function HospitalDetailView({
  hospital,
  allUsers,
  onBack,
  onUpdateHospital,
  onShowToast,
}: HospitalDetailViewProps) {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDirection, setFilterDirection] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'staff'>('requests');

  // Hospital Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [nameVal, setNameVal] = useState(hospital.name);
  const [shortNameVal, setShortNameVal] = useState(hospital.shortName);
  const [codeVal, setCodeVal] = useState(hospital.code);
  const [provinceVal, setProvinceVal] = useState(hospital.province);
  const [typeVal, setTypeVal] = useState<'รพศ.' | 'รพท.' | 'รพช.'>(hospital.type);
  const [bedVal, setBedVal] = useState(hospital.bedCount);
  const [coldChainVal, setColdChainVal] = useState(hospital.hasColdChain);
  const [bloodBankVal, setBloodBankVal] = useState(hospital.hasBloodBank);
  const [agentVal, setAgentVal] = useState(hospital.agentParticipation);

  // Export report modal state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [exportReportType, setExportReportType] = useState('all_transactions');
  const [isExporting, setIsExporting] = useState(false);

  const openEditModal = () => {
    setNameVal(hospital.name);
    setShortNameVal(hospital.shortName);
    setCodeVal(hospital.code);
    setProvinceVal(hospital.province);
    setTypeVal(hospital.type);
    setBedVal(hospital.bedCount);
    setColdChainVal(hospital.hasColdChain);
    setBloodBankVal(hospital.hasBloodBank);
    setAgentVal(hospital.agentParticipation);
    setIsEditOpen(true);
  };

  const handleSaveHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateHospital) {
      onUpdateHospital(hospital.id, {
        name: nameVal.trim() || hospital.name,
        shortName: shortNameVal.trim() || hospital.shortName,
        code: codeVal.trim() || hospital.code,
        province: provinceVal,
        type: typeVal,
        bedCount: Number(bedVal) || hospital.bedCount,
        hasColdChain: coldChainVal,
        hasBloodBank: bloodBankVal,
        agentParticipation: agentVal,
      });
      if (onShowToast) {
        onShowToast(`อัปเดตข้อมูลและขีดความสามารถของ "${nameVal.trim() || hospital.name}" สำเร็จ`);
      }
    }
    setIsEditOpen(false);
  };

  const handleDownloadHospitalReport = () => {
    setIsExporting(true);
    setTimeout(() => {
      try {
        const ext = exportFormat === 'excel' ? 'csv' : exportFormat;
        const filename = `Report_${hospital.code}_${exportReportType}_${new Date().toISOString().slice(0, 10)}.${ext}`;
        let content = '';
        if (exportFormat === 'csv' || exportFormat === 'excel') {
          content = `รหัสคำขอ,วันที่,ทิศทาง,โรงพยาบาลคู่กรณี,รายการยา,จำนวนขอ,จำนวนอนุมัติ,หน่วย,สถานะ,ผู้ขับ,อุณหภูมิ\n`;
          hospital.detailedLogs.forEach((l) => {
            content += `${l.requestNo},"${l.createdAt}",${l.direction},"${l.counterpartyHospital}","${l.drugName}",${l.qtyRequested},${l.qtyApproved},"${l.unit}",${l.status},"${l.driverName || '-'}","${l.temperature || '-'}"\n`;
          });
        } else {
          content = `%PDF-1.4\n1 0 obj\n<< /Title (Hospital Report ${hospital.name}) >>\nendobj\nรายงานประวัติการส่งยา: ${hospital.name} (รหัส ${hospital.code})\nยอดส่งออก: ${hospital.requestCount} รอบ | ยอดอนุมัติ: ${hospital.approvedCount} รอบ\n`;
        }

        const blob = new Blob([content], {
          type: exportFormat === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Download error:', err);
      }

      setIsExporting(false);
      setIsExportOpen(false);
      if (onShowToast) {
        onShowToast(`ส่งออกรายงานของ "${hospital.name}" (${exportFormat.toUpperCase()}) สำเร็จแล้ว`);
      }
    }, 800);
  };

  const hospitalStaff = allUsers.filter((u) => u.hospitalId === hospital.id);

  const logs = hospital.detailedLogs;

  const filteredLogs = logs.filter((log) => {
    const matchStatus = filterStatus === 'ALL' || log.status === filterStatus;
    const matchDir = filterDirection === 'ALL' || log.direction === filterDirection;
    return matchStatus && matchDir;
  });

  const successRate =
    hospital.requestCount > 0
      ? ((hospital.approvedCount / hospital.requestCount) * 100).toFixed(1)
      : '100.0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER CARD */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(15, 42, 92, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={onBack}
              style={{ height: 36, padding: '0 12px' }}
            >
              <Icon name="arrow" style={{ width: 16, height: 16, transform: 'rotate(180deg)' }} />
              ย้อนกลับ
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F2A5C', margin: 0 }}>
                  {hospital.name}
                </h2>
                <span className="admin-badge admin-badge-info">{hospital.type}</span>
                <span className="admin-badge admin-badge-neutral">
                  รหัสสถานพยาบาล: {hospital.code}
                </span>
                <span className="admin-badge admin-badge-success">
                  {hospital.hasColdChain ? 'Cold Chain พร้อม' : 'ไม่มี Cold Chain'}
                </span>
                {hospital.hasBloodBank && (
                  <span className="admin-badge admin-badge-danger">มีธนาคารเลือด</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                จังหวัด{hospital.province} · ขนาด {hospital.bedCount} เตียง · มีเจ้าหน้าที่ในระบบ {hospitalStaff.length} คน
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={openEditModal}
              style={{ height: 36, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="gear" style={{ width: 16, height: 16 }} />
              แก้ไขข้อมูลและตั้งค่าโรงพยาบาล
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={() => setIsExportOpen(true)}
              style={{ height: 36, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="download" style={{ width: 16, height: 16 }} />
              ส่งออกรายงาน (Export)
            </button>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <section className="admin-kpi-grid">
        <div className="admin-kpi-card kpi-blue">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">คำขอส่งยาทั้งหมด (Requests)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="truck" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className="admin-kpi-value">{hospital.requestCount} รอบ</div>
          <div className="admin-kpi-subtext">
            <span>ส่งออก {hospital.requestCount} · ได้รับเข้า {hospital.incomingCount} รอบ</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-green">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">อนุมัติแล้ว (Approved)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="check" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className="admin-kpi-value" style={{ color: '#15803D' }}>
            {hospital.approvedCount} รอบ
          </div>
          <div className="admin-kpi-subtext">
            <span className="admin-kpi-trend-good">อัตราความสำเร็จ {successRate}%</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-purple">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">ปฏิเสธ / หมดเวลา (Reject / Timeout)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="x" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className="admin-kpi-value" style={{ color: '#DC2626' }}>
            {hospital.rejectedCount + hospital.timeoutCount} รอบ
          </div>
          <div className="admin-kpi-subtext">
            <span>ปฏิเสธ: {hospital.rejectedCount} · หมดเวลา: {hospital.timeoutCount} รอบ</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-amber">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">นำส่งสำเร็จแล้ว (Dispatched)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="box" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className="admin-kpi-value">{hospital.dispatchedCount} รอบ</div>
          <div className="admin-kpi-subtext">
            <span>อยู่ระหว่างทาง: {hospital.inTransitCount} รอบ</span>
          </div>
        </div>
      </section>

      {/* SUB TABS NAVIGATION */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E2E8F0', paddingBottom: 4 }}>
        <button
          type="button"
          className={`admin-tab-btn ${activeSubTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('requests')}
        >
          <Icon name="fileText" style={{ width: 16, height: 16 }} />
          ประวัติคำขอและการส่งยาอย่างละเอียด ({logs.length} รายการ)
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeSubTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('staff')}
        >
          <Icon name="users" style={{ width: 16, height: 16 }} />
          เจ้าหน้าที่ประจำโรงพยาบาล ({hospitalStaff.length} คน)
        </button>
      </div>

      {activeSubTab === 'requests' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* FILTER CONTROLS */}
          <div className="admin-toolbar">
            <div className="admin-toolbar-left">
              <select
                className="admin-select"
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value)}
                aria-label="กรองทิศทางคำขอ"
              >
                <option value="ALL">ทิศทางทั้งหมด (ส่งออก / รับเข้า)</option>
                <option value="OUTGOING">ส่งออกไปยังโรงพยาบาลอื่น (Outgoing)</option>
                <option value="INCOMING">รับเข้าจากโรงพยาบาลอื่น (Incoming)</option>
              </select>

              <select
                className="admin-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="กรองสถานะคำขอ"
              >
                <option value="ALL">ทุกสถานะ (Approved, Rejected, Timed out, etc.)</option>
                <option value="COMPLETED">นำส่งสำเร็จ (Completed)</option>
                <option value="IN_TRANSIT">อยู่ระหว่างนำส่ง (In Transit)</option>
                <option value="APPROVED">อนุมัติแล้ว (Approved)</option>
                <option value="REJECTED">ปฏิเสธ (Rejected)</option>
                <option value="TIMED_OUT">หมดเวลา (Timed Out)</option>
              </select>

              {(filterDirection !== 'ALL' || filterStatus !== 'ALL') && (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ height: 36, padding: '0 10px', fontSize: 12 }}
                  onClick={() => {
                    setFilterDirection('ALL');
                    setFilterStatus('ALL');
                  }}
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            <div style={{ fontSize: 12, color: '#64748B' }}>
              แสดง <strong>{filteredLogs.length}</strong> จาก <strong>{logs.length}</strong> ธุรกรรม
            </div>
          </div>

          {/* DETAILED REQUESTS TABLE */}
          <div className="admin-table-container">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>เลขคำขอ / วันที่</th>
                    <th>ทิศทาง</th>
                    <th>โรงพยาบาลคู่กรณี</th>
                    <th>รายการยาและรูปแบบ</th>
                    <th style={{ textAlign: 'center' }}>จำนวนที่ขอ / อนุมัติ</th>
                    <th style={{ textAlign: 'center' }}>สถานะ</th>
                    <th>รายละเอียดการนำส่ง / เหตุผล</th>
                    <th>ใบสำคัญเอกสาร</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
                        ไม่มีรายการคำขอตามตัวกรองที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0F2A5C', fontFamily: 'monospace' }}>
                            {item.requestNo}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{item.createdAt}</div>
                        </td>

                        <td>
                          {item.direction === 'OUTGOING' ? (
                            <span className="admin-badge admin-badge-info" style={{ gap: 4 }}>
                              <Icon name="outArrow" style={{ width: 12, height: 12 }} /> ส่งออก
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge-warning" style={{ gap: 4 }}>
                              <Icon name="inArrow" style={{ width: 12, height: 12 }} /> รับเข้า
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#0F2A5C' }}>
                            {item.counterpartyHospital}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>
                            {item.context === 'EMERGENCY'
                              ? '🚨 เหตุฉุกเฉิน (EMERGENCY)'
                              : item.context === 'STOCK_ALERT'
                              ? '⚠️ แจ้งเตือนสต็อกต่ำ (STOCK_ALERT)'
                              : '📝 คำขอทั่วไป (MANUAL)'}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#0F2A5C' }}>{item.drugName}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{item.drugForm}</div>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: '#0F2A5C' }}>
                            {item.qtyApproved} / {item.qtyRequested}
                          </span>{' '}
                          <span style={{ fontSize: 11, color: '#64748B' }}>{item.unit}</span>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {item.status === 'COMPLETED' && (
                            <span className="admin-badge admin-badge-success">ส่งมอบสำเร็จ</span>
                          )}
                          {item.status === 'IN_TRANSIT' && (
                            <span className="admin-badge admin-badge-info">
                              <span className="admin-live-pulse" /> อยู่ระหว่างขนส่ง
                            </span>
                          )}
                          {item.status === 'APPROVED' && (
                            <span className="admin-badge admin-badge-success">อนุมัติแล้ว</span>
                          )}
                          {item.status === 'REJECTED' && (
                            <span className="admin-badge admin-badge-danger">ปฏิเสธ</span>
                          )}
                          {item.status === 'TIMED_OUT' && (
                            <span className="admin-badge admin-badge-warning">หมดเวลา</span>
                          )}
                        </td>

                        <td>
                          {item.status === 'REJECTED' && (
                            <div style={{ fontSize: 12, color: '#DC2626' }}>
                              <strong>เหตุผล:</strong> {item.rejectReason}
                            </div>
                          )}
                          {item.status === 'TIMED_OUT' && (
                            <div style={{ fontSize: 12, color: '#D97706' }}>
                              <strong>เหตุผล:</strong> {item.rejectReason}
                            </div>
                          )}
                          {(item.status === 'COMPLETED' || item.status === 'IN_TRANSIT') && (
                            <div style={{ fontSize: 12 }}>
                              <div>
                                <strong>ผู้ขับ:</strong> {item.driverName} ({item.vehiclePlate})
                              </div>
                              <div style={{ color: '#0D9488' }}>
                                <strong>อุณหภูมิ:</strong> {item.temperature}
                              </div>
                              <div style={{ color: '#475569' }}>
                                <strong>เวลา:</strong> {item.etaOrDelivered}
                              </div>
                            </div>
                          )}
                        </td>

                        <td>
                          {item.docNo && item.docNo !== '-' ? (
                            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1E40AF' }}>
                              <Icon name="printer" style={{ width: 12, height: 12, marginRight: 4 }} />
                              {item.docNo}
                            </div>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* STAFF LIST SUB-TAB */
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ชื่อ-นามสกุล</th>
                <th>อีเมล</th>
                <th>เบอร์โทรศัพท์</th>
                <th>บทบาท (Role)</th>
                <th>สถานะออนไลน์</th>
                <th>เข้าสู่ระบบล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {hospitalStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: '#64748B' }}>
                    ไม่พบบัญชีผู้ใช้ที่สังกัดโรงพยาบาลนี้
                  </td>
                </tr>
              ) : (
                hospitalStaff.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 600, color: '#0F2A5C' }}>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.phone}</td>
                    <td>
                      <span className="admin-badge admin-badge-info">{user.role}</span>
                    </td>
                    <td>
                      {user.isOnline ? (
                        <span className="admin-badge admin-badge-success">
                          <span className="admin-live-pulse" /> ออนไลน์
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-neutral">ออฟไลน์</span>
                      )}
                    </td>
                    <td>{user.lastLogin}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* HOSPITAL COMPLETE EDIT & SETTINGS MODAL */}
      {isEditOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsEditOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">แก้ไขข้อมูลและตั้งค่า: {hospital.name}</h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  รหัสสถานพยาบาล: {hospital.code} · จังหวัด{hospital.province}
                </div>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setIsEditOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveHospital}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">ชื่อโรงพยาบาลเต็ม *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    required
                  />
                </div>

                <div className="admin-grid-2col" style={{ gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">ชื่อย่อ (Short Name)</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      value={shortNameVal}
                      onChange={(e) => setShortNameVal(e.target.value)}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">รหัสสถานพยาบาล (5 หลัก) *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      value={codeVal}
                      onChange={(e) => setCodeVal(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="admin-grid-2col" style={{ gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">จังหวัด (ในเขต 6) *</label>
                    <select
                      className="admin-form-select"
                      value={provinceVal}
                      onChange={(e) => setProvinceVal(e.target.value)}
                    >
                      <option value="สมุทรปราการ">สมุทรปราการ</option>
                      <option value="ชลบุรี">ชลบุรี</option>
                      <option value="ระยอง">ระยอง</option>
                      <option value="จันทบุรี">จันทบุรี</option>
                      <option value="ตราด">ตราด</option>
                      <option value="ฉะเชิงเทรา">ฉะเชิงเทรา</option>
                      <option value="ปราจีนบุรี">ปราจีนบุรี</option>
                      <option value="นครนายก">นครนายก</option>
                      <option value="สระแก้ว">สระแก้ว</option>
                    </select>
                  </div>

                  <div className="admin-grid-2col" style={{ gap: 10 }}>
                    <div className="admin-form-group">
                      <label className="admin-form-label">ระดับบริการ *</label>
                      <select
                        className="admin-form-select"
                        value={typeVal}
                        onChange={(e) => setTypeVal(e.target.value as 'รพศ.' | 'รพท.' | 'รพช.')}
                      >
                        <option value="รพศ.">รพศ. (ศูนย์)</option>
                        <option value="รพท.">รพท. (ทั่วไป)</option>
                        <option value="รพช.">รพช. (ชุมชน)</option>
                      </select>
                    </div>

                    <div className="admin-form-group">
                      <label className="admin-form-label">จำนวนเตียง</label>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={bedVal}
                        onChange={(e) => setBedVal(Number(e.target.value) || 0)}
                        min={10}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2A5C' }}>
                    การเปิดใช้งานขีดความสามารถเฉพาะทาง:
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={coldChainVal}
                      onChange={(e) => setColdChainVal(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>ระบบลูกโซ่ความเย็น (Cold Chain 2-8°C):</strong> มีความพร้อมรองรับเวชภัณฑ์ควบคุมอุณหภูมิ
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={bloodBankVal}
                      onChange={(e) => setBloodBankVal(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>ธนาคารเลือด (Blood Bank):</strong> มีคลังโลหิตรองรับคำขอยืมโลหิตฉุกเฉิน
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={agentVal}
                      onChange={(e) => setAgentVal(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>เข้าร่วมระบบ AI Agent Auto-Matching:</strong> ยินยอมให้อัลกอริทึมจัดสรรคำขอส่งยาอัตโนมัติ
                    </span>
                  </label>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsEditOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  บันทึกการแก้ไขโรงพยาบาล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HOSPITAL REPORT EXPORT MODAL */}
      {isExportOpen && (
        <div className="admin-modal-overlay" onClick={() => !isExporting && setIsExportOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">ส่งออกรายงานประวัติ: {hospital.name}</h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  รหัสสถานพยาบาล: {hospital.code} · เขตสุขภาพที่ 6
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => !isExporting && setIsExportOpen(false)}
                disabled={isExporting}
              >
                ×
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label className="admin-form-label">ประเภทรายงาน *</label>
                <select
                  className="admin-form-select"
                  value={exportReportType}
                  onChange={(e) => setExportReportType(e.target.value)}
                  disabled={isExporting}
                >
                  <option value="all_transactions">
                    ประวัติคำขอและธุรกรรมการส่งยาทั้งหมด ({logs.length} รายการ)
                  </option>
                  <option value="cold_chain_logs">
                    บันทึกการควบคุมอุณหภูมิห่วงโซ่ความเย็น (Cold Chain Logs)
                  </option>
                  <option value="staff_directory">
                    รายชื่อบุคลากรและเจ้าหน้าที่ประจำสถานพยาบาล ({hospitalStaff.length} คน)
                  </option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">รูปแบบไฟล์เอกสาร *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'pdf' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('pdf')}
                    disabled={isExporting}
                    style={{ height: 40, justifyContent: 'center' }}
                  >
                    📄 PDF (.pdf)
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'excel' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('excel')}
                    disabled={isExporting}
                    style={{ height: 40, justifyContent: 'center' }}
                  >
                    📊 Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'csv' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('csv')}
                    disabled={isExporting}
                    style={{ height: 40, justifyContent: 'center' }}
                  >
                    📝 CSV (.csv)
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12,
                  color: '#166534',
                }}
              >
                ✓ ระบบจะดาวน์โหลดไฟล์รายงานลงในเครื่องของคุณโดยตรง พร้อมตรารับรองข้อมูลดิจิทัล
              </div>
            </div>

            <div className="admin-modal-foot">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setIsExportOpen(false)}
                disabled={isExporting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={handleDownloadHospitalReport}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isExporting ? (
                  <>
                    <span className="admin-live-pulse" /> กำลังดาวน์โหลด...
                  </>
                ) : (
                  <>
                    <Icon name="download" style={{ width: 16, height: 16 }} />
                    ดาวน์โหลดไฟล์ทันที
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
