import React, { useState, useEffect } from 'react';
import logoMark from '../assets/logo-mark.png';
import logoWordmark from '../assets/logo-wordmark.png';
import { useAuth } from '../context/AuthContext';
import * as authApi from '../services/authApi';
import type { RoleAccountDemo } from '../types/auth';
import type { RoleCode } from '../lib/rbac';

const ROLE_INFO: Record<RoleCode, { label: string; icon: string; desc: string; color: string; bg: string }> = {
  PHARMACIST: { label: 'เภสัชกร', icon: 'pill', desc: 'คลังยา เบิกยืม-จัดสรรยาใกล้หมดอายุ', color: '#1D4ED8', bg: '#EFF6FF' },
  HOSPITAL_ADMIN: { label: 'ผู้ดูแลโรงพยาบาล', icon: 'hosp', desc: 'จัดการผู้ใช้และตั้งค่า รพ.', color: '#0F766E', bg: '#F0FDFA' },
  SYSTEM_ADMIN: { label: 'ผู้ดูแลระบบกลาง', icon: 'shield', desc: 'ภาพรวมเขตและควบคุมระบบ', color: '#7C3AED', bg: '#F5F3FF' },
  WAREHOUSE_OFFICER: { label: 'เจ้าหน้าที่คลังยา', icon: 'box', desc: 'รับเข้า-จ่ายยา แพ็กชุดฉุกเฉิน', color: '#B45309', bg: '#FFFBEB' },
  ER_STAFF: { label: 'พยาบาลฉุกเฉิน', icon: 'siren', desc: 'คัดกรองผู้ป่วย ประสานยาเหตุหมู่', color: '#DC2626', bg: '#FEF2F2' },
  DRIVER: { label: 'พนักงานขับรถ', icon: 'truck', desc: 'ติดตามงานขนส่ง บันทึกอุณหภูมิ', color: '#0369A1', bg: '#F0F9FF' },
  AUDITOR: { label: 'ผู้ตรวจสอบภายใน', icon: 'check', desc: 'ตรวจสอบประวัติการใช้งานระบบ', color: '#4338CA', bg: '#EEF2FF' },
  REGION_ADMIN: { label: 'ผู้บริหารเขตสุขภาพ', icon: 'network', desc: 'คลังกลางเขต จัดสรรยากลาง', color: '#047857', bg: '#ECFDF5' },
  DATA_ADMIN: { label: 'ผู้ดูแลข้อมูลยา', icon: 'spark', desc: 'จับคู่รหัสยากับบัญชียากลาง', color: '#9333EA', bg: '#FAF5FF' },
  PROCUREMENT_OFFICER: { label: 'เจ้าหน้าที่จัดซื้อ', icon: 'chart', desc: 'ดูการพยากรณ์และร่างใบสั่งซื้อ', color: '#C2410C', bg: '#FFF7ED' },
};

