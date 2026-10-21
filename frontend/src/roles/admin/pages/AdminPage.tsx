import { useEffect, useState } from 'react';
import '../admin.css';
import { AccountCrudTab } from '../components/AccountCrudTab';
import { AdminDashboardTab } from '../components/AdminDashboardTab';
import { AdminHeader, type AdminTab } from '../components/AdminHeader';
import { AuditLogTab } from '../components/AuditLogTab';
import { HospitalDetailView } from '../components/HospitalDetailView';
import { HospitalListTab } from '../components/HospitalListTab';
import { SystemConfigTab } from '../components/SystemConfigTab';
import * as authApi from '../../../services/authApi';
import { createHospital, getHospitals, updateHospital } from '../../../services/catalogApi';
import { mockFallbackEnabled, onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { hospitalFromApi, hospitalToApi } from '../data/hospitalsLive';
import { INITIAL_HOSPITALS, INITIAL_USERS, type HospitalSummary, type UserAccount } from '../data/adminData';

function initialTab(): AdminTab {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'hospitals') return 'hospitals';
    if (t === 'accounts') return 'accounts';
    if (t === 'config' || t === 'cfg') return 'config';
    if (t === 'audit' || t === 'aud') return 'audit';
  } catch {}
  return 'dashboard';
}

interface AdminPageProps {
  query?: string;
  onQuery?: (v: string) => void;
}

