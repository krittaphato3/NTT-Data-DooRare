/** Maps `GET /near-expiry` onto the NearExpiryItem rows of the UI-07 screen. */
import { fmtThaiDate } from '../../warehouse/data/transportLive';
import type { ApiNearExpiry } from '../../../services/expiryApi';
import type { ExpiryHistoryEntry, NearExpiryItem, NearExpiryStatus } from './nearExpiry';

const STATUS_TH: Record<string, string> = { RELEASED_TO_POOL: 'ปล่อยเข้าคลังกลาง', ALLOCATED: 'อยู่ในแผนจัดสรร', TRANSFERRED: 'โอนให้ รพ.อื่นแล้ว', KEPT: 'เก็บไว้ใช้เอง', DISMISSED: 'ปิดรายการ', DETECTED: 'ตรวจพบ' };

function statusOf(i: ApiNearExpiry): NearExpiryStatus {
  switch (i.status) {
    case 'DETECTED': return i.expired ? 'EXPIRED' : 'PENDING';
    case 'RELEASED_TO_POOL': return 'RELEASED';
    default: return i.status;
  }
}

export function nearExpiryToView(i: ApiNearExpiry, now = Date.now()): NearExpiryItem {
  const history: ExpiryHistoryEntry[] = i.history.map((h) => ({ lot: h.lot, text: `ล็อตก่อนหน้า ${h.qty.toLocaleString('en-US')} ${i.drug.unit} · ${STATUS_TH[h.status] ?? h.status}` }));
  return {
    id: i.id,
    uuid: i.id,
    version: i.version,
    ved: i.drug.ved,
    drug: i.drug.name,
    lot: i.lot.lotNo,
    code: i.drug.localCode,
    qty: i.qty,
    unit: i.drug.unit,
    unitPrice: i.unitPrice,
    expiry: fmtThaiDate(i.lot.expiryDate),
    daysLeft: i.daysLeft,
    thresholdDays: i.thresholdDays,
    usagePerDay: Math.round(i.usePerDay * 100) / 100,
    status: statusOf(i),
    ...(i.repeatFlag ? { repeatFlag: i.repeatFlag } : {}),
    detectedAgoDays: Math.max(0, Math.floor((now - new Date(i.detectedAt).getTime()) / 86_400_000)),
    ...(i.releasedQty !== null ? { releasedQty: i.releasedQty } : {}),
    ...(i.plan ? { planId: i.plan.planNo } : {}),
    ...(i.status === 'KEPT' && i.note ? { keptReason: i.note } : {}),
    planActive: Boolean(i.plan) && i.status === 'ALLOCATED',
    note: i.note,
    reviewAfter: i.reviewAfter,
    history,
  };
}
