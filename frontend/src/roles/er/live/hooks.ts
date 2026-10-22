import { useCallback, useEffect, useRef, useState } from 'react';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import {
  getIncident, getKitStock, listEmergencyLegs, listIncidents, listKitTasks,
} from '../../../services/incidentApi';
import type { ApiEmergencyLeg, ApiIncidentDetail, ApiIncidentSummary, ApiKitStockRow, ApiKitTask } from '../../../services/incidentApi';

type Source = 'loading' | 'live' | 'mock' | 'error';

/** Generic loader for the F3 screens: loads on mount, reloads on demand and every `pollMs` while the tab is visible. */
function useLoaded<T>(key: string, load: () => Promise<T>, empty: T, pollMs: number, deps: unknown[]) {
  const [state, setState] = useState<{ data: T; source: Source; error: string | null }>({ data: empty, source: 'loading', error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useCallback(async () => {
    try {
      const data = await loadRef.current();
      onLoadSuccess(key);
      setState({ data, source: 'live', error: null });
    } catch (error) {
      const f = onLoadFailure(key, error, empty, empty);
      setState((prev) => ({ data: prev.source === 'live' ? prev.data : f.data, source: f.source, error: f.error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run(); }, [run, ...deps]);
  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void run(); }, pollMs);
    return () => clearInterval(t);
  }, [run, pollMs]);
  return { ...state, reload: run };
}

const NONE: never[] = [];

/** Incidents of the signed-in hospital (the API scopes them). */
export function useIncidentList(group: 'active' | 'closed' | 'cancelled' | 'all' = 'all', pollMs = 15000) {
  const r = useLoaded<ApiIncidentSummary[]>('incidents', async () => (await listIncidents(group)).items, NONE, pollMs, [group]);
  return { items: r.data, source: r.source, error: r.error, reload: r.reload };
}

/** One incident with its plan, borrow lines, pack tasks, usage and history. */
export function useIncident(id: string | undefined, pollMs = 10000) {
  const r = useLoaded<ApiIncidentDetail | null>('incident', async () => (id ? (await getIncident(id)).data : null), null, id ? pollMs : 0, [id]);
  return { incident: r.data, source: r.source, error: r.error, reload: r.reload };
}

export function useKitStockLive() {
  const r = useLoaded<ApiKitStockRow[]>('kit-stock', async () => (await getKitStock()).items, NONE, 0, []);
  return { rows: r.data, source: r.source, error: r.error, reload: r.reload };
}

/** Pack tasks of the hospital (optionally of one incident). */
export function useKitTasks(incidentId?: string, pollMs = 15000) {
  const r = useLoaded<ApiKitTask[]>('kit-tasks', async () => (await listKitTasks(incidentId)).items, NONE, pollMs, [incidentId]);
  return { tasks: r.data, source: r.source, error: r.error, reload: r.reload };
}

/** Urgent requests other hospitals sent to this hospital (the lender's inbox). */
export function useEmergencyInbox(status: 'pending' | 'confirmed' | 'done' | 'declined' | 'all' = 'all', pollMs = 8000) {
  const r = useLoaded<ApiEmergencyLeg[]>('emergency-inbox', async () => (await listEmergencyLegs(status)).items, NONE, pollMs, [status]);
  return { legs: r.data, source: r.source, error: r.error, reload: r.reload };
}
