import { getSetting } from '../../core/settings.js';
import type { Db } from '../../db/tx.js';
import { DEFAULT_WEIGHTS } from '../../core/formulas/borrow.js';
import type { ScoreWeights } from '../../core/formulas/borrow.js';

export interface BorrowConfig {
  weights: ScoreWeights;
  stockSafetyDays: number;
  reliabilityDefault: number;
  reliabilityWindowMonths: number;
  lotMinRemainingDays: number;
  maxParallel: number;
  stopRatioV: number;
  stopRatioE: number;
  reminderRatio: number;
  timeoutMin: { VERY_URGENT: number; URGENT: number; NORMAL: number };
  urgency: { veryUrgentVDays: number; urgentVDays: number; urgentEDays: number };
  coldBoxHours: number;
  z: { V: number; E: number; D: number };
  agentEnabled: boolean;
}

/** `borrow.*`, `ved.z.*`, `coldchain.*` and `agent.enabled` from `config_setting` (spec config-defaults.yaml as fallback). */
export async function loadBorrowConfig(db: Db, hospitalId?: string | null): Promise<BorrowConfig> {
  const g = <T>(key: string, fallback: T) => getSetting<T>(db, key, fallback, hospitalId);
  const [w1, w2, w3, w4] = await Promise.all([
    g('borrow.score.w_time', DEFAULT_WEIGHTS.time),
    g('borrow.score.w_fulfill', DEFAULT_WEIGHTS.fulfill),
    g('borrow.score.w_stock_safety', DEFAULT_WEIGHTS.stockSafety),
    g('borrow.score.w_reliability', DEFAULT_WEIGHTS.reliability),
  ]);
  return {
    weights: { time: Number(w1), fulfill: Number(w2), stockSafety: Number(w3), reliability: Number(w4) },
    stockSafetyDays: Number(await g('borrow.stock_safety_days', 30)),
    reliabilityDefault: Number(await g('borrow.reliability_default', 0.5)),
    reliabilityWindowMonths: Number(await g('borrow.reliability_window_months', 12)),
    lotMinRemainingDays: Number(await g('borrow.lot_min_remaining_days', 180)),
    maxParallel: Number(await g('borrow.max_parallel', 3)),
    stopRatioV: Number(await g('borrow.stop_ratio_V', 0.9)),
    stopRatioE: Number(await g('borrow.stop_ratio_E', 1)),
    reminderRatio: Number(await g('borrow.reminder_ratio', 0.5)),
    timeoutMin: {
      VERY_URGENT: Number(await g('borrow.timeout_min.very_urgent', 120)),
      URGENT: Number(await g('borrow.timeout_min.urgent', 360)),
      NORMAL: Number(await g('borrow.timeout_min.normal', 2880)),
    },
    urgency: {
      veryUrgentVDays: Number(await g('borrow.urgency.very_urgent_V_days', 2)),
      urgentVDays: Number(await g('borrow.urgency.urgent_V_days', 7)),
      urgentEDays: Number(await g('borrow.urgency.urgent_E_days', 2)),
    },
    coldBoxHours: Number(await g('coldchain.default_box_hours', 6)),
    z: { V: Number(await g('ved.z.V', 1.65)), E: Number(await g('ved.z.E', 1.28)), D: Number(await g('ved.z.D', 0)) },
    agentEnabled: Boolean(await g('agent.enabled', true)),
  };
}
