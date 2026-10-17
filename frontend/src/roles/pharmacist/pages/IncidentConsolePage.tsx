import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import { can, mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { fmtTime, useTick } from '../../../lib/time';
import {
  EMERGENCY_BORROWS,
  EXTRA_DRUGS,
  INCIDENT_HEADER,
  INCIDENT_LIST,
  INCIDENT_RETURNS,
  KIT_ASSEMBLIES,
  KIT_STOCK_OVERVIEW,
  PRESET_KITS,
} from '../data/incident';

type Scenario = 'normal' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7';

/**
 * UI-11 – UI-13 Emergency incident console. `role` gates every incident write through
 * `lib/rbac.ts` and drives the breadcrumb home.
 */
export function IncidentConsolePage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [activeTab, setActiveTab] = useState<'plan' | 'borrow' | 'pack' | 'summary'>('plan');
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [customEta, setCustomEta] = useState('');

  // Tab 1 state
  const [kits, setKits] = useState(PRESET_KITS);
  const [burnKitOption, setBurnKitOption] = useState<'none' | 'add'>('none');
  const [prcOption, setPrcOption] = useState<'4' | '6'>('4');

  // Tab 3 state
  const [assemblyList, setAssemblyList] = useState(KIT_ASSEMBLIES);

  // Tab 4 state
  const [returnsList, setReturnsList] = useState(INCIDENT_RETURNS);
  const [isClosed, setIsClosed] = useState(false);

  // Intake modal state
  const [intakeCategory, setIntakeCategory] = useState('รถโดยสาร / อุบัติเหตุจราจรหมู่');
  const [intakeLocation, setIntakeLocation] = useState('ถ.เทพารักษ์ กม.12 ขาออก');
  const [intakeDetail, setIntakeDetail] = useState('รถตู้ชนท้ายรถบัสที่คว่ำ มีผู้บาดเจ็บเพิ่ม');
  const [triageRed, setTriageRed] = useState('2');
  const [triageYellow, setTriageYellow] = useState('3');
  const [triageGreen, setTriageGreen] = useState('4');
  const [triageBlack, setTriageBlack] = useState('0');
  const [intakeEta, setIntakeEta] = useState('20');
  const [unsureEta, setUnsureEta] = useState(true);

  /* Recording an incident, adjusting the plan, packing a kit and closing the event are all F3
     writes (§4.3). A role without them either does not see the control or sees it disabled.
     The console is ER_STAFF's own screen; the pharmacist views F3 only (rbac.md v1.1 §4.3, and
     spec §5.2 grants PHARMACIST neither manageIncident nor approveIncidentPlan). */
  const mayWrite = mayActFor(role, 'ER_STAFF', 'manageIncident');
  const writeHint = requiredRoleHint('manageIncident');
  const mayApprovePlan = mayActFor(role, 'ER_STAFF', 'approveIncidentPlan');
  // Summary documents: ER prints them; the pharmacist may still view/print (§4.3 "ดู/พิมพ์").
  const mayPrint = mayWrite || can(role, 'printDocuments');

  // ER edits to plan v2 make a draft v3 that ER must approve before extra urgent borrows go out.
  const [planDirty, setPlanDirty] = useState(false);
  const [planApproved, setPlanApproved] = useState(false);
  const editPlan = () => {
    setPlanDirty(true);
    setPlanApproved(false);
  };

  const tick = useTick();
  const etaLeft = Math.max(0, INCIDENT_HEADER.etaMinutes - tick);

  // Stepper handlers
  const updateAssembleQty = (index: number, delta: number) => {
    editPlan();
    setKits((prev) =>
      prev.map((k, i) => {
        if (i !== index) return k;
        const nextAssemble = Math.max(0, Math.min(k.maxAssemble, k.assembleFromParts + delta));
        const needed = Math.max(0, k.estimated - k.readyInStock - nextAssemble);
        return {
          ...k,
          assembleFromParts: nextAssemble,
          borrowFullKit: needed,
        };
      })
    );
  };

  const togglePartChecked = (kitId: string, partIndex: number) => {
    setAssemblyList((prev) =>
      prev.map((kit) => {
        if (kit.id !== kitId) return kit;
        const newParts = kit.parts.map((p, pIdx) =>
          pIdx === partIndex ? { ...p, checked: !p.checked } : p
        );
        return { ...kit, parts: newParts };
      })
    );
  };

  const confirmKitAssembly = (kitId: string) => {
    setAssemblyList((prev) =>
      prev.map((kit) => {
        if (kit.id !== kitId) return kit;
        return {
          ...kit,
          status: 'done',
          statusLabel: 'จัดเสร็จ · ยืนยันแล้ว',
          statusCls: 'st-approved',
          canConfirm: false,
          footerText: `ตัดของแยกตามสูตรแล้ว · ชุดพร้อมใช้ +${kit.qty}`,
        };
      })
    );
  };

  const updateActualUsed = (index: number, val: string) => {
    setReturnsList((prev) =>
      prev.map((row, i) => (i === index ? { ...row, actualUsed: val } : row))
    );
  };

  // If S7 (Empty State: No active incident) is selected:
  if (scenario === 's7') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Scenario Switcher Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>จำลองสถานะพิเศษ (S1–S7):</span>
          {(['normal', 's1', 's2', 's3', 's4', 's5', 's6', 's7'] as Scenario[]).map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-sm"
              style={{
                height: 24,
                fontSize: 11,
                padding: '0 8px',
                background: scenario === s ? '#2563eb' : '#ffffff',
                color: scenario === s ? '#ffffff' : '#334155',
                border: scenario === s ? '1px solid #2563eb' : '1px solid #cbd5e1',
                fontWeight: scenario === s ? 600 : 400,
              }}
              onClick={() => {
                setScenario(s);
                if (s === 's6') setShowCancelModal(true);
              }}
            >
              {s === 'normal' ? 'เหตุปกติ' : s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* S7 Card */}
        <div
          className="card"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a',
            }}
          >
            <Icon name="checkc" className="ic24" />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f2a5c' }}>
            ไม่มีเหตุฉุกเฉินที่เปิดอยู่
          </h2>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            ชุดพร้อมใช้: Trauma Set 30 · IV Set 12 · Intubation Set 0 (ต่ำกว่าเป้า)
          </div>
          <div style={{ marginTop: 8 }}>
            {mayWrite && (
              <button
                type="button"
                className="btn btn-p"
                style={{ background: '#b91c1c', border: 'none', fontWeight: 600, padding: '8px 20px' }}
                onClick={() => setShowIntakeModal(true)}
              >
                <Icon name="siren" className="ic14" />
                + แจ้งเหตุใหม่
              </button>
            )}
          </div>
        </div>

        {/* Intake Modal if triggered */}
        {showIntakeModal && renderIntakeModal()}
      </div>
    );
  }

  function renderIntakeModal() {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}
        onClick={() => setShowIntakeModal(false)}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '92vh',
            overflowY: 'auto',
            background: '#ffffff',
            borderRadius: 12,
            padding: '20px 24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f2a5c' }}>
                แจ้งเหตุฉุกเฉินหมู่
              </h2>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                บันทึกจำนวนตามระดับคัดแยกเท่านั้น ไม่ต้องใส่ชื่อผู้ป่วย
              </div>
            </div>
            <button
              type="button"
              className="icbtn"
              onClick={() => setShowIntakeModal(false)}
            >
              <Icon name="x" className="ic14" />
            </button>
          </div>

          {/* Duplicate Detection Alert */}
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: '18px', marginBottom: 8 }}>
              อาจเป็นเหตุเดียวกับ INC-2026-000015 · แจ้งเมื่อ 6 นาทีที่ก่อน ห่างจากจุดนี้ 180 ม. (เกณฑ์ 10 นาที / 500 ม.) · รถโดยสารคว่ำ ถ.เทพารักษ์ กม.12
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {mayWrite && (
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  style={{ fontSize: 11.5 }}
                  onClick={() => setShowIntakeModal(false)}
                >
                  รวมกับเหตุเดิม (อัปเดตจำนวน)
                </button>
              )}
              <button
                type="button"
                className="btn btn-s btn-sm"
                style={{ fontSize: 11.5 }}
              >
                เป็นเหตุใหม่
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  ประเภทเหตุ <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={intakeCategory}
                  onChange={(e) => setIntakeCategory(e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '0 8px',
                    fontSize: 12.5,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="รถโดยสาร / อุบัติเหตุจราจรหมู่">รถโดยสาร / อุบัติเหตุจราจรหมู่</option>
                  <option value="ไฟไหม้โรงงาน">ไฟไหม้โรงงาน</option>
                  <option value="สารเคมีรั่วไหล">สารเคมีรั่วไหล</option>
                  <option value="อาคารถล่ม">อาคารถล่ม</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  สถานที่เกิดเหตุ <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={intakeLocation}
                  onChange={(e) => setIntakeLocation(e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '0 10px',
                    fontSize: 12.5,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                รายละเอียด
              </label>
              <textarea
                rows={2}
                value={intakeDetail}
                onChange={(e) => setIntakeDetail(e.target.value)}
                style={{
                  width: '100%',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Triage Inputs */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                จำนวนผู้ป่วยตามระดับคัดแยก
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>แดง · วิกฤต</div>
                  <input
                    type="number"
                    value={triageRed}
                    onChange={(e) => setTriageRed(e.target.value)}
                    style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b91c1c', border: '1px solid #f87171', borderRadius: 6, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#b45309', marginBottom: 4 }}>เหลือง · เร่งด่วน</div>
                  <input
                    type="number"
                    value={triageYellow}
                    onChange={(e) => setTriageYellow(e.target.value)}
                    style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b45309', border: '1px solid #fbbf24', borderRadius: 6, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>เขียว · ไม่เร่งด่วน</div>
                  <input
                    type="number"
                    value={triageGreen}
                    onChange={(e) => setTriageGreen(e.target.value)}
                    style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#15803d', border: '1px solid #4ade80', borderRadius: 6, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>ดำ · เสียชีวิต</div>
                  <input
                    type="number"
                    value={triageBlack}
                    onChange={(e) => setTriageBlack(e.target.value)}
                    style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#334155', border: '1px solid #94a3b8', borderRadius: 6, fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>

            {/* ETA Comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  ETA จากหน่วยกู้ภัย (นาที)
                </label>
                <input
                  type="number"
                  value={intakeEta}
                  onChange={(e) => setIntakeEta(e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '0 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={unsureEta}
                    onChange={(e) => setUnsureEta(e.target.checked)}
                    style={{ accentColor: '#2563eb' }}
                  />
                  <span>ไม่แน่ใจ (ให้ระบบเทียบกับเดินทางจริง)</span>
                </label>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2a5c', lineHeight: '17px' }}>
                  เดินทางจริงตอนนี้ 22 นาที (Amazon Location Service - เดินรถเหตุจริง)
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  ไม่แน่ใจ → ใช้ค่าที่น้อยกว่า = 20 นาที
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <button
              type="button"
              className="btn btn-s"
              onClick={() => setShowIntakeModal(false)}
            >
              ยกเลิก
            </button>
            {mayWrite && (
              <button
                type="button"
                className="btn btn-p"
                style={{ background: '#b91c1c', border: 'none', fontWeight: 600 }}
                onClick={() => {
                  setShowIntakeModal(false);
                  setScenario('normal');
                }}
              >
                บันทึกเหตุและคำนวณแผน
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderCancelModal() {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}
        onClick={() => setShowCancelModal(false)}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: 480,
            background: '#ffffff',
            borderRadius: 12,
            padding: '20px 24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f2a5c', marginBottom: 8 }}>
            ยกเลิก INC-2026-000015 เพราะแจ้งผิด?
          </h2>
          <div style={{ fontSize: 12.5, color: '#475569', lineHeight: '18px', marginBottom: 12 }}>
            คำขอที่ยังไม่มีผู้ยืนยัน 2 รายการจะถูกยกเลิกทันที · ของที่ยืนยันแล้ว 3 รายการจะถูกส่งคืนผู้ให้ยืม · ชุดที่จัดเสร็จแล้วยังคงอยู่ในคลังเป็นชุดพร้อมใช้
          </div>
          <textarea
            rows={3}
            placeholder="เหตุผล (จำเป็น)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12.5,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="btn btn-s"
              onClick={() => setShowCancelModal(false)}
            >
              ไม่ยกเลิก
            </button>
            {mayWrite && (
              <button
                type="button"
                className="btn btn-p"
                style={{ background: '#b91c1c', border: 'none', fontWeight: 600 }}
                onClick={() => {
                  setShowCancelModal(false);
                  setScenario('s7');
                }}
              >
                ยืนยันยกเลิกเหตุ
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Scenario Switcher Bar (For Testing S1–S7) ─────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>จำลองสถานะพิเศษ (S1–S7):</span>
        {(['normal', 's1', 's2', 's3', 's4', 's5', 's6', 's7'] as Scenario[]).map((s) => (
          <button
            key={s}
            type="button"
            className="btn btn-sm"
            style={{
              height: 24,
              fontSize: 11,
              padding: '0 8px',
              background: scenario === s ? '#2563eb' : '#ffffff',
              color: scenario === s ? '#ffffff' : '#334155',
              border: scenario === s ? '1px solid #2563eb' : '1px solid #cbd5e1',
              fontWeight: scenario === s ? 600 : 400,
            }}
            onClick={() => {
              setScenario(s);
              if (s === 's6') setShowCancelModal(true);
            }}
          >
            {s === 'normal' ? 'เหตุปกติ' : s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ─── Breadcrumb ────────────────────────────────────────────── */}
      <nav
        style={{
          fontSize: 12.5,
          color: '#64748b',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12.5, color: '#2563eb' }}>
          หน้าหลัก
        </a>
        <Icon name="chev" className="ic12" style={{ transform: 'rotate(-90deg)', color: '#94a3b8' }} />
        <span style={{ color: '#64748b' }}>เหตุฉุกเฉิน</span>
      </nav>

      {!mayWrite && (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, padding: '10px 16px', fontSize: 13, lineHeight: '19px', color: '#0f2a5c' }}
        >
          <Icon name="eye" style={{ color: '#1d4ed8' }} />
          <span>
            <b style={{ fontWeight: 600 }}>ดูอย่างเดียว</b> · ดูเหตุ แผน และสถานะคำขอได้ การบันทึกเหตุ แก้แผน อนุมัติ และส่งคำขอยืมเร่งด่วนทำโดย ER
          </span>
        </div>
      )}

      {/* ─── S1 Banner: ผู้ป่วยถึงแล้ว (ETA หมด · PATIENTS_ARRIVED) ── */}
      {scenario === 's1' && (
        <div
          style={{
            background: '#b91c1c',
            color: '#ffffff',
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="tri" className="ic18" style={{ color: '#ffffff', flex: 'none' }} />
            <div style={{ fontSize: 13, lineHeight: '19px', fontWeight: 500 }}>
              ผู้ป่วยถึงโรงพยาบาลแล้ว · คำขอที่ยังไม่มีผู้ยืนยันใช้เวลารอ 1 นาที · ของที่ยืนยันแล้ว 2 รายการยังอยู่ระหว่างทาง (Intubation Set ถึง 19:44, Tranexamic acid ถึงราว 19:50)
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: '#ffffff',
              color: '#b91c1c',
              border: 'none',
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 14px',
              flex: 'none',
            }}
            onClick={() => setActiveTab('borrow')}
          >
            ดูของที่ยังไม่ถึง
          </button>
        </div>
      )}

      {/* ─── S2 Banner: หา ETA ไม่ได้ (ETA_UNAVAILABLE) ─────────────── */}
      {scenario === 's2' && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 500px' }}>
            <Icon name="tri" className="ic18" style={{ color: '#ea580c', flex: 'none' }} />
            <div style={{ fontSize: 12.5, color: '#9a3412', lineHeight: '18px' }}>
              ไม่สามารถคำนวณ ETA — ใช้วิทยุสื่อสาร · บริการเดินทางไม่ตอบกลับใน 3 วินาที (ลองซ้ำแล้ว) และไม่มี ETA จากหน่วยกู้ภัย · ระบบคิดผู้ให้ยืมตามเวลาเดินทางไม่ได้ ให้เลือกการโทรศัพท์/วิทยุ · เวลาเฉลี่ย 3/5 นาที/ครั้ง · แจ้ง ER และเภสัชกรแล้ว
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <span style={{ fontSize: 12, color: '#9a3412', fontWeight: 600 }}>ใส่ ETA เอง</span>
            <input
              type="text"
              placeholder=""
              value={customEta}
              disabled={!mayWrite}
              onChange={(e) => setCustomEta(e.target.value)}
              style={{
                width: 50,
                height: 30,
                border: '1px solid #fdba74',
                borderRadius: 6,
                padding: '0 6px',
                textAlign: 'center',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
            <span style={{ fontSize: 12, color: '#9a3412' }}>นาที</span>
            <button
              type="button"
              className="btn btn-p btn-sm"
              style={{ height: 30, fontSize: 12 }}
              disabled={!mayWrite}
              title={mayWrite ? undefined : writeHint}
              onClick={() => alert('บันทึก ETA แล้ว')}
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

      {/* ─── S3 Card: ทุกโรงพยาบาลปฏิเสธ ──────────────────────────── */}
      {scenario === 's3' && (
        <div
          style={{
            background: '#ffffff',
            border: '1.5px solid #ef4444',
            borderRadius: 10,
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
            ไม่มีโรงพยาบาลใดให้ Tranexamic acid ได้
          </div>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12 }}>
            รพ.พระสมุทรเจดีย์ฯ ปฏิเสธ · รพ.บางพลี หมดเวลา · รพ.บางเสาธง ปฏิเสธ · ยังขาด 8 AMP · แจ้งหัวหน้าเวร ER และเภสัชกรแล้ว
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-p btn-sm"
              disabled={!mayWrite}
              title={mayWrite ? undefined : writeHint}
            >
              เพิ่มผู้ให้ยืมเอง
            </button>
            <button type="button" className="btn btn-s btn-sm">
              โทรคลังเขต
            </button>
            <button
              type="button"
              className="btn btn-g btn-sm"
              onClick={() => setScenario('normal')}
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      {/* ─── S5 Card: ชุดที่ยังไม่มีสูตร (NO_RECIPE) ───────────────── */}
      {scenario === 's5' && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 10,
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Burn Kit</span>
              <span className="badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', height: 18, fontSize: 10.5 }}>
                NO_RECIPE
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>ประมาณการ 6</div>
          </div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: '18px' }}>
            ยังไม่มีสูตรส่วนประกอบของชุดนี้ ระบบจัดกระจายและเช็คสต็อกให้ไม่ได้ · จัดการเองโดยเภสัชกร หรือเพิ่มสูตรในหน้าตั้งค่าชุด (ต้องนำเข้าเข้าทางการคลังอนุมัติ)
          </div>
        </div>
      )}

      {/* ─── Page Heading ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: '#0f2a5c',
              lineHeight: '32px',
            }}
          >
            เหตุฉุกเฉินหมู่{' '}
            <span style={{ fontSize: 16, fontWeight: 400, color: '#94a3b8' }}>
              / Incident console
            </span>
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 12,
              color: '#64748b',
              lineHeight: '18px',
            }}
          >
            รพ.สมุทรปราการ · ข้อมูล ณ 19:31 น. · ทุกขั้นตอนต้องให้เจ้าหน้าที่ตรวจและยืนยัน · Agent เลือกชุดได้ แต่จำนวนทั้งหมดคำนวณโดยระบบ
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-s btn-sm">
            <Icon name="history" className="ic14" />
            ประวัติ
          </button>
          {mayWrite && (
            <button className="btn btn-g btn-sm" onClick={() => setShowCancelModal(true)}>
              ยกเลิกเหตุ (แจ้งผิด)
            </button>
          )}
          {mayWrite && (
            <button
              className="btn btn-sm"
              style={{
                background: '#b91c1c',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
              }}
              onClick={() => setShowIntakeModal(true)}
            >
              <Icon name="siren" className="ic14" />
              + แจ้งเหตุใหม่
            </button>
          )}
        </div>
      </div>

      {/* ─── Incident Pills Selector ───────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {INCIDENT_LIST.map((inc) => (
          <div
            key={inc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12.5,
              fontWeight: inc.active ? 600 : 400,
              background: inc.active ? '#ffffff' : '#f8fafc',
              border: inc.active ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
              color: inc.active ? '#0f2a5c' : '#64748b',
              boxShadow: inc.active ? '0 1px 3px rgba(37,99,235,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'Inter, monospace', fontWeight: 600 }}>{inc.id}</span>
            <span className={`badge ${inc.statusCls}`} style={{ height: 18, fontSize: 11, padding: '0 6px' }}>
              {inc.status}
            </span>
            <span>{inc.label}</span>
          </div>
        ))}
      </div>

      {/* ─── Main Incident Banner / Card ───────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        {/* Left Side: Detail & Quote */}
        <div style={{ flex: '1 1 450px', minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontFamily: 'Inter, monospace', fontSize: 13, fontWeight: 700, color: '#0f2a5c' }}>
              {INCIDENT_HEADER.id}
            </span>
            <span className="badge st-pending">
              <Icon name="siren" className="ic12" />
              {INCIDENT_HEADER.statusLabel}
            </span>
            <span className="badge t-grey code">{INCIDENT_HEADER.activePlan}</span>
            <span className="badge st-approved">
              <Icon name="checkc" className="ic12" />
              ไม่พบเหตุดิบ
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f2a5c', lineHeight: '28px' }}>
            {INCIDENT_HEADER.title} · {INCIDENT_HEADER.location}
          </h2>
          <div
            style={{
              margin: '8px 0',
              padding: '6px 12px',
              borderLeft: '3px solid #cbd5e1',
              color: '#334155',
              fontSize: 13,
              lineHeight: '19px',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{INCIDENT_HEADER.quote}&rdquo;
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b' }}>
            แจ้งโดย {INCIDENT_HEADER.reporter} - {INCIDENT_HEADER.reportTime} · ไม่บันทึกข้อมูลระบุตัวผู้ป่วย นับเป็นจำนวนตามระดับคัดแยกเท่านั้น
          </div>
        </div>

        {/* Right Side: 3 Info Boxes */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          {/* Box 1: ETA Timer */}
          <div
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: 10,
              padding: '10px 14px',
              textAlign: 'center',
              minWidth: 150,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: 11.5, color: '#be123c', fontWeight: 600 }}>
              ผู้ป่วยถึงโรงพยาบาลใน
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#e11d48',
                fontFamily: 'Inter, monospace',
                margin: '2px 0',
              }}
            >
              {fmtTime(etaLeft)}
            </div>
            <div style={{ fontSize: 11, color: '#9f1239' }}>ถึงประมาณ {INCIDENT_HEADER.etaTimeStr}</div>
            <div style={{ fontSize: 10, color: '#fda4af', marginTop: 2 }}>{INCIDENT_HEADER.etaDesc}</div>
          </div>

          {/* Box 2: Triage levels */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '10px 14px',
              minWidth: 220,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11.5, color: '#0f2a5c', fontWeight: 600 }}>
                ผู้ป่วยตามระดับคัดแยก
              </span>
              {mayWrite && (
                <button
                  className="link"
                  style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setShowIntakeModal(true)}
                >
                  แก้จำนวนผู้ป่วย
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div
                style={{
                  flex: 1,
                  background: '#fee2e2',
                  borderRadius: 6,
                  padding: '6px 4px',
                  textAlign: 'center',
                  color: '#b91c1c',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 600 }}>แดง</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  {INCIDENT_HEADER.triage.red}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#fef3c7',
                  borderRadius: 6,
                  padding: '6px 4px',
                  textAlign: 'center',
                  color: '#b45309',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 600 }}>เหลือง</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  {INCIDENT_HEADER.triage.yellow}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#dcfce7',
                  borderRadius: 6,
                  padding: '6px 4px',
                  textAlign: 'center',
                  color: '#15803d',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 600 }}>เขียว</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  {INCIDENT_HEADER.triage.green}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  borderRadius: 6,
                  padding: '6px 4px',
                  textAlign: 'center',
                  color: '#334155',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 600 }}>ดำ</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  {INCIDENT_HEADER.triage.black}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              {INCIDENT_HEADER.triage.lastUpdate}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Version Audit Bar ──────────────────────────────────────── */}
      <div
        style={{
          background: '#f1f5f9',
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11.5,
          color: '#475569',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <span
            style={{
              background: '#e2e8f0',
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'Inter, monospace',
              fontWeight: 600,
              color: '#0f2a5c',
              marginRight: 6,
            }}
          >
            {INCIDENT_HEADER.versionHistory.version} · {INCIDENT_HEADER.versionHistory.time}
          </span>
          {INCIDENT_HEADER.versionHistory.summary}
        </div>
        <div style={{ color: '#64748b' }}>{INCIDENT_HEADER.versionHistory.approver}</div>
      </div>

      {/* ─── 4 Sub-Tabs ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          className="tab"
          style={{
            height: 38,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'plan' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            background: 'none',
            color: activeTab === 'plan' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setActiveTab('plan')}
        >
          แผนเวชภัณฑ์
        </button>
        <button
          type="button"
          className="tab"
          style={{
            height: 38,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'borrow' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            background: 'none',
            color: activeTab === 'borrow' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setActiveTab('borrow')}
        >
          <span>ยืมฉุกเฉิน</span>
          <span
            style={{
              fontSize: 11,
              background: '#fee2e2',
              color: '#b91c1c',
              padding: '1px 6px',
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            2
          </span>
        </button>
        <button
          type="button"
          className="tab"
          style={{
            height: 38,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'pack' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            background: 'none',
            color: activeTab === 'pack' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setActiveTab('pack')}
        >
          <span>จัดชุด</span>
          <span
            style={{
              fontSize: 11,
              background: '#fee2e2',
              color: '#b91c1c',
              padding: '1px 6px',
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            2
          </span>
        </button>
        <button
          type="button"
          className="tab"
          style={{
            height: 38,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'summary' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            background: 'none',
            color: activeTab === 'summary' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setActiveTab('summary')}
        >
          สรุปหลังเหตุการณ์
        </button>
      </div>

      {/* ─── TAB 1: แผนเวชภัณฑ์ UI-12 ──────────────────────────────── */}
      {activeTab === 'plan' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Left Column: Preset Kits + Extra Drugs */}
          <div style={{ flex: '1 1 640px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Table 1: Preset Kits */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>
                  ชุดสำเร็จรูป (Preset Kit ต่อผู้ป่วย){' '}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>F-27</span>
                </div>
                <button
                  className="link"
                  style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  ดูรายการหลักกระจายสูตร
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="qt" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th scope="col">ชุด</th>
                      <th scope="col" className="r">ประมาณการ</th>
                      <th scope="col" className="r">ขั้นวิกฤต</th>
                      <th scope="col" className="r">ส่วนเผื่อ</th>
                      <th scope="col" className="r">ชุดพร้อมใช้</th>
                      <th scope="col" style={{ textAlign: 'center' }}>จัดจากของแยก</th>
                      <th scope="col" className="r">ยืมทั้งชุด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kits.map((kit, idx) => (
                      <tr key={kit.name}>
                        <td style={{ minWidth: 170 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{kit.name}</span>
                            <span className={`badge ${kit.typeCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>
                              {kit.type}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{kit.ratio}</div>
                          {kit.warningNote && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '4px 8px',
                                background: '#fffbeb',
                                border: '1px solid #fef3c7',
                                borderRadius: 4,
                                color: '#b45309',
                                fontSize: 11,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Icon name="tri" className="ic12" />
                              <span>{kit.warningNote}</span>
                            </div>
                          )}
                        </td>
                        <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                          {kit.estimated}
                        </td>
                        <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                          {kit.critical}
                        </td>
                        <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                          {kit.reserve}
                        </td>
                        <td className="r" style={{ color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                          <span style={{ fontWeight: 600 }}>{kit.readyInStock}</span>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>มี {kit.readyInStock}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              className="btn btn-s btn-sm"
                              style={{ width: 22, height: 22, padding: 0, minWidth: 22 }}
                              disabled={!mayWrite}
                              title={mayWrite ? undefined : writeHint}
                              onClick={() => updateAssembleQty(idx, -1)}
                            >
                              -
                            </button>
                            <span
                              style={{
                                minWidth: 24,
                                textAlign: 'center',
                                fontWeight: 700,
                                color: '#0f2a5c',
                                fontFamily: 'Inter, sans-serif',
                              }}
                            >
                              {kit.assembleFromParts}
                            </span>
                            <button
                              type="button"
                              className="btn btn-s btn-sm"
                              style={{ width: 22, height: 22, padding: 0, minWidth: 22 }}
                              disabled={!mayWrite}
                              title={mayWrite ? undefined : writeHint}
                              onClick={() => updateAssembleQty(idx, 1)}
                            >
                              +
                            </button>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            จัดได้สูงสุด {kit.maxAssemble}
                          </div>
                        </td>
                        <td className="r">
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: kit.borrowFullKit > 0 ? '#dc2626' : '#15803d',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          >
                            {kit.borrowFullKit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: '16px' }}>
                ลำดับ: ใช้ชุดพร้อมใช้ → จัดเพิ่มจากของแยก (ต้องครบทุกชิ้น) → ยืมทั้งชุด - ขาดไป รพ.ใกล้เคียง · ลดจำนวนจัดเฉพาะ = ยืมเพิ่มอัตโนมัติ · ชุดวิกฤตได้ของแยกก่อน
              </div>
            </div>

            {/* Table 2: Extra Drugs */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
                ยาและเวชภัณฑ์นอกชุด <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>incident_extra_rule</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="qt" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th scope="col">รายการ</th>
                      <th scope="col" className="r">ประมาณการ</th>
                      <th scope="col" className="r">ขั้นวิกฤต</th>
                      <th scope="col" className="r">คงเหลือ</th>
                      <th scope="col" className="r">ยืมเพิ่ม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXTRA_DRUGS.map((drug) => (
                      <tr key={drug.name}>
                        <td style={{ minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{drug.name}</span>
                            <span className={`badge ${drug.typeCls}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>
                              {drug.type}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{drug.rule}</div>
                        </td>
                        <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                          {drug.estimated}
                        </td>
                        <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                          {drug.critical}
                        </td>
                        <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                          {drug.stock}
                        </td>
                        <td className="r">
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: drug.borrowHighlight ? '#dc2626' : '#15803d',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          >
                            {drug.borrowQty}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scope / Exclusions Banner */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 11.5,
                color: '#64748b',
                lineHeight: '18px',
              }}
            >
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                อยู่นอกขอบเขต - แจ้งเตือนเท่านั้น ไม่สร้างรายการในแผน
              </div>
              <div>· FFP / เกล็ดเลือด / cryo → ขอผ่านธนาคารเลือดโดยตรง (BR-F3-032)</div>
              <div>· เครื่องช่วยหายใจ เครื่องกระตุกหัวใจ เครื่องให้สารน้ำ → ครุภัณฑ์ ไม่อยู่ในระบบนี้</div>
              <div>· การเลือกโรงพยาบาลปลายทางของผู้ป่วย → ตามระบบสั่งการ 1669</div>
            </div>
          </div>

          {/* Right Column: Agent Assessment + Summary */}
          <div style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Agent Assessment Card */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f2a5c', fontSize: 13.5 }}>
                  <Icon name="sparkle" className="ic14" style={{ color: '#2563eb' }} />
                  <span>Agent ประเมินเหตุการณ์</span>
                </div>
                <span className="badge st-approved" style={{ height: 20, fontSize: 11 }}>
                  {scenario === 's4' ? 'FALLBACK' : 'มั่นใจสูง · HIGH'}
                </span>
              </div>

              {scenario === 's4' ? (
                /* S4: Agent Fallback View */
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
                    เลือกชุดตามกฎของโรงพยาบาล
                  </div>
                  <div style={{ fontSize: 12, color: '#0369a1', lineHeight: '18px' }}>
                    Agent ไม่ตอบภายใน 8 วินาที ระบบเลือกชุดจาก incident_kit_rule ของ &ldquo;รถโดยสาร / อุบัติเหตุจราจรหมู่&rdquo; แทน · จำนวนยังคำนวณเหมือนเดิม · ไม่มีคำถามเพิ่มเติม
                  </div>
                  <div style={{ fontSize: 11, color: '#0284c7', marginTop: 6 }}>
                    เหตุผลของการตัดสินใจ: FALLBACK · บันทึกใน agent_run แล้ว
                  </div>
                </div>
              ) : (
                /* Normal Agent Assessment View */
                <>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                    F3_T1 · v2 · 19:27 · ใช้เวลา 3.1 วินาที · สถานะ OK
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#334155', lineHeight: '19px' }}>
                    รถโดยสารคว่ำ ผู้บาดเจ็บหลายระบบ มีเลือดออกมากและทางเดินหายใจ จึงเลือก Trauma Set ทุกคน, IV Set สำหรับแดงและเหลือง และ Intubation Set สำหรับผู้ป่วยแดง พร้อมยาห้ามเลือด สารน้ำ และวัคซีนบาดทะยัก
                  </p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: '18px' }}>
                    <li>Intubation Set ขาด 1 ชุด เพราะ stylet แยกมีแค่ 3 ชิ้น</li>
                    <li>Tranexamic acid ต้องยืม 8 amp และเป็นรายการวิกฤต</li>
                    <li>ผู้ป่วยดำ 1 ราย ไม่นำมาคิดชุด</li>
                  </ul>

                  {/* Questions to Staff */}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0f2a5c' }}>คำถามถึงเจ้าหน้าที่</div>

                    {/* Question 1: Burn Kit */}
                    <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                        มีผู้ป่วยแผลไหม้ร่วมด้วยหรือไม่ ถ้ามีควรเพิ่ม Burn Kit
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${burnKitOption === 'none' ? 'btn-p' : 'btn-s'}`}
                          style={{ flex: 1, height: 28, fontSize: 11 }}
                          disabled={!mayWrite}
                          title={mayWrite ? undefined : writeHint}
                          onClick={() => {
                            setBurnKitOption('none');
                            editPlan();
                          }}
                        >
                          ไม่มี
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${burnKitOption === 'add' ? 'btn-p' : 'btn-s'}`}
                          style={{ flex: 1.5, height: 28, fontSize: 11 }}
                          disabled={!mayWrite}
                          title={mayWrite ? undefined : writeHint}
                          onClick={() => {
                            setBurnKitOption('add');
                            editPlan();
                            setScenario('s5'); // Preview S5 no recipe
                          }}
                        >
                          มี - เพิ่ม Burn Kit
                        </button>
                      </div>
                    </div>

                    {/* Question 2: PRC O */}
                    <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                        ต้องการ PRC group O เพิ่มจาก 4 ยูนิตหรือไม่ (สูงสุด 6)
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${prcOption === '4' ? 'btn-p' : 'btn-s'}`}
                          style={{ flex: 1, height: 28, fontSize: 11 }}
                          disabled={!mayWrite}
                          title={mayWrite ? undefined : writeHint}
                          onClick={() => {
                            setPrcOption('4');
                            editPlan();
                          }}
                        >
                          คง 4 ยูนิต
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${prcOption === '6' ? 'btn-p' : 'btn-s'}`}
                          style={{ flex: 1, height: 28, fontSize: 11 }}
                          disabled={!mayWrite}
                          title={mayWrite ? undefined : writeHint}
                          onClick={() => {
                            setPrcOption('6');
                            editPlan();
                          }}
                        >
                          เพิ่มเป็น 6
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10, lineHeight: '14px' }}>
                    Agent เลือกชุดและรายการยาตามลักษณะเหตุการณ์ ตามกฎตั้งต้นของโรงพยาบาล · จำนวนคำนวณโดยระบบ · ถ้าเกิน 8 วินาทีใช้กฎแทน (FALLBACK)
                  </div>
                </>
              )}
            </div>

            {/* Requirement Summary Card */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
                สรุปความต้องการ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>ชุดที่ใช้จากชุดพร้อมใช้</span>
                  <span style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>42</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>ชุดที่จัดเพิ่มจากของแยก</span>
                  <span style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>13</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>ชุดที่จำเป็นต้องยืม</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>3 ชุด</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>รายการนอกชุดที่ต้องยืม</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>
                    2 รายการ + PRC O 4 UNIT
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 8, fontSize: 10.5, color: '#94a3b8', lineHeight: '15px' }}>
                ประมาณการนับทุกระดับคัดแยก · ขั้นวิกฤตนับเฉพาะผู้ป่วยแดง · ส่วนเผื่อคือส่วนเผื่อช่วยจัดทำ · ผู้ป่วยดำไม่นำมาคิดชุด
              </div>

              {/* Plan approval: approveIncidentPlan (ER_STAFF). Edits to v2 create draft v3. */}
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {planApproved ? (
                  <div role="status" style={{ display: 'flex', gap: 8, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: '18px' }}>
                    <Icon name="checkc" className="ic14" style={{ marginTop: 2 }} />
                    <span>อนุมัติแผน v3 แล้ว 19:32 · ส่งคำขอยืมเร่งด่วนส่วนที่เพิ่ม และแจ้งคลังจัดชุดตามแผนใหม่</span>
                  </div>
                ) : planDirty && mayApprovePlan ? (
                  <>
                    <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', lineHeight: '18px' }}>
                      แก้แผนแล้ว · ร่าง v3 ยังไม่ส่ง · คำขอยืมเร่งด่วนส่วนที่เปลี่ยนจะออกหลังอนุมัติ
                    </div>
                    <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} onClick={() => setPlanApproved(true)}>
                      อนุมัติแผน v3 และส่งคำขอยืมเร่งด่วน
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: '18px' }}>
                    แผน {INCIDENT_HEADER.versionHistory.version} {INCIDENT_HEADER.versionHistory.approver}
                    {mayApprovePlan && ' · แก้จำนวนจัดหรือตอบคำถาม Agent แล้วต้องอนุมัติใหม่'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: ยืมฉุกเฉิน UI-11 ─────────────────────────────────── */}
      {activeTab === 'borrow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header Banner */}
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#1e40af', fontSize: 13 }}>
                  BR-2026-000134
                </span>
                <span className="badge ug-critical" style={{ height: 18, fontSize: 10.5 }}>
                  EMERGENCY
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#1e3a8a' }}>
                ส่งพร้อมกันถึง รพ.ที่มีของและมาถึงทัน (เวลาเดินทาง ≤ ETA ที่เหลือ) · รายแรกที่ยืนยันได้จำนวนนั้น ที่เหลือถูกปรับ/ยกเลิกทันที · หมดเวลา: วิกฤต 3 นาที · สนับสนุน 5 นาที ไม่เกิน ETA
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', background: '#ffffff', padding: '4px 10px', borderRadius: 6, border: '1px solid #dbeafe' }}>
              ไม่มีการยืนยันจาก Agent — ผู้ให้ยืมยืนยันเอง
            </div>
          </div>

          {/* List of 5 Emergency Borrow Cards */}
          {EMERGENCY_BORROWS.map((item) => (
            <div key={item.name} className="card" style={{ padding: '14px 18px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                    {item.name} × {item.qty}
                  </span>
                  <span className={`badge ${item.tagCls}`} style={{ height: 18, fontSize: 10.5 }}>
                    {item.tag}
                  </span>
                  {item.extraBadge && (
                    <span className={`badge ${item.extraBadgeCls || 'badge-blue'}`} style={{ height: 18, fontSize: 10.5 }}>
                      {item.extraBadge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.subHeader}</div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="qt" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th scope="col">โรงพยาบาล</th>
                      <th scope="col" style={{ width: 100 }}>เดินทาง</th>
                      <th scope="col" style={{ width: 130 }}>สถานะ</th>
                      <th scope="col">รายละเอียด</th>
                      <th scope="col" className="r" style={{ width: 100 }}>เวลาที่เหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.hospitals.map((hosp) => {
                      const hospLeft = hosp.countdownSecs !== undefined ? Math.max(0, hosp.countdownSecs - tick) : 0;
                      return (
                        <tr key={hosp.hospital}>
                          <td style={{ fontWeight: 600, color: '#0f2a5c', minWidth: 160 }}>
                            {hosp.hospital}
                          </td>
                          <td style={{ color: '#64748b', fontSize: 12 }}>{hosp.eta}</td>
                          <td>
                            <span className={`badge ${hosp.statusCls}`}>
                              {hosp.status === 'pending' && <Icon name="hourglass" className="ic12" />}
                              {hosp.status === 'loaded' && <Icon name="truck" className="ic12" />}
                              {hosp.status === 'in_transit' && <Icon name="truck" className="ic12" />}
                              {hosp.status === 'rejected' && <Icon name="xc" className="ic12" />}
                              {hosp.status === 'partial' && <Icon name="checkc" className="ic12" />}
                              {hosp.statusLabel}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: '#334155' }}>{hosp.detail}</td>
                          <td className="r">
                            {hosp.countdownSecs !== undefined ? (
                              <span
                                style={{
                                  fontFamily: 'Inter, monospace',
                                  fontWeight: 700,
                                  color: '#e11d48',
                                  fontSize: 13,
                                }}
                              >
                                {fmtTime(hospLeft)}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── TAB 3: จัดชุด UI-13 ─────────────────────────────────────── */}
      {activeTab === 'pack' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Left Column: Kit Assemblies */}
          <div style={{ flex: '1 1 600px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {assemblyList.map((kit) => (
              <div key={kit.id} className="card" style={{ padding: '14px 18px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>
                      จัด {kit.name} × {kit.qty} ชุด
                    </span>
                    <span className={`badge ${kit.statusCls}`}>
                      {kit.status === 'done' && <Icon name="checkc" className="ic12" />}
                      {kit.status === 'assembling' && <Icon name="hourglass" className="ic12" />}
                      {kit.statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{kit.meta}</div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="qt" style={{ minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: 40 }}>เลือก</th>
                        <th scope="col">ส่วนประกอบ</th>
                        <th scope="col" className="r">ต่อชุด</th>
                        <th scope="col" className="r">ต้องหยิบ</th>
                        <th scope="col" className="r">ของแยกคงเหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kit.parts.map((part, pIdx) => (
                        <tr key={part.name}>
                          <td>
                            <input
                              type="checkbox"
                              checked={part.checked}
                              onChange={() => togglePartChecked(kit.id, pIdx)}
                              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                          </td>
                          <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 13 }}>{part.name}</td>
                          <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                            {part.perKit}
                          </td>
                          <td className="r" style={{ fontWeight: 600, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                            {part.needed}
                          </td>
                          <td
                            className="r"
                            style={{
                              fontFamily: 'Inter, sans-serif',
                              color: part.stock === 0 ? '#dc2626' : '#64748b',
                              fontWeight: part.stock === 0 ? 700 : 400,
                            }}
                          >
                            {part.stock}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {kit.canConfirm && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="btn btn-p"
                      style={{ fontWeight: 600 }}
                      disabled={!mayWrite}
                      title={mayWrite ? undefined : writeHint}
                      onClick={() => confirmKitAssembly(kit.id)}
                    >
                      ยืนยันจัดชุดเสร็จ
                    </button>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      ระบบตัดของแยกตามสูตรและเพิ่มชุดพร้อมใช้ {kit.qty} ชุด (KIT_PACK)
                    </span>
                  </div>
                )}

                {kit.footerText && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
                    {kit.footerText}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right Column: Stock Overview */}
          <div style={{ flex: '1 1 280px', minWidth: 260 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
                ชุดพร้อมใช้ในคลัง <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>kit_stock</span>
              </div>
              <table className="qt">
                <thead>
                  <tr>
                    <th scope="col">ชุด</th>
                    <th scope="col" className="r">ก่อนเหตุ</th>
                    <th scope="col" className="r">ตอนนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {KIT_STOCK_OVERVIEW.map((item) => (
                    <tr key={item.name}>
                      <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 12.5 }}>{item.name}</td>
                      <td className="r" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                        {item.before}
                      </td>
                      <td className="r" style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>
                        {item.now}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 8, fontSize: 10.5, color: '#94a3b8', lineHeight: '15px' }}>
                สต็อกเปลี่ยนเมื่อยืนยันจัดชุดเท่านั้น (ASM-13) · ถ้าของแยกมีไม่ครบ ระบบไม่ให้ยืนยัน
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: สรุปหลังเหตุการณ์ ─────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Blue Info Banner */}
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 10,
              padding: '12px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="link" className="ic16" style={{ color: '#2563eb', flex: 'none' }} />
              <div style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: '18px' }}>
                ร่างสรุปจากข้อมูลตอนนี้ · บันทึกจำนวนที่ใช้จริงหลังเหตุการณ์สงบ แล้ว &ldquo;ขอปิดเหตุการณ์&rdquo; - ER และเภสัชกรอนุมัติร่วมกัน ระบบจึงสร้างภาระการคืนและเอกสาร
              </div>
            </div>
            <button
              type="button"
              className="btn btn-p"
              style={{ fontWeight: 600, flex: 'none' }}
              disabled={!mayWrite}
              title={mayWrite ? undefined : writeHint}
              onClick={() => setIsClosed(true)}
            >
              {isClosed ? 'ขอปิดเหตุการณ์แล้ว' : 'ขอปิดเหตุการณ์'}
            </button>
          </div>

          {/* Table: Borrow / Return per hospital */}
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 12 }}>
              ยืม-คืนระหว่างโรงพยาบาล
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th scope="col">ผู้ให้ยืม</th>
                    <th scope="col">รายการ</th>
                    <th scope="col">ประเภท</th>
                    <th scope="col" className="r">ได้รับ</th>
                    <th scope="col" style={{ width: 90, textAlign: 'center' }}>ใช้จริง</th>
                    <th scope="col">การคืน</th>
                  </tr>
                </thead>
                <tbody>
                  {returnsList.map((row, idx) => (
                    <tr key={`${row.lender}-${row.item}`}>
                      <td style={{ fontWeight: 600, color: '#0f2a5c', fontSize: 13 }}>{row.lender}</td>
                      <td style={{ fontWeight: 500, color: '#0f2a5c', fontSize: 13 }}>{row.item}</td>
                      <td>
                        <span className="badge t-grey" style={{ height: 18, fontSize: 10.5 }}>
                          {row.category}
                        </span>
                      </td>
                      <td className="r" style={{ color: '#64748b', fontSize: 12.5 }}>
                        {row.received}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="text"
                          value={row.actualUsed}
                          disabled={!mayWrite}
                          onChange={(e) => updateActualUsed(idx, e.target.value)}
                          style={{
                            width: 50,
                            height: 28,
                            textAlign: 'center',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#0f2a5c',
                            fontFamily: 'inherit',
                          }}
                        />
                      </td>
                      <td style={{ fontSize: 12, color: '#334155' }}>{row.returnPolicy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Buttons */}
            <div
              style={{
                marginTop: 16,
                borderTop: '1px solid #e2e8f0',
                paddingTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-s btn-sm"
                  disabled={!mayPrint}
                  title={mayPrint ? undefined : requiredRoleHint('printDocuments')}
                >
                  <Icon name="printer" className="ic14" />
                  สรุปยืม-คืน INCIDENT_REPORT
                </button>
                <button
                  type="button"
                  className="btn btn-s btn-sm"
                  disabled={!mayPrint}
                  title={mayPrint ? undefined : requiredRoleHint('printDocuments')}
                >
                  <Icon name="printer" className="ic14" />
                  สรุปการใช้เวชภัณฑ์ UCEP_REPORT
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                ใช้ประกอบการเบิก พ.ร.บ./UCEP ตามช่องทางปกติของโรงพยาบาล - ระบบไม่ขึ้นเบิกให้
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modals ────────────────────────────────────────────────── */}
      {showIntakeModal && renderIntakeModal()}
      {showCancelModal && renderCancelModal()}
    </div>
  );
}
