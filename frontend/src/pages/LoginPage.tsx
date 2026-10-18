import React, { useState, useEffect } from 'react';
import logoMark from '../assets/logo-mark.png';
import logoWordmark from '../assets/logo-wordmark.png';
import { useAuth } from '../context/AuthContext';
import * as authApi from '../services/authApi';
import type { RoleAccountDemo } from '../types/auth';
import type { RoleCode } from '../lib/rbac';

const ROLE_INFO: Record<RoleCode, { label: string; icon: string; desc: string; color: string; bg: string }> = {
  PHARMACIST: { label: 'เภสัชกร (Pharmacist)', icon: 'pill', desc: 'คลังยา เบิกยืม-จัดสรรยาใกล้หมดอายุ', color: '#1D4ED8', bg: '#EFF6FF' },
  HOSPITAL_ADMIN: { label: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)', icon: 'hosp', desc: 'จัดการผู้ใช้และตั้งค่า รพ. (ADM-02)', color: '#0F766E', bg: '#F0FDFA' },
  SYSTEM_ADMIN: { label: 'ผู้ดูแลระบบกลาง (System Admin)', icon: 'shield', desc: 'ภาพรวมเขตและควบคุมระบบ (ADM-01)', color: '#7C3AED', bg: '#F5F3FF' },
  WAREHOUSE_OFFICER: { label: 'เจ้าหน้าที่คลังยา (Warehouse)', icon: 'box', desc: 'รับเข้า-จ่ายยา แพ็กชุดฉุกเฉิน (UI-13)', color: '#B45309', bg: '#FFFBEB' },
  ER_STAFF: { label: 'พยาบาลฉุกเฉิน (ER Staff)', icon: 'siren', desc: 'คัดกรองผู้ป่วย ประสานยาเหตุหมู่ (UI-11)', color: '#DC2626', bg: '#FEF2F2' },
  DRIVER: { label: 'พนักงานขับรถ (Driver)', icon: 'truck', desc: 'ติดตามงานขนส่ง บันทึกอุณหภูมิ (UI-14)', color: '#0369A1', bg: '#F0F9FF' },
  AUDITOR: { label: 'ผู้ตรวจสอบภายใน (Auditor)', icon: 'check', desc: 'ตรวจสอบ Hash Chain และ Audit Trail (UI-18)', color: '#4338CA', bg: '#EEF2FF' },
  REGION_ADMIN: { label: 'ผู้บริหารเขตสุขภาพ (Region Admin)', icon: 'network', desc: 'คลังกลางเขต จัดสรรยากลาง (UI-08)', color: '#047857', bg: '#ECFDF5' },
  DATA_ADMIN: { label: 'ผู้ดูแลข้อมูลยา (Data Admin)', icon: 'spark', desc: 'จับคู่รหัสยา TMT และบัญชีกลาง (UI-16)', color: '#9333EA', bg: '#FAF5FF' },
  PROCUREMENT_OFFICER: { label: 'เจ้าหน้าที่จัดซื้อ (Procurement)', icon: 'chart', desc: 'ดูการพยากรณ์และร่างใบสั่งซื้อ (UI-02)', color: '#C2410C', bg: '#FFF7ED' },
};

export function LoginPage() {
  const { login, dbConnected, dbMessage, refreshHealth } = useAuth();

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
        setMfaNotice(res.message || 'บัญชีนี้เปิดใช้งาน MFA กรุณากรอกรหัส Authenticator 6 หลัก');
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
        setMfaNotice('บัญชีนี้เปิดใช้งาน MFA กรุณากรอกรหัส Authenticator (สำหรับทดสอบใช้ 123456)');
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
      {/* TOP HEADER BAR */}
      <header
        style={{
          height: 64,
          background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 2px 10px rgba(30, 64, 175, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logoMark} alt="DooRare" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <img src={logoWordmark} alt="DooRare ดูแร์" style={{ height: 20, objectFit: 'contain' }} />
          <span
            style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.9)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
              paddingLeft: 12,
              marginLeft: 4,
              fontWeight: 500,
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
              background: dbConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
              border: `1px solid ${dbConnected ? 'rgba(52, 211, 153, 0.5)' : 'rgba(248, 113, 113, 0.5)'}`,
              color: '#FFFFFF',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: dbConnected ? '#34D399' : '#EF4444',
                boxShadow: dbConnected ? '0 0 8px #34D399' : 'none',
              }}
            />
            {dbConnected ? 'PostgreSQL (Port 5442) ออนไลน์' : 'PostgreSQL ออฟไลน์'}
          </div>
          <button
            type="button"
            onClick={refreshHealth}
            title={dbMessage}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.85)',
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
              เลือกเข้าสู่ระบบตามบทบาทผู้ใช้งาน
            </h1>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4, margin: 0 }}>
              ดึงบัญชีจริงจากตาราง <code>app_user</code> และ <code>app_user_role</code> ใน PostgreSQL
              เพื่อทดสอบการทำงานของแต่ละ Role Shell
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {roleAccounts.map((acc) => {
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
                      {acc.role}
                    </span>
                    {acc.mfa_enabled && (
                      <span
                        title="บัญชีนี้บังคับใช้ MFA (SEC-001)"
                        style={{ fontSize: 10, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        🔒 MFA
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
              ลงชื่อเข้าสู่ระบบ (Sign In)
            </h2>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
              ระบุบัญชีผู้ใช้ หรือเลือกบทบาทด้านซ้ายเพื่อทดสอบ
            </div>
          </div>

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
                <div style={{ fontWeight: 700, marginBottom: 4 }}>🔐 ตรวจสอบยืนยันตัวตน 2 ขั้นตอน (MFA)</div>
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
                  รหัส Authenticator 6 หลัก
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
                  * บัญชี Admin/Pharmacist/Auditor บังคับใช้ MFA (SEC-001) · รหัสทดสอบ Dev: <code>123456</code>
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
                  {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส OTP'}
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
                  อีเมลผู้ใช้งาน (Email)
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
                  <span>รหัสผ่าน (Password)</span>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>
                    ค่าเริ่มต้น: <code>doorare123</code>
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
                {loading ? 'กำลังตรวจสอบสิทธิ์...' : 'เข้าสู่ระบบ (Sign In)'}
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
              <span>🛡️</span> ความปลอดภัยและธรรมาภิบาลข้อมูล (SEC-001 / PDPA):
            </div>
            <div style={{ marginTop: 4 }}>
              ทุกการลงชื่อเข้าใช้ (สำเร็จหรือล้มเหลว) จะถูกบันทึกที่อยู่ IP, ประเภทอุปกรณ์, และเวลา ลงในตาราง{' '}
              <code>login_event</code> แบบไม่สามารถแก้ไขได้ และอัปเดตสถิติสดไปยังหน้า System Admin (ADM-01) และ Hospital Admin Audit Log
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
