import { useCallback, useEffect, useState } from 'react';
import { listLenderQueue } from '../../../services/borrowApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { BORROW_REQUESTS } from './lender';
import type { BorrowRequest, LendableStock, LotOption } from './lender';
import { lenderItemToView } from './lenderLive';

/** Requests asked of our hospital from `GET /lender-queue`; the mock list when the API is unreachable. */
export function useLenderQueue() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock' | 'error'; requests: BorrowRequest[]; lots: Record<string, LotOption[]>; stock: Record<string, LendableStock | null>; error: string | null }>({
    source: 'loading', requests: [], lots: {}, stock: {}, error: null,
  });
  const load = useCallback(async () => {
    try {
      const res = await listLenderQueue();
      const views = res.items.map((i) => lenderItemToView(i));
      onLoadSuccess('lender-queue');
      setState({
        source: 'live',
        requests: views.map((v) => v.request),
        lots: Object.fromEntries(views.map((v) => [v.request.legId!, v.lots])),
        stock: Object.fromEntries(views.map((v) => [v.request.legId!, v.stock])),
        error: null,
      });
    } catch (error) {
      const f = onLoadFailure('lender-queue', error, BORROW_REQUESTS, []);
      setState({ source: f.source, requests: f.data, lots: {}, stock: {}, error: f.error });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
