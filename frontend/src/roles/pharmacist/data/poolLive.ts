/** Maps `GET /pool` and `GET /allocation-plans` onto the PoolLot / AllocationPlan rows of UI-08 / UI-09. */
import { fmtThaiDate, fmtThaiTime } from '../../warehouse/data/transportLive';
import type { ApiPlan, ApiPoolEntry } from '../../../services/expiryApi';
import type { AllocationPlan, PlanStatus, PoolLot } from './pool';

export function poolEntryToView(e: ApiPoolEntry): PoolLot {
  return {
    id: `${e.origin.code} · ${e.lotNo}`,
    drug: e.drug.name,
    code: e.drug.localCode,
    qty: e.qtyReleased,
    unit: e.drug.unit,
    value: e.valueThb,
    expiry: fmtThaiDate(e.expiryDate),
    daysLeft: e.daysLeft,
    from: e.origin.name,
    releasedBy: e.releasedBy ?? '—',
    releasedAt: fmtThaiTime(e.releasedAt),
    live: { uuid: e.id, originId: e.origin.id, qtyAvailable: e.qtyAvailable, status: e.status, planNo: e.planNo },
  };
}

const CONFIDENCE: Record<string, AllocationPlan['agent']['confidence']> = { HIGH: 'สูง', MEDIUM: 'ปานกลาง', LOW: 'ต่ำ' };

/** The plan's origin: the allocation agent's run (or its F-22 fallback), or a split the owner pharmacist wrote by hand. */
function agentView(p: ApiPlan): AllocationPlan['agent'] {
  const run = p.agentRunId ? p.agentRunId.slice(0, 8) : '—';
  if (!p.agentRunId) return { run, confidence: '—', title: 'แผนที่เภสัชกรสร้างเอง', note: 'เภสัชกร รพ.เจ้าของยากำหนดผู้รับและจำนวนเอง · โค้ดตรวจ F-22 (ใช้ทันก่อนหมดอายุ) และ F-23 (ค่าขนส่งเทียบมูลค่า) ก่อนบันทึก' };
  if (!p.agent || p.agent.status === 'OK') {
    return { run, confidence: CONFIDENCE[p.agent?.confidence ?? ''] ?? 'ปานกลาง', title: `Agent เสนอแผน (${p.agent?.model ?? run})`, note: p.agent?.summary ?? 'แผนจากการจับคู่ของ Agent · โค้ดคำนวณ F-22 และ F-23 ซ้ำและตรวจก่อนบันทึก' };
  }
  return { run, confidence: '—', title: `ใช้สูตร F-22 แทน Agent (${p.agent.status})`, note: `${p.agent.summary ?? 'Agent เสนอแผนที่ใช้ไม่ได้'} · แบ่งให้ รพ.ที่สต็อกเหลือน้อยวันที่สุดก่อน (F-22)` };
}

function statusOf(p: ApiPlan): PlanStatus {
  switch (p.status) {
    case 'READY_FOR_APPROVAL': return p.myDecision === 'PENDING' ? 'PENDING_MY_APPROVAL' : 'AWAITING_APPROVAL';
    case 'DRAFT': return 'AWAITING_APPROVAL';
    default: return p.status;
  }
}

const short = (name: string) => name.replace('โรงพยาบาล', 'รพ.');

export function planToView(p: ApiPlan): AllocationPlan {
  const km = p.lines.length ? Math.max(...p.lines.map((l) => l.distanceKm)) : 0;
  return {
    id: p.planNo,
    version: p.version,
    status: statusOf(p),
    drug: p.drug.name,
    code: p.drug.localCode,
    ved: p.drug.ved,
    qty: p.qty,
    unit: p.drug.unit,
    unitValue: p.unitValue,
    totalValue: p.totalValueThb,
    distanceKm: km,
    coldChain: p.drug.coldChain,
    transportCost: p.transportCostThb,
    costRatioPct: p.costRatioPct ?? 0,
    economical: p.economical,
    from: short(p.origin.name),
    to: p.lines.map((l) => short(l.receiver.name)).join(', ') || '—',
    lotNo: p.lot.lotNo,
    expiry: fmtThaiDate(p.lot.expiryDate),
    daysLeft: p.lot.daysLeft,
    agent: agentView(p),
    approvals: p.approvals.map((a) => ({
      hospital: `${short(a.hospital.name)}${a.kind === 'OBJECTOR' ? ' · ผู้คัดค้าน' : ''}`,
      pharmacist: a.decidedBy ?? '—',
      state: a.decision === 'PENDING' ? 'WAITING' : a.decision,
      ...(a.decidedAt ? { at: fmtThaiTime(a.decidedAt) } : {}),
      ...(a.comment ? { comment: a.comment } : {}),
    })),
    dueAt: p.approvalDeadline && p.status === 'READY_FOR_APPROVAL' ? `ภายใน ${fmtThaiTime(p.approvalDeadline)}` : p.status === 'NEEDS_DISCUSSION' ? 'รอหารือ' : '',
    live: {
      uuid: p.id,
      myDecision: p.myDecision,
      isOrigin: p.isOrigin,
      option: p.option,
      options: p.options,
      cancelRequestedBy: p.cancelRequestedBy,
      lines: p.lines.map((l) => ({ receiver: short(l.receiver.name), qty: l.qty, km: l.distanceKm, cost: l.transportCostThb, taskNo: l.task?.taskNo ?? null })),
      openForApproval: p.status === 'READY_FOR_APPROVAL' || p.status === 'NEEDS_DISCUSSION',
      involved: p.involved,
      isParty: p.myKind === 'ORIGIN' || p.myKind === 'RECEIVER',
      canObject: p.canObject,
    },
  };
}
