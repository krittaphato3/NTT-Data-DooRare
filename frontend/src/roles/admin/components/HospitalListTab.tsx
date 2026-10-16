import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { HospitalSummary } from '../data/adminData';

interface HospitalListTabProps {
  hospitals: HospitalSummary[];
  onSelectHospital: (hospitalId: string) => void;
  onUpdateHospital?: (id: string, updates: Partial<HospitalSummary>) => void;
  onAddHospital?: (
    newHosp: Omit<
      HospitalSummary,
      | 'id'
      | 'requestCount'
      | 'incomingCount'
      | 'approvedCount'
      | 'rejectedCount'
      | 'timeoutCount'
      | 'dispatchedCount'
      | 'inTransitCount'
      | 'staffCount'
      | 'detailedLogs'
    >,
  ) => void;
  externalQuery?: string;
}

export function HospitalListTab({
  hospitals,
  onSelectHospital,
  onUpdateHospital,
  onAddHospital,
  externalQuery = '',
}: HospitalListTabProps) {
  const [search, setSearch] = useState(externalQuery);
  const [provinceFilter, setProvinceFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal State for Hospital Settings / Create
  const [editingHospital, setEditingHospital] = useState<HospitalSummary | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formShortName, setFormShortName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formProvince, setFormProvince] = useState('สมุทรปราการ');
  const [formType, setFormType] = useState<'รพศ.' | 'รพท.' | 'รพช.'>('รพช.');
  const [formBedCount, setFormBedCount] = useState(120);
  const [formHasColdChain, setFormHasColdChain] = useState(true);
  const [formHasBloodBank, setFormHasBloodBank] = useState(false);
  const [formAgentParticipation, setFormAgentParticipation] = useState(true);

  const openEditModal = (h: HospitalSummary) => {
    setEditingHospital(h);
    setIsAddingNew(false);
    setFormName(h.name);
    setFormShortName(h.shortName);
    setFormCode(h.code);
    setFormProvince(h.province);
    setFormType(h.type);
    setFormBedCount(h.bedCount);
    setFormHasColdChain(h.hasColdChain);
    setFormHasBloodBank(h.hasBloodBank);
    setFormAgentParticipation(h.agentParticipation);
  };

  const openAddModal = () => {
    setEditingHospital(null);
    setIsAddingNew(true);
    setFormName('');
    setFormShortName('');
    setFormCode('');
    setFormProvince('สมุทรปราการ');
    setFormType('รพช.');
    setFormBedCount(100);
    setFormHasColdChain(true);
    setFormHasBloodBank(false);
    setFormAgentParticipation(true);
  };

  const handleSaveHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      alert('กรุณากรอกชื่อและรหัสสถานพยาบาลให้ครบถ้วน');
      return;
    }

    if (isAddingNew && onAddHospital) {
      onAddHospital({
        name: formName.trim(),
        shortName: formShortName.trim() || formName.trim(),
        code: formCode.trim(),
        province: formProvince,
        type: formType,
        bedCount: Number(formBedCount) || 100,
        hasColdChain: formHasColdChain,
        hasBloodBank: formHasBloodBank,
        agentParticipation: formAgentParticipation,
      });
    } else if (editingHospital && onUpdateHospital) {
      onUpdateHospital(editingHospital.id, {
        name: formName.trim(),
        shortName: formShortName.trim() || formName.trim(),
        code: formCode.trim(),
        province: formProvince,
        type: formType,
        bedCount: Number(formBedCount) || 100,
        hasColdChain: formHasColdChain,
        hasBloodBank: formHasBloodBank,
        agentParticipation: formAgentParticipation,
      });
    }

    setEditingHospital(null);
    setIsAddingNew(false);
  };

  const provinces = Array.from(new Set(hospitals.map((h) => h.province)));

  const effectiveSearch = (externalQuery || search).toLowerCase();

  const filteredHospitals = hospitals.filter((h) => {
    const matchSearch =
      !effectiveSearch ||
      h.name.toLowerCase().includes(effectiveSearch) ||
      h.code.includes(effectiveSearch) ||
      h.province.toLowerCase().includes(effectiveSearch);
    const matchProvince = provinceFilter === 'ALL' || h.province === provinceFilter;
    const matchType = typeFilter === 'ALL' || h.type === typeFilter;
    return matchSearch && matchProvince && matchType;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FILTER TOOLBAR */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search-input">
            <Icon name="search" style={{ width: 16, height: 16, color: '#94A3B8' }} />
            <input
              type="search"
              placeholder="ค้นหาชื่อโรงพยาบาล, รหัส 5 หลัก, จังหวัด..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-select"
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            aria-label="กรองตามจังหวัด"
          >
            <option value="ALL">ทุกจังหวัด ({provinces.length})</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                จ.{p}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="กรองตามประเภทโรงพยาบาล"
          >
            <option value="ALL">ทุกระดับบริการ</option>
            <option value="รพศ.">รพศ. (โรงพยาบาลศูนย์)</option>
            <option value="รพท.">รพท. (โรงพยาบาลทั่วไป)</option>
            <option value="รพช.">รพช. (โรงพยาบาลชุมชน)</option>
          </select>

          {(search || provinceFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ height: 36, padding: '0 10px', fontSize: 12 }}
              onClick={() => {
                setSearch('');
                setProvinceFilter('ALL');
                setTypeFilter('ALL');
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            พบ <strong>{filteredHospitals.length}</strong> จาก <strong>{hospitals.length}</strong> โรงพยาบาล
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            style={{ height: 36, padding: '0 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={openAddModal}
          >
            <Icon name="plus" style={{ width: 14, height: 14 }} />
            เพิ่มโรงพยาบาล
          </button>
        </div>
      </div>

      {/* HOSPITALS TABLE */}
      <div className="admin-table-container">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>รหัส / ชื่อโรงพยาบาล</th>
                <th>ระดับ / จังหวัด</th>
                <th style={{ textAlign: 'center' }}>ระบบ Cold Chain</th>
                <th style={{ textAlign: 'center' }}>ธนาคารเลือด</th>
                <th style={{ textAlign: 'center' }}>AI Agent</th>
                <th style={{ textAlign: 'right' }}>ส่งคำขอ (Req)</th>
                <th style={{ textAlign: 'right' }}>อนุมัติ (Appr)</th>
                <th style={{ textAlign: 'right' }}>ปฏิเสธ (Rej)</th>
                <th style={{ textAlign: 'right' }}>หมดเวลา (Timeout)</th>
                <th style={{ textAlign: 'right' }}>นำส่งสำเร็จ (Dispatched)</th>
                <th style={{ textAlign: 'center' }}>อัตราสำเร็จ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredHospitals.map((h) => {
                const successPct =
                  h.requestCount > 0 ? ((h.approvedCount / h.requestCount) * 100).toFixed(1) : '100.0';
                return (
                  <tr key={h.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 14 }}>
                        {h.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        รหัสสถานพยาบาล: <span style={{ fontFamily: 'monospace' }}>{h.code}</span> · {h.bedCount} เตียง
                      </div>
                    </td>

                    <td>
                      <span className="admin-badge admin-badge-info" style={{ marginRight: 6 }}>
                        {h.type}
                      </span>
                      <span style={{ fontSize: 12, color: '#475569' }}>จ.{h.province}</span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {h.hasColdChain ? (
                        <span className="admin-badge admin-badge-success" title="มีตู้แช่ควบคุมอุณหภูมิ 2-8°C">
                          <Icon name="check" style={{ width: 12, height: 12 }} /> พร้อม
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-neutral">ไม่มี</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {h.hasBloodBank ? (
                        <span className="admin-badge admin-badge-danger" title="มีธนาคารเลือดรองรับเลือดฉุกเฉิน">
                          มีคลังเลือด
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-neutral">-</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {h.agentParticipation ? (
                        <span className="admin-badge admin-badge-success" title="เข้าร่วมระบบจับคู่คำขออัตโนมัติ">
                          อัตโนมัติ
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-warning" title="ดำเนินการตรวจสอบด้วยตนเอง">
                          Manual
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#0F2A5C' }}>
                      {h.requestCount} รอบ
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#15803D' }}>
                      {h.approvedCount}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>
                      {h.rejectedCount}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#D97706' }}>
                      {h.timeoutCount}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1E40AF' }}>
                      {h.dispatchedCount} รอบ
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`admin-badge ${
                          Number(successPct) >= 90
                            ? 'admin-badge-success'
                            : Number(successPct) >= 80
                            ? 'admin-badge-warning'
                            : 'admin-badge-danger'
                        }`}
                      >
                        {successPct}%
                      </span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn-primary"
                          style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                          onClick={() => onSelectHospital(h.id)}
                          title="ดูประวัติการขอและส่งยาอย่างละเอียด"
                        >
                          <Icon name="eye" style={{ width: 14, height: 14 }} />
                          รายละเอียด
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{ height: 32, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => openEditModal(h)}
                          title="แก้ไขข้อมูลและตั้งค่าขีดความสามารถโรงพยาบาล"
                        >
                          <Icon name="gear" style={{ width: 14, height: 14 }} />
                          แก้ไข/ตั้งค่า
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* HOSPITAL SETTINGS / CREATE MODAL */}
      {(editingHospital || isAddingNew) && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setEditingHospital(null);
            setIsAddingNew(false);
          }}
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">
                  {isAddingNew
                    ? 'เพิ่มโรงพยาบาลในเขตสุขภาพที่ 6'
                    : `แก้ไขข้อมูลและตั้งค่า: ${editingHospital?.name}`}
                </h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  กำหนดข้อมูลทั่วไป ระบบลูกโซ่ความเย็น (Cold Chain) และระบบอัตโนมัติ AI Agent
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => {
                  setEditingHospital(null);
                  setIsAddingNew(false);
                }}
              >
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
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="เช่น โรงพยาบาลสมุทรปราการ"
                    required
                  />
                </div>

                <div className="admin-grid-2col" style={{ gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">ชื่อย่อ (Short Name)</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      value={formShortName}
                      onChange={(e) => setFormShortName(e.target.value)}
                      placeholder="เช่น รพ.สมุทรปราการ"
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">รหัสสถานพยาบาล (5 หลัก) *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      placeholder="เช่น 10670"
                      required
                    />
                  </div>
                </div>

                <div className="admin-grid-2col" style={{ gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">จังหวัด (ในเขต 6) *</label>
                    <select
                      className="admin-form-select"
                      value={formProvince}
                      onChange={(e) => setFormProvince(e.target.value)}
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
                        value={formType}
                        onChange={(e) => setFormType(e.target.value as 'รพศ.' | 'รพท.' | 'รพช.')}
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
                        value={formBedCount}
                        onChange={(e) => setFormBedCount(Number(e.target.value) || 0)}
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
                    marginTop: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2A5C' }}>
                    ขีดความสามารถและระบบปฏิบัติการ (Capabilities & Integration):
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={formHasColdChain}
                      onChange={(e) => setFormHasColdChain(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>ระบบลูกโซ่ความเย็น (Cold Chain 2-8°C):</strong> มีตู้แช่เวชภัณฑ์และเซ็นเซอร์พร้อมส่ง/รับยาควบคุมอุณหภูมิ
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={formHasBloodBank}
                      onChange={(e) => setFormHasBloodBank(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>ธนาคารเลือด (Blood Bank):</strong> มีคลังโลหิตรองรับคำขอยืม Packed Red Cells และพลาสมาฉุกเฉิน
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={formAgentParticipation}
                      onChange={(e) => setFormAgentParticipation(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#1E40AF' }}
                    />
                    <span>
                      <strong>เข้าร่วมระบบ AI Agent Auto-Matching:</strong> อนุญาตให้อัลกอริทึมจัดสรรคำขอส่งยาโดยอัตโนมัติ
                    </span>
                  </label>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => {
                    setEditingHospital(null);
                    setIsAddingNew(false);
                  }}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  {isAddingNew ? 'บันทึกโรงพยาบาลใหม่' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
