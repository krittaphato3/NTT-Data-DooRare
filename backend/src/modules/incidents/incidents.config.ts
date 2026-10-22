import { getSetting } from '../../core/settings.js';
import type { Db } from '../../db/tx.js';

export interface EmergencyConfig {
  timeoutCriticalMin: number;
  timeoutSupportiveMin: number;
  locationTimeoutS: number;
  duplicateWindowMin: number;
  duplicateRadiusM: number;
  /** Lenders asked at once when their transit time fits the ETA. */
  maxParallel: number;
  blood: { enabled: boolean; prcOMaxUnits: number; prcOMinRemainingDays: number };
  /** Days a borrowed set / item is expected back (return obligation). */
  returnDays: number;
}

/** `emergency.*` from `config_setting` (spec config-defaults.yaml as fallback; `emergency.max_parallel` is ours, default 5). */
export async function loadEmergencyConfig(db: Db, hospitalId?: string | null): Promise<EmergencyConfig> {
  const g = <T>(key: string, fallback: T) => getSetting<T>(db, key, fallback, hospitalId);
  return {
    timeoutCriticalMin: Number(await g('emergency.timeout_critical_min', 3)),
    timeoutSupportiveMin: Number(await g('emergency.timeout_supportive_min', 5)),
    locationTimeoutS: Number(await g('emergency.location_timeout_s', 3)),
    duplicateWindowMin: Number(await g('emergency.duplicate_window_min', 10)),
    duplicateRadiusM: Number(await g('emergency.duplicate_radius_m', 500)),
    maxParallel: Number(await g('emergency.max_parallel', 5)),
    blood: {
      enabled: Boolean(await g('emergency.blood.enabled', true)),
      prcOMaxUnits: Number(await g('emergency.blood.prc_o_max_units', 6)),
      prcOMinRemainingDays: Number(await g('emergency.blood.prc_o_min_remaining_days', 7)),
    },
    returnDays: Number(await g('return.default_days', 30)),
  };
}