export function AdminPage({ query = '', onQuery }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<HospitalSummary[]>(mockFallbackEnabled() ? INITIAL_HOSPITALS : []);
  const [hospitalsLive, setHospitalsLive] = useState(false);
  const [liveOnline, setLiveOnline] = useState<number | null>(null);
  useEffect(() => {
    authApi.getRecentLogins(1).then((r) => setLiveOnline(r.onlineCount)).catch(() => setLiveOnline(null));
  }, []);
  const reloadHospitals = () =>
    getHospitals({ stats: true })
      .then((res) => {
        onLoadSuccess('hospitals');
        setHospitals(res.items.map(hospitalFromApi));
        setHospitalsLive(true);
      })
      .catch((e) => {
        const f = onLoadFailure('hospitals', e, INITIAL_HOSPITALS, [] as HospitalSummary[]);
        setHospitals(f.data);
        setHospitalsLive(false);
      });
  useEffect(() => {
    void reloadHospitals();
  }, []);
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const handleSelectHospital = (id: string) => {
    setSelectedHospitalId(id);
    setActiveTab('hospitals');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHospitals = () => {
    setSelectedHospitalId(null);
  };

  // Hospital CRUD Handlers
  const handleUpdateHospital = (id: string, updates: Partial<HospitalSummary>) => {
    if (hospitalsLive) {
      const version = hospitals.find((h) => h.id === id)?.version;
      updateHospital(id, { ...hospitalToApi(updates), ...(version ? { version } : {}) })
        .then(() => reloadHospitals())
        .then(() => showToast('อัปเดตข้อมูลโรงพยาบาลเรียบร้อยแล้ว'))
        .catch((e: Error) => showToast(`บันทึกไม่สำเร็จ: ${e.message}`));
      return;
    }
    setHospitals((prev) => prev.map((h) => (h.id === id ? { ...h, ...updates } : h)));
    showToast(`อัปเดตข้อมูลและขีดความสามารถของโรงพยาบาลเรียบร้อยแล้ว`);
  };

  const handleAddHospital = (
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
  ) => {
    if (hospitalsLive) {
      createHospital(hospitalToApi(newHosp))
        .then(() => reloadHospitals())
        .then(() => showToast(`เพิ่มโรงพยาบาล "${newHosp.name}" เข้าสู่เครือข่ายเรียบร้อยแล้ว`))
        .catch((e: Error) => showToast(`เพิ่มไม่สำเร็จ: ${e.message}`));
      return;
    }
    const id = `HOSP-${String(hospitals.length + 1).padStart(2, '0')}`;
    const hospital: HospitalSummary = {
      ...newHosp,
      id,
      requestCount: 0,
      incomingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      timeoutCount: 0,
      dispatchedCount: 0,
      inTransitCount: 0,
      staffCount: 0,
      detailedLogs: [],
    };
    setHospitals([hospital, ...hospitals]);
    showToast(`เพิ่มโรงพยาบาล "${newHosp.name}" เข้าสู่เครือข่ายเรียบร้อยแล้ว`);
  };

  // User CRUD Handlers
  const handleAddUser = (
    newUser: Omit<UserAccount, 'id' | 'createdAt' | 'loginCount' | 'lastLogin' | 'isOnline'>,
  ) => {
    const id = `USR-${String(users.length + 1).padStart(3, '0')}`;
    const account: UserAccount = {
      ...newUser,
      id,
      loginCount: 0,
      lastLogin: 'เพิ่งสร้างบัญชี (ยังไม่เคยเข้าสู่ระบบ)',
      isOnline: false,
      createdAt: '16 ต.ค. 69 (วันนี้)',
    };
    setUsers([account, ...users]);
    showToast(`สร้างบัญชีผู้ใช้ "${newUser.name}" เรียบร้อยแล้ว`);
  };

  const handleUpdateUser = (id: string, updates: Partial<UserAccount>) => {
    setUsers(users.map((u) => (u.id === id ? { ...u, ...updates } : u)));
    showToast(`อัปเดตข้อมูลบัญชีผู้ใช้เรียบร้อยแล้ว`);
  };

  const handleDeleteUser = (id: string) => {
    const user = users.find((u) => u.id === id);
    setUsers(users.filter((u) => u.id !== id));
    showToast(`ลบ/ระงับบัญชี "${user?.name || id}" เรียบร้อยแล้ว`);
  };

  const selectedHospital = selectedHospitalId
    ? hospitals.find((h) => h.id === selectedHospitalId)
    : null;

  return (
    <div className="admin-container">
      {/* Toast popup */}
      {toastMessage && (
        <div className="admin-toast">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <AdminHeader
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'hospitals') setSelectedHospitalId(null);
        }}
        hospitalCount={hospitals.length}
        userCount={hospitalsLive ? hospitals.reduce((n, h) => n + h.staffCount, 0) : users.length}
        onlineCount={liveOnline ?? (mockFallbackEnabled() ? users.filter((u) => u.isOnline).length : 0)}
        selectedHospitalName={selectedHospital?.name}
        onBackToHospitals={handleBackToHospitals}
      />

      {/* Quick query notification banner if searching from TopBar */}
      {query.trim() && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 8,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            color: '#1E40AF',
          }}
        >
          <span>
            🔍 กำลังค้นหา: <strong>"{query}"</strong> ในหมวด {activeTab}
          </span>
          {onQuery && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ height: 26, padding: '0 8px', fontSize: 11 }}
              onClick={() => onQuery('')}
            >
              ล้างการค้นหา
            </button>
          )}
        </div>
      )}

      {/* Content based on tab */}
      {activeTab === 'dashboard' && (
        <AdminDashboardTab
          hospitals={hospitals}
          users={users}
          onSelectHospital={handleSelectHospital}
          onGoToAccounts={() => setActiveTab('accounts')}
          onShowToast={showToast}
        />
      )}

      {activeTab === 'hospitals' && (
        selectedHospital ? (
          <HospitalDetailView
            hospital={selectedHospital}
            allUsers={users}
            onBack={handleBackToHospitals}
            onUpdateHospital={handleUpdateHospital}
            onShowToast={showToast}
          />
        ) : (
          <HospitalListTab
            hospitals={hospitals}
            onSelectHospital={handleSelectHospital}
            onUpdateHospital={handleUpdateHospital}
            onAddHospital={handleAddHospital}
            externalQuery={query}
          />
        )
      )}

      {activeTab === 'accounts' && (
        <AccountCrudTab
          users={users}
          hospitals={hospitals}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          externalQuery={query}
        />
      )}

      {activeTab === 'config' && (
        <SystemConfigTab onShowToast={showToast} />
      )}

      {activeTab === 'audit' && (
        <AuditLogTab externalQuery={query} onShowToast={showToast} />
      )}
    </div>
  );
}