/** The accounts used to demo how the roles work together (db/demo/README.md). */
const DEMO_CAST: { email: string; role: RoleCode; hospital_code: string; hospital_name: string; title: string; does: string }[] = [
  { email: 'er_staff1.ha@example.org', role: 'ER_STAFF', hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', title: 'ER (ผู้แจ้งเหตุ)', does: 'แจ้งเหตุ อนุมัติแผน ส่งคำขอยืมฉุกเฉิน' },
  { email: 'pharmacist1.ha@example.org', role: 'PHARMACIST', hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', title: 'เภสัช (ผู้ขอยืม)', does: 'สร้าง/อนุมัติคำขอยืม จัดการยาใกล้หมดอายุ' },
  { email: 'pharmacist1.hc@example.org', role: 'PHARMACIST', hospital_code: 'HC', hospital_name: 'โรงพยาบาลพระสมุทรเจดีย์ฯ', title: 'เภสัช (ผู้ให้ยืม)', does: 'ตอบรับหรือปฏิเสธคำขอยืมที่ส่งมา' },
  { email: 'warehouse_officer1.ha@example.org', role: 'WAREHOUSE_OFFICER', hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', title: 'คลัง (ผู้รับ / แพ็กชุด)', does: 'โหลดของ รับของเข้า แพ็กชุดฉุกเฉิน' },
  { email: 'warehouse_officer1.hc@example.org', role: 'WAREHOUSE_OFFICER', hospital_code: 'HC', hospital_name: 'โรงพยาบาลพระสมุทรเจดีย์ฯ', title: 'คลัง (ผู้ให้ยืม)', does: 'โหลดของขึ้นรถ ถ่ายรูป' },
  { email: 'driver1.ha@example.org', role: 'DRIVER', hospital_code: 'HA', hospital_name: 'โรงพยาบาลสมุทรปราการ', title: 'คนขับ (รพ.สมุทรปราการ)', does: 'ออกเดินทาง ยืนยันถึงปลายทาง' },
  { email: 'driver1.hc@example.org', role: 'DRIVER', hospital_code: 'HC', hospital_name: 'โรงพยาบาลพระสมุทรเจดีย์ฯ', title: 'คนขับ (รพ.พระสมุทรเจดีย์ฯ)', does: 'ออกเดินทาง ยืนยันถึงปลายทาง' },
  { email: 'driver1.hb@example.org', role: 'DRIVER', hospital_code: 'HB', hospital_name: 'โรงพยาบาลบางพลี', title: 'คนขับ (รพ.บางพลี)', does: 'ออกเดินทาง ยืนยันถึงปลายทาง' },
  { email: 'pharmacist1.hb@example.org', role: 'PHARMACIST', hospital_code: 'HB', hospital_name: 'โรงพยาบาลบางพลี', title: 'เภสัช (รพ.บางพลี)', does: 'ปล่อยยาใกล้หมดอายุ เห็นชอบแผนจัดสรร ตอบคำขอยืม' },
  { email: 'pharmacist1.hd@example.org', role: 'PHARMACIST', hospital_code: 'HD', hospital_name: 'โรงพยาบาลบางบ่อ', title: 'เภสัช (รพ.บางบ่อ)', does: 'ปล่อยยาใกล้หมดอายุ เห็นชอบแผนจัดสรร ตอบคำขอยืม' },
  { email: 'pharmacist1.he@example.org', role: 'PHARMACIST', hospital_code: 'HE', hospital_name: 'โรงพยาบาลบางเสาธง', title: 'เภสัช (รพ.บางเสาธง)', does: 'ปล่อยยาใกล้หมดอายุ เห็นชอบแผนจัดสรร ตอบคำขอยืม' },
  { email: 'warehouse_officer1.hb@example.org', role: 'WAREHOUSE_OFFICER', hospital_code: 'HB', hospital_name: 'โรงพยาบาลบางพลี', title: 'คลัง (รพ.บางพลี)', does: 'แพ็กและโหลดของขึ้นรถ รับของเข้า' },
  { email: 'warehouse_officer1.hd@example.org', role: 'WAREHOUSE_OFFICER', hospital_code: 'HD', hospital_name: 'โรงพยาบาลบางบ่อ', title: 'คลัง (รพ.บางบ่อ)', does: 'แพ็กและโหลดของขึ้นรถ รับของเข้า' },
  { email: 'warehouse_officer1.he@example.org', role: 'WAREHOUSE_OFFICER', hospital_code: 'HE', hospital_name: 'โรงพยาบาลบางเสาธง', title: 'คลัง (รพ.บางเสาธง)', does: 'แพ็กและโหลดของขึ้นรถ รับของเข้า' },
  { email: 'driver1.hd@example.org', role: 'DRIVER', hospital_code: 'HD', hospital_name: 'โรงพยาบาลบางบ่อ', title: 'คนขับ (รพ.บางบ่อ)', does: 'ออกเดินทาง ยืนยันถึงปลายทาง' },
  { email: 'driver1.he@example.org', role: 'DRIVER', hospital_code: 'HE', hospital_name: 'โรงพยาบาลบางเสาธง', title: 'คนขับ (รพ.บางเสาธง)', does: 'ออกเดินทาง ยืนยันถึงปลายทาง' },
];
const ROLE_SHORT: Partial<Record<RoleCode, string>> = { ER_STAFF: 'ฉุกเฉิน', PHARMACIST: 'เภสัชกร', WAREHOUSE_OFFICER: 'คลังยา', DRIVER: 'คนขับ' };
const HOSPITAL_ORDER = ['HA', 'HB', 'HC', 'HD', 'HE'];
const ROLE_ORDER: RoleCode[] = ['ER_STAFF', 'PHARMACIST', 'WAREHOUSE_OFFICER', 'DRIVER'];
const DEMO_ROLES: RoleCode[] = ['PHARMACIST', 'WAREHOUSE_OFFICER', 'ER_STAFF', 'DRIVER'];

export function LoginPage() {
  const { login, dbConnected, dbMessage, refreshHealth, cognitoAuth } = useAuth();

  const [email, setEmail] = useState('pharmacist1.ha@example.org');
  const [password, setPassword] = useState('doorare123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleCode>('PHARMACIST');
  const [roleAccounts, setRoleAccounts] = useState<RoleAccountDemo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA State (SEC-001)
  const [mfaRequired, setMfaRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfaNotice, setMfaNotice] = useState('');

  // Fetch real accounts from database
  useEffect(() => {
    let mounted = true;
    authApi.getRoleAccounts().then((accounts) => {
      if (mounted && accounts.length > 0) {
        setRoleAccounts(accounts);
        const pharma = accounts.find((a) => a.role === 'PHARMACIST');
        if (pharma) {
          setEmail(pharma.email);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectRole = (acc: RoleAccountDemo) => {
    setSelectedRole(acc.role);
    setEmail(acc.email);
    setPassword('doorare123');
    setError(null);
    setMfaRequired(false);
  };

  const handleLoginSubmit = async (e?: React.FormEvent, skipMfaCheck = false) => {
    if (e) e.preventDefault();
    if (!email) {
      setError('กรุณากรอกอีเมลผู้ใช้งาน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await login({
        email,
        password,
        otp: mfaRequired ? otpCode : undefined,
        skipPassword: false,
        mfaVerified: skipMfaCheck,
      });

      if (!res.ok) {
        setError(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
        setLoading(false);
        return;
      }

      if (res.requireMfa && !skipMfaCheck) {
        setMfaRequired(true);
        setMfaNotice('กรุณากรอกรหัส 6 หลักจากแอปยืนยันตัวตน');
        setLoading(false);
        return;
      }

      // Success will automatically update auth context and redirect!
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      setLoading(false);
    }
  };

  const handleQuickLoginRole = async (acc: RoleAccountDemo) => {
    handleSelectRole(acc);
    setLoading(true);
    setError(null);
    try {
      const res = await login({
        email: acc.email,
        password: 'doorare123',
        skipPassword: true,
      });

      if (!res.ok) {
        setError(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
      } else if (res.requireMfa) {
        setMfaRequired(true);
        setMfaNotice('กรุณากรอกรหัส 6 หลักจากแอปยืนยันตัวตน');
      }
    } catch (err: any) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Noto Sans Thai', sans-serif",
      }}
    >
      {/* TOP HEADER BAR (Option 2: Soft Ice Blue) */}
      <header
        style={{
          height: 64,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #EFF6FF 100%)',
          borderBottom: '1px solid #DBEAFE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 1px 4px rgba(29, 78, 216, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logoMark} alt="PharmaSync+" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <img src={logoWordmark} alt="PharmaSync+" style={{ height: 20, objectFit: 'contain' }} />
          <span
            style={{
              fontSize: 12,
              color: '#1E40AF',
              borderLeft: '1px solid #BFDBFE',
              paddingLeft: 12,
              marginLeft: 4,
              fontWeight: 600,
            }}
          >
            ระบบสำรองและบริหารจัดการยาขาดแคลน เขตสุขภาพที่ 6
          </span>
        </div>

        {/* Database Health Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: dbConnected ? '#ECFDF5' : '#FEF2F2',
              border: `1px solid ${dbConnected ? '#A7F3D0' : '#FECACA'}`,
              color: dbConnected ? '#065F46' : '#991B1B',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: dbConnected ? '#10B981' : '#EF4444',
                boxShadow: dbConnected ? '0 0 6px rgba(16, 185, 129, 0.4)' : 'none',
              }}
            />
            {dbConnected ? 'ระบบพร้อมใช้งาน' : 'เชื่อมต่อระบบไม่ได้'}
          </div>
          <button
            type="button"
            onClick={refreshHealth}
            title={dbMessage}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#2563EB',
              cursor: 'pointer',
              fontSize: 12,
              padding: 4,
              fontWeight: 500,
            }}
          >
            ↻ ตรวจสอบ
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main
        style={{
          flex: 1,
          maxWidth: 1240,
          width: '100%',
          margin: '0 auto',
          padding: '32px 20px',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 32,
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: 10-ROLE QUICK SELECTOR */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F2A5C', margin: 0 }}>
              เลือกบทบาทเพื่อเข้าสู่ระบบ
            </h1>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4, margin: 0 }}>
              กดการ์ดบัญชีเดโมเพื่อเข้าสู่ระบบทันที
            </p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2A5C', marginBottom: 8 }}>
              บัญชีเดโมของแต่ละโรงพยาบาล
            </div>
            {HOSPITAL_ORDER.map((code) => {
              const cast = DEMO_CAST.filter((c) => c.hospital_code === code).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
              if (!cast.length) return null;
              return (
                <div key={code} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F2A5C', margin: '2px 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cast[0].hospital_name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {cast.map((c) => {
                      const info = ROLE_INFO[c.role];
                      const selected = email === c.email;
                      const quick = (x: typeof c) => handleQuickLoginRole({ id: x.email, email: x.email, display_name: x.title, role: x.role, mfa_enabled: false, hospital_code: x.hospital_code, hospital_name: x.hospital_name, all_roles: [x.role] });
                      return (
                        <div
                          key={c.email}
                          onClick={() => !loading && quick(c)}
                          style={{ background: '#FFFFFF', border: `2px solid ${selected ? info.color : '#E2E8F0'}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                          <span style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 10, whiteSpace: 'nowrap', background: info.bg, color: info.color }}>{ROLE_SHORT[c.role]}</span>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F2A5C', lineHeight: '16px' }}>{c.title}</div>
                          <div style={{ fontSize: 10, color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 3, lineHeight: '13px', flex: 1 }}>{c.does}</div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={(e) => { e.stopPropagation(); quick(c); }}
                              style={{ background: selected ? info.color : '#F1F5F9', color: selected ? '#FFFFFF' : '#0F2A5C', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {loading && selected ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ ➔'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2A5C', marginBottom: 8 }}>บทบาทอื่น</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {roleAccounts.filter((a) => !DEMO_ROLES.includes(a.role)).map((acc) => {
              const info = ROLE_INFO[acc.role] || {
                label: acc.role,
                icon: 'user',
                desc: 'ผู้ใช้งานระบบ',
                color: '#475569',
                bg: '#F1F5F9',
              };
              const isSelected = selectedRole === acc.role;

              return (
                <div
                  key={acc.id}
                  onClick={() => handleSelectRole(acc)}
                  style={{
                    background: isSelected ? '#FFFFFF' : '#FFFFFF',
                    border: `2px solid ${isSelected ? info.color : '#E2E8F0'}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                    boxShadow: isSelected
                      ? `0 4px 14px ${info.color}25`
                      : '0 1px 3px rgba(0,0,0,0.03)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: info.bg,
                        color: info.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                      }}
                    >
                      {info.label}
                    </span>
                    {acc.mfa_enabled && (
                      <span
                        title="บัญชีนี้ต้องยืนยันตัวตน 2 ขั้นตอน"
                        style={{ fontSize: 10, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        🔒 ยืนยัน 2 ขั้นตอน
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F2A5C' }}>
                      {acc.display_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                      {acc.hospital_name}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: '#475569',
                      marginTop: 8,
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: 6,
                    }}
                  >
                    {info.desc}
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickLoginRole(acc);
                      }}
                      style={{
                        background: isSelected ? info.color : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : '#0F2A5C',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      {loading && isSelected ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ ➔'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: LOGIN FORM & MFA MODAL */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: 28,
            boxShadow: '0 4px 16px rgba(15, 42, 92, 0.06)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F2A5C', margin: 0 }}>
              เข้าสู่ระบบ
            </h2>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
              กรอกอีเมลและรหัสผ่าน หรือเลือกบัญชีเดโมทางซ้าย
            </div>
          </div>

          {/* AWS COGNITO SINGLE SIGN-ON */}
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              disabled={loading || cognitoAuth?.isLoading}
              onClick={() => {
                if (cognitoAuth) {
                  cognitoAuth.signinRedirect().catch((err: any) => {
                    console.error('[Cognito] signinRedirect error', err);
                    setError(`Cognito Error: ${err.message || 'Cannot redirect to Cognito'}`);
                  });
                }
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#232F3E',
                color: '#FFFFFF',
                border: '1.5px solid #FF9900',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 2px 6px rgba(35, 47, 62, 0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="#FF9900"/>
              </svg>
              <span>{cognitoAuth?.isLoading ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วยบัญชีองค์กร (SSO)'}</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 14px', color: '#94A3B8', fontSize: 12 }}>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              <span style={{ padding: '0 10px' }}>หรือใช้อีเมลและรหัสผ่าน</span>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
            </div>
          </div>

          {cognitoAuth?.error && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                marginBottom: 16,
              }}
            >
              <b>เข้าสู่ระบบองค์กรไม่สำเร็จ:</b> {cognitoAuth.error.message}
            </div>
          )}

          {/* ERROR ALERT */}
          {error && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1 }}>{error}</div>
            </div>
          )}

          {/* MFA CHALLENGE VIEW */}
          {mfaRequired ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  padding: '12px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>ยืนยันตัวตน 2 ขั้นตอน</div>
                <div>{mfaNotice}</div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: 6,
                  }}
                >
                  รหัส 6 หลัก
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  placeholder="เช่น 123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    height: 44,
                    padding: '0 12px',
                    fontSize: 18,
                    letterSpacing: '4px',
                    textAlign: 'center',
                    border: '1.5px solid #CBD5E1',
                    borderRadius: 8,
                    outline: 'none',
                    fontWeight: 700,
                    color: '#0F2A5C',
                  }}
                />
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  เดโมใช้รหัส <code>123456</code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setMfaRequired(false)}
                  style={{
                    flex: 1,
                    height: 40,
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={loading || otpCode.length < 6}
                  onClick={() => handleLoginSubmit()}
                  style={{
                    flex: 2,
                    height: 40,
                    background: '#1D4ED8',
                    border: 'none',
                    borderRadius: 8,
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: otpCode.length < 6 ? 0.6 : 1,
                  }}
                >
                  {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส'}
                </button>
              </div>
            </div>
          ) : (
            /* STANDARD CREDENTIALS FORM */
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: 5,
                  }}
                >
                  อีเมล
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="เช่น user@example.org"
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px',
                    fontSize: 13,
                    border: '1.5px solid #CBD5E1',
                    borderRadius: 8,
                    outline: 'none',
                    color: '#0F2A5C',
                    background: '#F8FAFC',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: 5,
                  }}
                >
                  <span>รหัสผ่าน</span>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>
                    เดโมใช้ <code>doorare123</code>
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="รหัสผ่าน"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      fontSize: 13,
                      border: '1.5px solid #CBD5E1',
                      borderRadius: 8,
                      outline: 'none',
                      color: '#0F2A5C',
                      background: '#F8FAFC',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#475569',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  จำการเข้าสู่ระบบไว้ในอุปกรณ์นี้
                </label>
                <span style={{ color: '#1D4ED8', cursor: 'pointer' }}>ลืมรหัสผ่าน?</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  height: 42,
                  background: '#1D4ED8',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 0.15s',
                  boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)',
                }}
              >
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          )}

          {/* COMPLIANCE & AUDIT FOOTER */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid #E2E8F0',
              fontSize: 11,
              color: '#64748B',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#334155' }}>
              <span>🛡️</span> ทุกการเข้าสู่ระบบถูกบันทึกไว้เพื่อความปลอดภัย
            </div>
            <div style={{ marginTop: 4 }}>
              เก็บที่อยู่ IP อุปกรณ์ และเวลา โดยแก้ไขย้อนหลังไม่ได้
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
