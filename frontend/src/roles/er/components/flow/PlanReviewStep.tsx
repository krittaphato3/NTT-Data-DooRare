import { Icon } from '../../../../components/common/icons';
import type { IntakeValues } from '../../data/intake';
import { EXTRA_DRUGS } from '../../data/incident';
import type { PresetKitRow } from '../../data/incident';
import type { IncidentAccess } from '../../data/access';
import { AgentAssessmentCard } from '../AgentAssessmentCard';
import { ExtraDrugsTable } from '../ExtraDrugsTable';
import { PlanScopeNote } from '../PlanScopeNote';
import { PresetKitTable } from '../PresetKitTable';

interface PlanReviewStepProps {
  /** False while the Agent is still estimating. */
  ready: boolean;
  intake: IntakeValues;
  kits: PresetKitRow[];
  edited: boolean;
  burnKitOption: 'none' | 'add';
  prcOption: '4' | '6';
  access: IncidentAccess;
  onAssembleChange: (index: number, delta: number) => void;
  onBurnKit: (o: 'none' | 'add') => void;
  onPrc: (o: '4' | '6') => void;
  onBack: () => void;
  onConfirm: () => void;
}

/** Step 2: the Agent's proposal (kits and extra items) for staff to check and adjust. */
export function PlanReviewStep(p: PlanReviewStepProps) {
  if (!p.ready) {
    return (
      <div className="card" style={{ padding: '40px 20px', textAlign: 'center' }} role="status">
        <Icon name="sparkle" className="ic24" style={{ color: '#2563eb' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a5c', marginTop: 8 }}>Agent กำลังประเมินเวชภัณฑ์ที่ต้องใช้…</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>เลือกชุดสำเร็จรูปและรายการนอกชุดตามประเภทเหตุและจำนวนผู้ป่วย (ไม่เกิน 8 วินาที)</div>
      </div>
    );
  }

  const total = ['red', 'yellow', 'green', 'black', 'unknown'].reduce((n, k) => n + (Number(p.intake[k as keyof IntakeValues]) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#1e3a8a', lineHeight: '19px' }}>
        <b>Agent เสนอแผนจากเหตุ “{p.intake.category}” · {p.intake.location}</b> · ผู้ป่วย {total} ราย (แดง {p.intake.red} · เหลือง {p.intake.yellow} · เขียว {p.intake.green}
        {Number(p.intake.unknown) > 0 ? ` · ไม่ทราบระดับ ${p.intake.unknown}` : ''}). ตรวจรายการด้านล่าง ปรับจำนวนที่ต้องการได้ แล้วกดยืนยันเพื่อตรวจสต็อก
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PresetKitTable kits={p.kits} access={p.access} onAssembleChange={p.onAssembleChange} />
          <ExtraDrugsTable />
          <PlanScopeNote />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <AgentAssessmentCard
            scenario="normal"
            burnKitOption={p.burnKitOption}
            prcOption={p.prcOption}
            access={p.access}
            onBurnKit={p.onBurnKit}
            onPrc={p.onPrc}
          />
        </div>
      </div>

      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: p.edited ? '#92400e' : '#475569' }}>
          {p.edited ? 'แก้แผนแล้ว · ร่าง v3 รอการยืนยัน' : `Agent เสนอ ${EXTRA_DRUGS.length + p.kits.length} รายการ · ยังไม่ได้แก้ไข`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-s" onClick={p.onBack}>
            ← แก้ข้อมูลเหตุ
          </button>
          <button
            type="button"
            className="btn btn-p"
            style={{ fontWeight: 600 }}
            disabled={!p.access.mayApprovePlan}
            title={p.access.mayApprovePlan ? undefined : p.access.writeHint}
            onClick={p.onConfirm}
          >
            ยืนยันแผน และตรวจสต็อก →
          </button>
        </div>
      </div>
    </div>
  );
}
