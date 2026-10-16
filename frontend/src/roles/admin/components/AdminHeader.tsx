import { Icon } from '../../../components/common/icons';

export type AdminTab = 'dashboard' | 'hospitals' | 'accounts' | 'config' | 'audit';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  hospitalCount: number;
  userCount: number;
  onlineCount: number;
  selectedHospitalName?: string;
  onBackToHospitals?: () => void;
}

export function AdminHeader({
  activeTab,
  onTabChange,
  hospitalCount,
  userCount,
  onlineCount,
  selectedHospitalName,
  onBackToHospitals,
}: AdminHeaderProps) {
  return (
    <div className="admin-header">
      <div className="admin-header-top">
        <div className="admin-title-wrap">
          <div className="admin-title-icon">
            <Icon name="shield" style={{ width: 24, height: 24 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="admin-title">ระบบผู้ดูแลระบบกลาง · System Administration</h1>
              <span className="admin-role-badge">
                <Icon name="lock" style={{ width: 14, height: 14 }} />
                ROLE: SYSTEM_ADMIN (Super Admin)
              </span>
            </div>
            <div className="admin-subtitle">
              ศูนย์ประสานยาและเวชภัณฑ์ฉุกเฉิน เขตสุขภาพที่ 6 · จัดการโรงพยาบาล คำขอส่งยา และบัญชีผู้ใช้งาน
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="admin-badge admin-badge-success" style={{ padding: '6px 12px', fontSize: 12 }}>
            <span className="admin-live-pulse" />
            ผู้ใช้ออนไลน์สด {onlineCount} คน
          </div>
          <div className="admin-badge admin-badge-info" style={{ padding: '6px 12px', fontSize: 12 }}>
            เครือข่าย {hospitalCount} โรงพยาบาล
          </div>
        </div>
      </div>

      <nav className="admin-nav-tabs" aria-label="เมนูหลักผู้ดูแลระบบ">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
        >
          <Icon name="grid" style={{ width: 18, height: 18 }} />
          <span>ภาพรวมระบบ (Dashboard)</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'hospitals' ? 'active' : ''}`}
          onClick={() => onTabChange('hospitals')}
        >
          <Icon name="hosp" style={{ width: 18, height: 18 }} />
          <span>รายชื่อและสถิติโรงพยาบาล</span>
          <span className="admin-tab-badge">{hospitalCount}</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => onTabChange('accounts')}
        >
          <Icon name="users" style={{ width: 18, height: 18 }} />
          <span>จัดการบัญชีผู้ใช้ (Account CRUD)</span>
          <span className="admin-tab-badge">{userCount}</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => onTabChange('config')}
        >
          <Icon name="gear" style={{ width: 18, height: 18 }} />
          <span>ตั้งค่า · Kill switch</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => onTabChange('audit')}
        >
          <Icon name="shield" style={{ width: 18, height: 18 }} />
          <span>บันทึกตรวจสอบ (Audit Log)</span>
        </button>

        {selectedHospitalName && activeTab === 'hospitals' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>กำลังดูรายละเอียด:</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>{selectedHospitalName}</span>
            {onBackToHospitals && (
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                onClick={onBackToHospitals}
              >
                ดูทุกโรงพยาบาล
              </button>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
