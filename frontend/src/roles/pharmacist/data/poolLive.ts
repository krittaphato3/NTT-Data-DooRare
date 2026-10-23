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
  };
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
    agent: { run: p.agentRunId ? p.agentRunId.slice(0, 8) : '—', confidence: 'ปานกลาง', note: 'แผนจากการจับคู่ของ Agent · โค้ดคำนวณ F-22 (ใช้ทันก่อนหมดอายุ) และ F-23 (ค่าขนส่งเทียบมูลค่า) ซ้ำและตรวจก่อนบันทึก' },
    approvals: p.approvals.map((a) => ({
      hospital: short(a.hospital.name),
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
    },
  };
}
