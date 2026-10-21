import { useCallback, useEffect, useState } from 'react';
import { listBorrowRequests } from '../../../services/borrowApi';
import { BORROW_REQUESTS } from './borrow';
import type { BorrowRequest } from './borrow';
import { borrowRequestToView } from './borrowLive';

/** Our hospital's borrow requests from `GET /borrow-requests`; the mock list when the API is unreachable. */
export function useBorrowRequests() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock'; requests: BorrowRequest[]; error: string | null }>({ source: 'loading', requests: [], error: null });
  const load = useCallback(async () => {
    try {
      const res = await listBorrowRequests({ role: 'borrower' });
      setState({ source: 'live', requests: res.items.map((r) => borrowRequestToView(r)), error: null });
    } catch (error) {
      setState({ source: 'mock', requests: BORROW_REQUESTS, error: (error as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
