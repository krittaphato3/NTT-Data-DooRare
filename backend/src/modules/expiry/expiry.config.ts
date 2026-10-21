import { getSetting } from '../../core/settings.js';
import type { CostModel } from '../../core/formulas/expiry.js';
import type { Db } from '../../db/tx.js';

export interface ExpiryConfig {
  thresholdDaysDefault: number;
  cost: CostModel;
  planApprovalTimeoutH: number;
  autoApprove: boolean;
  repeat: { watchCount: number; recommendCount: number; recommendValueThb: number; dismissDays: number; windowMonths: number };
  keepReviewDays: number;
}

/** `expiry.*` and `network.auto_approve` from `config_setting` (spec config-defaults.yaml as fallback). */
export async function loadExpiryConfig(db: Db, hospitalId?: string | null): Promise<ExpiryConfig> {
  const g = async <T>(key: string, fallback: T) => getSetting<T>(db, key, fallback, hospitalId);
  return {
    thresholdDaysDefault: Number(await g('expiry.threshold_days_default', 180)),
    cost: {
      base: Number(await g('expiry.cost_model_thb.base', 300)),
      perKm: Number(await g('expiry.cost_model_thb.per_km', 8)),
      coldChainSurcharge: Number(await g('expiry.cost_model_thb.cold_chain_surcharge', 500)),
      ratioMax: Number(await g('expiry.transport_cost_ratio_max', 0.2)),
    },
    planApprovalTimeoutH: Number(await g('expiry.plan_approval_timeout_h', 48)),
    autoApprove: Boolean(await g('network.auto_approve', true)),
    repeat: {
      watchCount: Number(await g('expiry.repeat.watch_count', 2)),
      recommendCount: Number(await g('expiry.repeat.recommend_count', 3)),
      recommendValueThb: Number(await g('expiry.repeat.recommend_value_thb', 10000)),
      dismissDays: Number(await g('expiry.repeat.dismiss_days', 90)),
      windowMonths: Number(await g('expiry.repeat.window_months', 12)),
    },
    keepReviewDays: Number(await g('expiry.keep_review_days', 30)),
  };
}
