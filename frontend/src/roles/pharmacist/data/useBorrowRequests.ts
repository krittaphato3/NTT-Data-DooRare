import { useCallback, useEffect, useState } from 'react';
import { listBorrowRequests } from '../../../services/borrowApi';
import { BORROW_REQUESTS } from './borrow';
import type { BorrowRequest } from './borrow';
import { borrowRequestToView, returnStateOf } from './borrowLive';
import { listReturnObligations } from '../../../services/returnsApi';

/** Our hospital's borrow requests from `GET /borrow-requests`; the mock list when the API is unreachable. */
export function useBorrowRequests() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock'; requests: BorrowRequest[]; error: string | null }>({ source: 'loading', requests: [], error: null });
  const load = useCallback(async () => {
    try {
      const [res, owed] = await Promise.all([
        listBorrowRequests({ role: 'borrower' }),
        listReturnObligations({ direction: 'owe' }).then((o) => o.items).catch(() => []),
      ]);
      setState({ source: 'live', requests: res.items.map((r) => borrowRequestToView(r, Date.now(), returnStateOf(r.requestNo, owed))), error: null });
    } catch (error) {
      setState({ source: 'mock', requests: BORROW_REQUESTS, error: (error as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
