import { LENDERS } from './stockCheck';
import type { SentBatch } from './incidentStore';

export interface HospitalItem {
  id: string;
  item: string;
  qty: number;
  unit: string;
  urgent: boolean;
  timeoutMin: number;
  sentAt: string;
}

export interface HospitalGroup {
  hospital: string;
  travelMin: number;
  /** Time of the last send to this hospital. */
  sentAt: string;
  items: HospitalItem[];
}

/** Sent requests regrouped as hospital → items asked of it (nearest hospital first). */
export function groupBatchesByHospital(batches: SentBatch[]): HospitalGroup[] {
  const map = new Map<string, HospitalGroup>();
  for (const b of batches) {
    for (const r of b.requests) {
      for (const l of r.lenders) {
        const g = map.get(l.name) ?? { hospital: l.name, travelMin: l.travelMin, sentAt: b.at, items: [] };
        g.sentAt = b.at;
        g.items.push({ id: r.id, item: r.item, qty: r.qty, unit: r.unit, urgent: r.urgent, timeoutMin: r.timeoutMin, sentAt: b.at });
        map.set(l.name, g);
      }
    }
  }
  const order = LENDERS.map((l) => l.name);
  return [...map.values()].sort((a, b) => order.indexOf(a.hospital) - order.indexOf(b.hospital));
}
