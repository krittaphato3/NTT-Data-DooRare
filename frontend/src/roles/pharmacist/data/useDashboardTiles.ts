import { useEffect, useState } from 'react';
import { LIVE, useLiveRefresh } from '../../../lib/liveEvents';
import { getDashboard } from '../../../services/catalogApi';
import type { ApiDashboard } from '../../../services/catalogApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';

/** Counters of the signed-in hospital from `GET /dashboard` (null until loaded or when it failed). */
export function useDashboardTiles(): ApiDashboard['tiles'] | null {
  const [tiles, setTiles] = useState<ApiDashboard['tiles'] | null>(null);
  const [rev, setRev] = useState(0);
  useLiveRefresh(LIVE.dashboard, () => setRev((v) => v + 1));
  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((d) => {
        onLoadSuccess('dashboard');
        if (!cancelled) setTiles(d.tiles);
      })
      .catch((e) => {
        onLoadFailure('dashboard', e, null, null);
        if (!cancelled) setTiles(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rev]);
  return tiles;
}
