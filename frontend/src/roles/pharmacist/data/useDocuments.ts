import { useCallback, useEffect, useState } from 'react';
import { listDocuments } from '../../../services/documentsApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { DOCUMENTS } from './documents';
import type { TransferDoc } from './documents';
import { documentToView } from './documentsLive';

/** Documents of the signed-in hospital from `GET /documents`; falls back to the mock list when the API is unreachable. */
export function useDocuments() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock' | 'error'; docs: TransferDoc[]; error: string | null }>({ source: 'loading', docs: [], error: null });
  const load = useCallback(async () => {
    try {
      const res = await listDocuments({ limit: 100 });
      onLoadSuccess('documents');
      setState({ source: 'live', docs: res.items.map(documentToView), error: null });
    } catch (error) {
      const f = onLoadFailure('documents', error, DOCUMENTS, []);
      setState({ source: f.source, docs: f.data, error: f.error });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
