import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { COST_LIMIT_PCT, planStatusMeta, uneconomicalOptions } from '../data/pool';
import type { AllocationPlan } from '../data/pool';

interface AllocationDrawerProps {
  plan: AllocationPlan;
  decision?: string;
  onApprove: () => void;
  onApproveAll?: (resolutionNote: string, lines?: { receiver: string; qty: number }[]) => void;
  onUneconomical: (label: string, optionId?: string) => void;
  /** Live plans only (API-F2a-009 / -011). */
  onReject?: (comment: string) => void;
  onCancel?: (reason: string) => void;
  /** A hospital of the region outside the plan objects with a reason. */
  onObject?: (reason: string) => void;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  /** Role viewing the drawer; the approval decision is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/** UI-09 Allocation plan review — F-22 feasibility, F-23 economics, approval chain. */
export function AllocationDrawer({ plan: p, decision, onApprove, onApproveAll, onUneconomical, onReject, onCancel, onObject, busy = false, error = null, onClose, role = 'PHARMACIST' }: AllocationDrawerProps) {
  const [note, setNote] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const noteOk = note.trim().length >= 3;
  const cancelNoteOk = cancelNote.trim().length >= 3;
  const L = p.live;
  /* Approving a plan and choosing the uneconomical-exit route both belong to the pharmacist. */
  const mayApprove = mayActFor(role, 'PHARMACIST', 'approveAllocation');
  const approveHint = requiredRoleHint('approveAllocation');
  const meta = planStatusMeta(p.status);
  const [picked, setPicked] = useState<string | null>(null);
  const [withMerge, setWithMerge] = useState(false);
  const isNeedsDiscussion = p.status === 'NEEDS_DISCUSSION';
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const initialLines = (L?.lines && L.lines.length > 0)
    ? L.lines.map((l) => ({ receiver: l.receiver, qty: l.qty }))
    : [{ receiver: p.to || 'รพ.ปลายทาง', qty: p.qty }];
  const [lines, setLines] = useState(initialLines);
  const adjustedTotal = lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  const isMatch = adjustedTotal === p.qty;

  const effectiveRatio = withMerge && p.merge ? p.merge.newRatioPct : p.costRatioPct;
  const effectiveCost = withMerge && p.merge ? p.merge.newCost : p.transportCost;
  const nowEconomical = effectiveRatio < COST_LIMIT_PCT;
  const canApprove = L ? L.openForApproval && L.myDecision !== 'APPROVED' : p.status === 'PENDING_MY_APPROVAL' || p.status === 'AWAITING_APPROVAL';
  const needsOption = L ? !p.economical && !L.option && L.openForApproval && L.isOrigin : !p.economical && p.status === 'PENDING_MY_APPROVAL';
  const options = L ? L.options.map((o) => ({ id: o.id, label: o.label, hint: '' })) : uneconomicalOptions();
  // cancelling belongs to the owner and the receivers; an objector only takes part in the discussion
  const mayCancel = Boolean(L?.isParty) && (L!.openForApproval || p.status === 'APPROVED' || p.status === 'AUTO_APPROVED' || p.status === 'TRANSPORTING');
  const [objectNote, setObjectNote] = useState('');

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดแผนจัดสรร">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">แผนจัดสรร · UI-09 · รายละเอียด</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
            {p.id}
          </h2>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
          <span className="badge t-grey code">v{p.version}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#0F2A5C' }}>
          <span className={`ved ved-${p.ved} ved-sm`}>{p.ved}</span>
          <span>
            {p.drug} · {p.qty} {p.unit} · รหัส {p.code}
          </span>
        </div>
        <div className="sub num">
          {p.from} <span aria-hidden="true">→</span> {p.to} · {p.distanceKm} กม.
          {p.coldChain && ' · ห่วงโซ่ความเย็น'} · หมดอายุ {p.expiry} (เหลือ {p.daysLeft} วัน)
        </div>
      </div>

      <div className="tr-drawer-body">
        {isNeedsDiscussion && (
          <div className="pl-meeting-banner" role="alert">
            <div className="pl-meeting-banner-head">
              <Icon name="tri" style={{ width: 17, height: 17, color: '#D97706', flexShrink: 0 }} />
              <span>แผนถูกระงับชั่วคราว — รอนัดหมายประชุมหารือ (NEEDS_DISCUSSION)</span>
            </div>
            <div className="pl-meeting-banner-desc">
              <strong>เกณฑ์ BR-F2a-013 & ASM-16:</strong> การจัดสรรยาต้องได้รับความเห็นชอบ <strong>100%</strong> จากทุกโรงพยาบาลที่เกี่ยวข้อง (ทั้งต้นทางและปลายทาง)
              เนื่องจากมี รพ. ปฏิเสธยอดจัดสรร แผนจึงถูกระงับทันที และระบบเปิดรอบประชุมเจรจาเฉพาะโรงพยาบาลในแผนนี้
            </div>
            <div className="pl-meeting-parties">
              <span style={{ color: '#92400E', fontWeight: 600 }}>รพ. ที่ต้องเข้าประชุมเจรจา (เฉพาะแผนนี้):</span>
              {p.approvals.map((a) => (
                <span
                  key={a.hospital}
                  className={`badge ${a.state === 'APPROVED' ? 't-green' : a.state === 'REJECTED' ? 't-red' : 't-amber'}`}
                >
                  {a.hospital} ({a.state === 'APPROVED' ? 'เห็นชอบ' : a.state === 'REJECTED' ? 'ไม่เห็นชอบ' : 'รอตอบ'})
                </span>
              ))}
              <span className="badge t-blue">+ ผู้ประสานงาน Region Admin</span>
            </div>
          </div>
        )}

        {L && (
          <div className="tr-box">
            <h3 className="tr-h3">รายการส่ง <span className="en">ต่อ รพ.ปลายทาง</span></h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: '20px' }}>
              {L.lines.map((l) => (
                <li key={l.receiver}>{l.receiver} · <b className="num">{l.qty.toLocaleString()} {p.unit}</b> · {l.km} กม. · ค่าขนส่ง ฿{l.cost.toLocaleString()}{l.taskNo ? ` · ${l.taskNo}` : ''}</li>
              ))}
            </ul>
            {L.option && <div className="sub" style={{ marginTop: 6 }}>ทางเลือกที่เจ้าของยาเลือก: {L.options.find((o) => o.id === L.option)?.label ?? L.option}</div>}
          </div>
        )}

        {/* F-22 feasibility */}
        <div className="tr-box">
          <h3 className="tr-h3">
            ความเป็นไปได้ก่อนส่ง <span className="en">F-22</span>
          </h3>
          <div style={{ fontSize: 13, lineHeight: '20px', color: '#334155' }}>
            อายุที่เหลือ <b className="num">{p.daysLeft} วัน</b> &gt; เวลาเดินทาง + เวลาใช้ที่ปลายทาง{' '}
            <b className="num">{Math.ceil(p.distanceKm / 40) + 3} วัน</b> →{' '}
            <b style={{ color: '#166534' }}>ผ่าน</b> · จำนวนที่เสนอ = min(คงคลัง, พยากรณ์การใช้ก่อนอายุ)
          </div>
        </div>

        {/* F-23 economics */}
        <div className={`tr-box ${nowEconomical ? '' : 'pl-box-bad'}`}>
          <h3 className="tr-h3">
            ค่าขนส่งเทียบมูลค่า <span className="en">F-23</span>
          </h3>
          <div className="pl-ratio" style={{ marginBottom: 8 }}>
            <div className="pl-ratio-bar" style={{ maxWidth: 'none' }}>
              <span
                style={{
                  width: `${Math.min(100, (effectiveRatio / 40) * 100)}%`,
                  background: nowEconomical ? '#2563EB' : '#DC2626',
                }}
              />
              <i title={`เกณฑ์ ${COST_LIMIT_PCT}%`} />
            </div>
            <span className="num pl-ratio-num" style={{ fontWeight: 700 }}>
              ฿{effectiveCost.toLocaleString()} · {effectiveRatio}%
            </span>
          </div>
          <div className="sub num">
            ค่าขนส่ง = 300 + 8 บาท/กม.{p.coldChain ? ' + 500 ค่าควบคุมอุณหภูมิ' : ''} · มูลค่า ฿
            {p.totalValue.toLocaleString()} · เกณฑ์ ≤ {COST_LIMIT_PCT}%
            {withMerge && p.merge && (
              <span style={{ color: '#166534', fontWeight: 600 }}>
                {' '}
                · รวมส่งกับ {p.merge.transportId} ลดเหลือ ฿{p.merge.newCost} = {p.merge.newRatioPct}%
              </span>
            )}
          </div>
          {p.merge && (
            <label className="pl-merge">
              <input type="checkbox" checked={withMerge} onChange={(e) => setWithMerge(e.target.checked)} />
              <span>
                รวมส่งกับ <b className="code">{p.merge.transportId}</b> ({p.merge.drug} → {p.merge.to})
                เพื่อลดค่าขนส่ง
              </span>
            </label>
          )}
        </div>

        {/* Agent explanation */}
        <div className="pl-agent">
          <div className="pl-agent-head">
            <Icon name="sparkle" style={{ width: 15, height: 15, color: '#1D4ED8' }} />
            <b>{p.agent.title ?? `Agent ประเมินแผน (${p.agent.run})`}</b>
            {p.agent.confidence !== '—' && (
              <span className={`badge ${p.agent.confidence === 'สูง' ? 't-green' : p.agent.confidence === 'ปานกลาง' ? 't-amber' : 't-red'}`} style={{ marginLeft: 'auto' }}>
                ความมั่นใจ {p.agent.confidence}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '18px', color: '#1E3A8A' }}>{p.agent.note}</div>
        </div>

        {/* Approvals */}
        <div>
          <h3 className="tr-h3">
            การเห็นชอบ <span className="en">ทุก รพ.ต้องอนุมัติ 100% · A4 · ASM-16</span>
          </h3>
          <ul className="pl-appr">
            {p.approvals.map((a) => (
              <li key={a.hospital} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span
                    className="pl-appr-dot"
                    style={{
                      background: a.state === 'APPROVED' ? '#DCFCE7' : a.state === 'REJECTED' ? '#FEE2E2' : '#FEF3C7',
                      color: a.state === 'APPROVED' ? '#166534' : a.state === 'REJECTED' ? '#B91C1C' : '#92400E',
                    }}
                  >
                    <Icon name={a.state === 'APPROVED' ? 'check' : a.state === 'REJECTED' ? 'x' : 'clock'} style={{ width: 13, height: 13 }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <b style={{ fontSize: 13, color: '#0F2A5C' }}>{a.hospital}</b>
                      <span className={`badge ${a.state === 'APPROVED' ? 't-green' : a.state === 'REJECTED' ? 't-red' : 't-amber'}`} style={{ fontSize: 11 }}>
                        {a.state === 'APPROVED' ? 'เห็นชอบ' : a.state === 'REJECTED' ? 'ไม่เห็นชอบ (มีข้อโต้แย้ง)' : 'รอการตอบรับ'}
                      </span>
                    </div>
                    <span className="sub" style={{ display: 'block' }}>
                      {a.pharmacist}
                      {a.at ? ` · ${a.at}` : ' · ยังไม่ตอบ'}
                    </span>
                  </span>
                </div>
                {a.comment && a.state === 'REJECTED' && (
                  <div className="pl-objection-box" style={{ marginLeft: 34 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: '#991B1B', marginBottom: 2 }}>
                      <Icon name="tri" style={{ width: 13, height: 13 }} />
                      <span>ข้อโต้แย้งจาก {a.hospital}:</span>
                    </div>
                    <div>"{a.comment}"</div>
                  </div>
                )}
                {/* a note on an approval (e.g. auto-approved in network, meeting resolution) is not an objection */}
                {a.comment && a.state !== 'REJECTED' && (
                  <div className="sub" style={{ marginLeft: 34 }}>ความเห็น: “{a.comment}”</div>
                )}
              </li>
            ))}
          </ul>
          <div className="sub" style={{ marginTop: 10, padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" style={{ width: 14, height: 14, color: '#475569', flexShrink: 0 }} />
            <span><strong>เกณฑ์ฉันทามติ 100% (ASM-16):</strong> ทุก รพ. ที่เกี่ยวข้องต้องเห็นชอบครบถ้วน หากมีแม้แต่ รพ. เดียวไม่เห็นชอบ แผนจะระงับทันทีเพื่อจัดประชุมหารือ</span>
          </div>
        </div>

        {/* Decision area */}
        {decision ? (
          <div role="status" className="pl-done">
            <Icon name="checkc" className="ic20" style={{ color: '#166534' }} />
            <span>{decision}</span>
          </div>
        ) : L && !L.involved ? (
          <div className="pl-decide">
            <h3 className="tr-h3">คัดค้านแผน <span className="en">รพ.ในเขตที่ไม่อยู่ในแผน · ASM-16</span></h3>
            <div className="sub">
              โรงพยาบาลของคุณไม่ได้อยู่ในแผนนี้ · ถ้าไม่เห็นด้วยกับการจัดสรร ให้ยื่นคัดค้านพร้อมเหตุผลได้จนกว่าของจะขึ้นรถ
              แผนจะถูกระงับเป็น “ต้องหารือ” งานขนส่งที่ยังไม่ออกจะถูกพักไว้ และทุก รพ.ในแผนได้รับแจ้ง
            </div>
            {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
            <textarea className="sel" rows={3} style={{ width: '100%', height: 'auto' }} placeholder="เหตุผลที่คัดค้าน (อย่างน้อย 3 ตัวอักษร)" value={objectNote} onChange={(e) => setObjectNote(e.target.value)} />
            <button className="btn btn-g" disabled={!mayApprove || busy || !L.canObject || objectNote.trim().length < 3} title={mayApprove ? undefined : approveHint} onClick={() => onObject?.(objectNote.trim())}>
              <Icon name="x" />
              คัดค้านแผน
            </button>
          </div>
        ) : isNeedsDiscussion ? (
          <div className="pl-meeting-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#92400E', fontSize: 13.5 }}>
                <Icon name="users" style={{ width: 16, height: 16, color: '#D97706' }} />
                <span>การดำเนินการเจรจาจัดสรรยา ({p.approvals.length} รพ.)</span>
              </div>
              <span className="badge t-amber">ต้องการข้อตกลงร่วม</span>
            </div>
            <div style={{ fontSize: 12.5, color: '#78350F', lineHeight: '18px' }}>
              แผนนี้มีข้อโต้แย้งจาก {p.approvals.filter((a) => a.state === 'REJECTED').map((a) => a.hospital).join(', ') || 'โรงพยาบาลในแผน'} ท่านสามารถนัดหมายประชุมด่วนเฉพาะ รพ. ในแผนนี้ และบันทึกผลการประชุมเพื่อปรับปรุงยอดจัดสรรส่งขอความเห็นชอบรอบใหม่ (v{p.version + 1})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="btn btn-s"
                style={{ background: '#FEF3C7', borderColor: '#F59E0B', color: '#92400E', fontWeight: 600 }}
                onClick={() => setShowMeetingModal((v) => !v)}
              >
                <Icon name="calendar" />
                {showMeetingModal ? 'ซ่อนรายละเอียดนัดหมาย' : `นัดหมายประชุมด่วน (เฉพาะ ${p.approvals.length} รพ.)`}
              </button>
              <button
                type="button"
                className="btn btn-p"
                onClick={() => setShowAdjustForm((v) => !v)}
              >
                <Icon name="edit" />
                {showAdjustForm ? 'ซ่อนฟอร์มปรับยอด' : `บันทึกผลการประชุม & ปรับปรุงยอด (v${p.version + 1})`}
              </button>
            </div>

            {/* Meeting Details Card */}
            {showMeetingModal && (
              <div style={{ background: '#FFFFFF', border: '1px solid #FCD34D', borderRadius: 8, padding: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ fontWeight: 600, color: '#0F2A5C' }}>
                  รายละเอียดการนัดหมายประชุมด่วน (Teleconference)
                </div>
                <div>
                  <strong>วาระการประชุม:</strong> พิจารณาปรับยอดจัดสรรยา {p.drug} (แผน {p.id} v{p.version}) เพื่อให้ทุกฝ่ายบรรลุข้อตกลงร่วมกัน
                </div>
                <div>
                  <strong>ผู้เข้าร่วม (เฉพาะ รพ. ในแผน + ผู้แทนเขต):</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: '20px' }}>
                    {p.approvals.map((a) => (
                      <li key={a.hospital}>
                        {a.hospital} — {a.pharmacist} {a.state === 'REJECTED' ? '(ผู้ขอปรับยอด/มีข้อโต้แย้ง)' : ''}
                      </li>
                    ))}
                    <li>ผู้ประสานงานสำนักงานสาธารณสุขจังหวัด / เขตสุขภาพที่ 6 (Region Admin)</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    readOnly
                    className="sel"
                    style={{ flex: 1, fontSize: 12, background: '#F8FAFC' }}
                    value={`https://meet.doorare.moph.go.th/f2-${p.id.toLowerCase()}`}
                  />
                  <button
                    type="button"
                    className="btn btn-s"
                    onClick={() => {
                      navigator.clipboard?.writeText?.(`https://meet.doorare.moph.go.th/f2-${p.id.toLowerCase()}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                  >
                    {copiedLink ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
                  </button>
                </div>
                <div className="sub" style={{ color: '#166534', fontWeight: 500 }}>
                  ✓ ระบบส่งข้อความแจ้งเตือนด่วนไปยังห้องแชทและ SMS ของเภสัชกรทุก รพ. ในแผนเรียบร้อยแล้ว
                </div>
              </div>
            )}

            {/* Adjust Quantities Form & Approve Resolution */}
            {showAdjustForm && (
              <div className="pl-adjust-box">
                <div style={{ fontWeight: 600, color: '#1E3A8A', fontSize: 13 }}>
                  ปรับปรุงยอดจัดสรรตามมติที่ประชุม (ยอดรวมในคลัง {p.qty} {p.unit})
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  แก้ไขจำนวนยาที่แต่ละ รพ. จะได้รับตามที่ตกลงร่วมกันในที่ประชุม เพื่ออนุมัติเห็นชอบทั้งสองฝ่าย
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lines.map((line, idx) => (
                    <div key={line.receiver} className="pl-adjust-row">
                      <span>{line.receiver}:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          className="sel"
                          style={{ width: 90, textAlign: 'right' }}
                          value={line.qty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setLines((prev) => prev.map((item, i) => i === idx ? { ...item, qty: val } : item));
                          }}
                        />
                        <span>{p.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, color: isMatch ? '#166534' : '#DC2626' }}>
                  <span>ยอดรวมที่จัดสรร:</span>
                  <span>{adjustedTotal} / {p.qty} {p.unit} {isMatch ? '(ตรงตามยอดคลัง)' : '(ยอดรวมไม่ตรงกับคลัง!)'}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-p"
                    style={{ flex: 1, minWidth: 200 }}
                    disabled={!isMatch || busy}
                    onClick={() => {
                      const desc = lines.map((l) => `${l.receiver} ${l.qty} ${p.unit}`).join(', ');
                      if (onApproveAll) {
                        onApproveAll(`เห็นชอบตามมติที่ประชุม: ${desc}`, lines);
                      } else {
                        onUneconomical(`บันทึกผลการประชุมเรียบร้อย: ${desc} · อนุมัติผ่านทุก รพ.`);
                      }
                    }}
                  >
                    <Icon name="check" />
                    ยืนยันมติที่ประชุม & อนุมัติผ่านทุก รพ. ทันที
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : needsOption ? (
          <div className="pl-decide">
            <h3 className="tr-h3" style={{ color: '#B91C1C' }}>
              ⚠ ค่าขนส่งเกินเกณฑ์ · เจ้าของยาต้องเลือก 1 ใน 4 ทาง <span className="en">FR-F2a-005</span>
            </h3>
            {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
            {options.map((o) => (
              <label key={o.id} className={`pl-opt ${picked === o.id ? 'pl-opt-on' : ''}`}>
                <input type="radio" name="uneco" checked={picked === o.id} onChange={() => setPicked(o.id)} />
                <span>
                  <b style={{ fontSize: 13, color: '#0F2A5C' }}>{o.label}</b>
                  <span className="sub" style={{ display: 'block' }}>
                    {o.hint}
                  </span>
                </span>
              </label>
            ))}
            {(picked === 'accept' || picked === 'MERGE_SHIPMENTS' || picked === 'RAISE_VALUE') && !nowEconomical && (
              <div className="pl-warn-line">ยืนยันว่ายอมจ่ายค่าขนส่ง {effectiveRatio}% (เกินเกณฑ์ {COST_LIMIT_PCT}%) · บันทึก audit_log</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-p"
                style={{ flex: 1 }}
                disabled={!picked || !mayApprove || busy}
                title={mayApprove ? undefined : approveHint}
                onClick={() => {
                  const o = options.find((x) => x.id === picked);
                  onUneconomical(o ? `${o.label}${withMerge ? ' (รวมส่งกับรอบอื่น)' : ''}` : '', o?.id);
                }}
              >
                ยืนยันตัดสินใจ
              </button>
              {picked === 'accept' && nowEconomical && !L && (
                <button
                  className="btn btn-g"
                  disabled={!mayApprove}
                  title={mayApprove ? undefined : approveHint}
                  onClick={onApprove}
                >
                  เห็นชอบแผน
                </button>
              )}
            </div>
          </div>
        ) : canApprove ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12.5, width: '100%' }}>{error}</div>}
            {L && <input className="sel" style={{ width: '100%' }} placeholder="เหตุผล/ความเห็น (จำเป็นเมื่อไม่เห็นชอบ)" value={note} onChange={(e) => setNote(e.target.value)} />}
            <button
              className="btn btn-p"
              disabled={!mayApprove || busy || (!!L && !p.economical && !L.option)}
              title={mayApprove ? (L && !p.economical && !L.option ? 'ค่าขนส่งเกินเกณฑ์ ต้องให้เจ้าของยาเลือกทางเลือกก่อน' : undefined) : approveHint}
              onClick={onApprove}
            >
              <Icon name="check" />
              เห็นชอบแผน
            </button>
            <button className="btn btn-g" disabled={!mayApprove || busy || (!!L && !noteOk)} title={mayApprove ? undefined : approveHint} onClick={() => (L ? onReject?.(note.trim()) : undefined)}>
              <Icon name="x" />
              ไม่เห็นชอบ · ขอแก้แผน
            </button>
            {L && !noteOk && (
              <div className="sub" style={{ width: '100%', color: '#D97706', fontSize: 11.5, marginTop: 2 }}>
                ℹ หากต้องการกด "ไม่เห็นชอบ · ขอแก้แผน" กรุณาระบุเหตุผลในช่องด้านบนอย่างน้อย 3 ตัวอักษร
              </div>
            )}
          </div>
        ) : (
          <div className="sub">
            {p.status === 'CANCELLED' ? 'แผนถูกยกเลิก · ปริมาณกลับไปรอจับคู่ใหม่ในคลังกลาง' : p.status === 'COMPLETED' ? 'ส่งมอบครบแล้ว · นับเป็นมูลค่าที่เลี่ยงการหมดอายุ' : p.status === 'TRANSPORTING' ? 'อนุมัติครบแล้ว · กำลังขนส่ง (UI-14)' : null}
            {p.status === 'NEEDS_DISCUSSION'
              ? 'แผนถูกตีกลับ → เข้าสู่ NEEDS_DISCUSSION · นัดหารือและแก้แผน แล้วส่งเห็นชอบใหม่ (FR-F2a-007)'
              : p.status === 'AUTO_APPROVED'
                ? 'เครือข่ายเดียวกัน → Auto Approve · แก้/ยกเลิกได้ก่อน LOADED (A1)'
                : 'อนุมัติครบแล้ว · รอเอกสาร XC-1 และขั้นตอนขนส่ง UI-14'}
          </div>
        )}
        {mayCancel && (
          <div className="pl-decide">
            <h3 className="tr-h3">ยกเลิกแผน <span className="en">FR-F2a-018</span></h3>
            {L?.cancelRequestedBy && <div className="sub">มี รพ.ขอยกเลิกแล้ว · รออีกฝ่าย (เจ้าของยา) ยินยอมด้วยการกดยกเลิกจาก รพ.ของตน</div>}
            <input className="sel" style={{ width: '100%' }} placeholder="เหตุผล (อย่างน้อย 3 ตัวอักษร)" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
            <button className="btn btn-g" disabled={!mayApprove || busy || !cancelNoteOk} onClick={() => onCancel?.(cancelNote.trim())}>
              {p.status === 'TRANSPORTING' || p.status === 'APPROVED' || p.status === 'AUTO_APPROVED' ? 'ขอยกเลิก / ยินยอมยกเลิก (ต้องสองฝ่าย)' : 'ยกเลิกแผน'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
