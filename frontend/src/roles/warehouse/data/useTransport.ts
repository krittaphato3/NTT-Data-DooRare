import { useCallback, useEffect, useState } from 'react';
import { compressImageToBase64 } from '../../../lib/imageCompress';
import { advanceTransportTask, getTransportTasks, uploadTransportPhoto } from '../../../services/transportApi';
import type { ApiTransportTask } from '../../../services/transportApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { AUDIT_HISTORY, SHIPMENTS } from './transport';
import type { Shipment } from './transport';
import { buildHistory, taskToShipment } from './transportLive';

export interface HistoryRow {
  t: string;
  who: string;
  role: string;
  tone: string;
  text: string;
  code: string;
}

export type TransportSource = 'loading' | 'live' | 'mock' | 'error';

interface State {
  source: TransportSource;
  shipments: Shipment[];
  /** Raw API tasks (empty on the mock fallback). */
  tasks: ApiTransportTask[];
  history: HistoryRow[];
  error: string | null;
}

/**
 * Shipments for the transport screens from `GET /transport-tasks` (scoped to the signed-in hospital / driver by the API).
 * If the API cannot be reached the screen keeps working on the mock list and says so.
 */
export function useTransport() {
  const [state, setState] = useState<State>({ source: 'loading', shipments: [], tasks: [], history: [], error: null });

  const load = useCallback(async () => {
    try {
      const res = await getTransportTasks({ limit: 200 });
      onLoadSuccess('transport');
      setState({ source: 'live', shipments: res.items.map((t) => taskToShipment(t)), tasks: res.items, history: buildHistory(res.items), error: null });
    } catch (error) {
      const f = onLoadFailure('transport', error, { shipments: SHIPMENTS, history: AUDIT_HISTORY }, { shipments: [] as Shipment[], history: [] as HistoryRow[] });
      setState({ source: f.source, shipments: f.data.shipments, tasks: [], history: f.data.history, error: f.error });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = useCallback(
    async (s: Shipment, toStatus: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED', extra: { photoKeys?: string[]; qtyReceived?: number; reason?: string } = {}) => {
      if (!s.taskId || s.version === undefined) throw new Error('งานนี้ไม่ได้มาจากระบบจริง');
      await advanceTransportTask(s.taskId, { toStatus, version: s.version, ...extra });
      await load();
    },
    [load],
  );

  const addPhoto = useCallback(async (s: Shipment, file: File): Promise<string> => {
    if (!s.taskId) throw new Error('งานนี้ไม่ได้มาจากระบบจริง');
    const base64 = await compressImageToBase64(file);
    return (await uploadTransportPhoto(s.taskId, base64)).photoKey;
  }, []);

  return { ...state, reload: load, advance, addPhoto };
}
