import { useEffect, useState } from 'react';
import { getHospitalDrugs } from '../../../services/catalogApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { DRUGS } from './drugs';
import type { DrugRow } from './drugs';
import { hospitalDrugToRow } from './drugsLive';

/** The signed-in hospital's drug list from the API; the mock list when it cannot be loaded. */
export function useHospitalDrugs() {
  const [state, setState] = useState<{ source: 'loading' | 'live' | 'mock' | 'error'; drugs: DrugRow[]; error: string | null }>({ source: 'loading', drugs: [], error: null });
  useEffect(() => {
    let cancelled = false;
    getHospitalDrugs({ limit: 200 })
      .then((res) => {
        onLoadSuccess('hospital-drugs');
        if (!cancelled) setState({ source: 'live', drugs: res.items.map(hospitalDrugToRow), error: null });
      })
      .catch((error: Error) => {
        const f = onLoadFailure('hospital-drugs', error, DRUGS, []);
        if (!cancelled) setState({ source: f.source, drugs: f.data, error: f.error });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
