import { useCallback, useEffect, useState } from 'react';
import { listNearExpiry } from '../../../services/expiryApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { NEAR_EXPIRY_ITEMS } from './nearExpiry';
import type { NearExpiryItem } from './nearExpiry';
import { nearExpiryToView } from './nearExpiryLive';

/** The hospital's near-expiry items from `GET /near-expiry`; fixtures only in demo mode (`?mock=1`). */
export function useNearExpiry() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock' | 'error'; items: NearExpiryItem[]; error: string | null }>({ source: 'loading', items: [], error: null });
  const load = useCallback(async () => {
    try {
      const res = await listNearExpiry();
      onLoadSuccess('near-expiry');
      setState({ source: 'live', items: res.items.map((i) => nearExpiryToView(i)), error: null });
    } catch (error) {
      const f = onLoadFailure('near-expiry', error, NEAR_EXPIRY_ITEMS, []);
      setState({ source: f.source, items: f.data, error: f.error });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
