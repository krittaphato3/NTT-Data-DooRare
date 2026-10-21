import { useCallback, useEffect, useState } from 'react';
import { listPlans, listPool, listRepeatExpiry } from '../../../services/expiryApi';
import type { ApiRepeatFlag } from '../../../services/expiryApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { ALLOCATION_PLANS, POOL_LOTS } from './pool';
import type { AllocationPlan, PoolLot } from './pool';
import { planToView, poolEntryToView } from './poolLive';

/** Pool lots and allocation plans of the region the signed-in hospital belongs to; fixtures only in demo mode. */
export function usePoolAndPlans() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock' | 'error'; pool: PoolLot[]; plans: AllocationPlan[]; error: string | null }>({ source: 'loading', pool: [], plans: [], error: null });
  const load = useCallback(async () => {
    try {
      const [pool, plans] = await Promise.all([listPool(), listPlans()]);
      onLoadSuccess('pool');
      setState({ source: 'live', pool: pool.items.map(poolEntryToView), plans: plans.items.map(planToView), error: null });
    } catch (error) {
      const f = onLoadFailure('pool', error, { pool: POOL_LOTS, plans: ALLOCATION_PLANS }, { pool: [] as PoolLot[], plans: [] as AllocationPlan[] });
      setState({ source: f.source, pool: f.data.pool, plans: f.data.plans, error: f.error });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

/** Repeated-expiry flags (F-25) of the hospital. */
export function useRepeatExpiry() {
  const [flags, setFlags] = useState<ApiRepeatFlag[]>([]);
  const load = useCallback(() => {
    listRepeatExpiry()
      .then((r) => setFlags(r.items))
      .catch(() => setFlags([]));
  }, []);
  useEffect(load, [load]);
  return { flags, reload: load };
}
