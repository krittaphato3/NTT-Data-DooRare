import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
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

export function IncidentConsolePage() {
  const [activeTab, setActiveTab] = useState<'plan' | 'borrow' | 'pack' | 'summary'>('plan');
  const [kits, setKits] = useState(PRESET_KITS);
  const [burnKitOption, setBurnKitOption] = useState<'none' | 'add'>('none');
  const [prcOption, setPrcOption] = useState<'4' | '6'>('4');
  const [assemblyList, setAssemblyList] = useState(KIT_ASSEMBLIES);
  const [returnsList, setReturnsList] = useState(INCIDENT_RETURNS);
  const [isClosed, setIsClosed] = useState(false);

  const tick = useTick();
  const etaLeft = Math.max(0, INCIDENT_HEADER.etaMinutes - tick);

  // Stepper handlers
  const updateAssembleQty = (index: number, delta: number) => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <a href="/" className="link" style={{ fontSize: 12.5, color: '#2563eb' }}>
          หน้าหลัก
        </a>
        <Icon name="chev" className="ic12" style={{ transform: 'rotate(-90deg)', color: '#94a3b8' }} />
        <span style={{ color: '#64748b' }}>เหตุฉุกเฉิน</span>
      </nav>

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
          <button
            className="btn btn-sm"
            style={{
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
            }}
          >
            <Icon name="siren" className="ic14" />
            แจ้งเหตุใหม่
          </button>
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
              <button
                className="link"
                style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                แก้จำนวนผู้ป่วย
              </button>
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
                  มั่นใจสูง · HIGH
                </span>
              </div>
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
                      onClick={() => setBurnKitOption('none')}
                    >
                      ไม่มี
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${burnKitOption === 'add' ? 'btn-p' : 'btn-s'}`}
                      style={{ flex: 1.5, height: 28, fontSize: 11 }}
                      onClick={() => setBurnKitOption('add')}
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
                      onClick={() => setPrcOption('4')}
                    >
                      คง 4 ยูนิต
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${prcOption === '6' ? 'btn-p' : 'btn-s'}`}
                      style={{ flex: 1, height: 28, fontSize: 11 }}
                      onClick={() => setPrcOption('6')}
                    >
                      เพิ่มเป็น 6
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10, lineHeight: '14px' }}>
                Agent เลือกชุดและรายการยาตามลักษณะเหตุการณ์ ตามกฎตั้งต้นของโรงพยาบาล · จำนวนคำนวณโดยระบบ · ถ้าเกิน 8 วินาทีใช้กฎแทน (FALLBACK)
              </div>
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
                <button type="button" className="btn btn-s btn-sm">
                  <Icon name="printer" className="ic14" />
                  สรุปยืม-คืน INCIDENT_REPORT
                </button>
                <button type="button" className="btn btn-s btn-sm">
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
    </div>
  );
}
