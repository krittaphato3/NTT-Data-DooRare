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
  onUneconomical: (label: string) => void;
  onClose: () => void;
  /** Role viewing the drawer; the approval decision is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/** UI-09 Allocation plan review — F-22 feasibility, F-23 economics, approval chain. */
export function AllocationDrawer({ plan: p, decision, onApprove, onUneconomical, onClose, role = 'PHARMACIST' }: AllocationDrawerProps) {
  /* Approving a plan and choosing the uneconomical-exit route both belong to the pharmacist. */
  const mayApprove = mayActFor(role, 'PHARMACIST', 'approveAllocation');
  const approveHint = requiredRoleHint('approveAllocation');
  const meta = planStatusMeta(p.status);
  const [picked, setPicked] = useState<string | null>(null);
  const [withMerge, setWithMerge] = useState(false);

  const effectiveRatio = withMerge && p.merge ? p.merge.newRatioPct : p.costRatioPct;
  const effectiveCost = withMerge && p.merge ? p.merge.newCost : p.transportCost;
  const nowEconomical = effectiveRatio < COST_LIMIT_PCT;
  const canApprove = p.status === 'PENDING_MY_APPROVAL' || p.status === 'AWAITING_APPROVAL';

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
            <b>Agent ประเมินแผน ({p.agent.run})</b>
            <span className={`badge ${p.agent.confidence === 'สูง' ? 't-green' : p.agent.confidence === 'ปานกลาง' ? 't-amber' : 't-red'}`} style={{ marginLeft: 'auto' }}>
              ความมั่นใจ {p.agent.confidence}
            </span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '18px', color: '#1E3A8A' }}>{p.agent.note}</div>
        </div>

        {/* Approvals */}
        <div>
          <h3 className="tr-h3">
            การเห็นชอบ <span className="en">ทุก รพ.ต้องอนุมัติ · A4</span>
          </h3>
          <ul className="pl-appr">
            {p.approvals.map((a) => (
              <li key={a.hospital}>
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
                  <b style={{ fontSize: 13, color: '#0F2A5C' }}>{a.hospital}</b>
                  <span className="sub" style={{ display: 'block' }}>
                    {a.pharmacist}
                    {a.at ? ` · ${a.at}` : ' · ยังไม่ตอบ'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Decision area */}
        {decision ? (
          <div role="status" className="pl-done">
            <Icon name="checkc" className="ic20" style={{ color: '#166534' }} />
            <span>{decision}</span>
          </div>
        ) : !p.economical && p.status === 'PENDING_MY_APPROVAL' ? (
          <div className="pl-decide">
            <h3 className="tr-h3" style={{ color: '#B91C1C' }}>
              ⚠ ค่าขนส่งเกินเกณฑ์ · เจ้าของยาต้องเลือก 1 ใน 4 ทาง <span className="en">FR-F2a-005</span>
            </h3>
            {uneconomicalOptions().map((o) => (
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
            {picked === 'accept' && !nowEconomical && (
              <div className="pl-warn-line">ยืนยันว่ายอมจ่ายค่าขนส่ง {effectiveRatio}% (เกินเกณฑ์ {COST_LIMIT_PCT}%) · บันทึก audit_log</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-p"
                style={{ flex: 1 }}
                disabled={!picked || !mayApprove}
                title={mayApprove ? undefined : approveHint}
                onClick={() => {
                  const o = uneconomicalOptions().find((x) => x.id === picked);
                  onUneconomical(o ? `${o.label}${withMerge ? ' (รวมส่งกับรอบอื่น)' : ''}` : '');
                }}
              >
                ยืนยันตัดสินใจ
              </button>
              {picked === 'accept' && nowEconomical && (
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
            <button
              className="btn btn-p"
              disabled={!mayApprove}
              title={mayApprove ? undefined : approveHint}
              onClick={onApprove}
            >
              <Icon name="check" />
              เห็นชอบแผน
            </button>
            <button className="btn btn-g" disabled={!mayApprove} title={mayApprove ? undefined : approveHint}>
              <Icon name="x" />
              ไม่เห็นชอบ · ขอแก้แผน
            </button>
          </div>
        ) : (
          <div className="sub">
            {p.status === 'NEEDS_DISCUSSION'
              ? 'แผนถูกตีกลับ → เข้าสู่ NEEDS_DISCUSSION · นัดหารือและแก้แผน แล้วส่งเห็นชอบใหม่ (FR-F2a-007)'
              : p.status === 'AUTO_APPROVED'
                ? 'เครือข่ายเดียวกัน → Auto Approve · แก้/ยกเลิกได้ก่อน LOADED (A1)'
                : 'อนุมัติครบแล้ว · รอเอกสาร XC-1 และขั้นตอนขนส่ง UI-14'}
          </div>
        )}
      </div>
    </aside>
  );
}
