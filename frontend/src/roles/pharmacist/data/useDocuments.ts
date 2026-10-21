import { useCallback, useEffect, useState } from 'react';
import { listDocuments } from '../../../services/documentsApi';
import { DOCUMENTS } from './documents';
import type { TransferDoc } from './documents';
import { documentToView } from './documentsLive';

/** Documents of the signed-in hospital from `GET /documents`; falls back to the mock list when the API is unreachable. */
export function useDocuments() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock'; docs: TransferDoc[]; error: string | null }>({ source: 'loading', docs: [], error: null });
  const load = useCallback(async () => {
    try {
      const res = await listDocuments({ limit: 100 });
      setState({ source: 'live', docs: res.items.map(documentToView), error: null });
    } catch (error) {
      setState({ source: 'mock', docs: DOCUMENTS, error: (error as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
