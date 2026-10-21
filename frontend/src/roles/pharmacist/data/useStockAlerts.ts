import { useCallback, useEffect, useState } from 'react';
import { ackAlert, getAlerts, getInventorySummary, snoozeAlert } from '../../../services/alertsApi';
import type { ApiAlert } from '../../../services/alertsApi';
import { getDashboard } from '../../../services/catalogApi';
import { getForecasts } from '../../../services/forecastApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import { ALERT_ROWS } from './stockAlerts';
import type { StockAlertRow, SummaryCard } from './stockAlerts';
import { buildStockAlertRows, buildSummaryCards } from './stockAlertRows';

interface State {
  source: 'loading' | 'live' | 'mock' | 'error';
  rows: StockAlertRow[];
  cards: SummaryCard[] | null;
  versions: Map<string, number>;
  error: string | null;
  forecastMeta: { modelVersion: string | null; originUsed: string | null; mockData?: boolean } | null;
}

/**
 * Rows of the stock-alert screen from `GET /alerts` + `GET /forecasts` + `GET /inventory`. Without the alert API the screen
 * keeps the mock rows; a missing forecast file only means rows come from the alerts alone.
 */
export function useStockAlerts() {
  const [state, setState] = useState<State>({ source: 'loading', rows: [], cards: null, versions: new Map(), error: null, forecastMeta: null });

  const load = useCallback(async () => {
    const [alertsRes, forecastsRes, inventoryRes, dashboardRes] = await Promise.allSettled([getAlerts(200), getForecasts('WEEK'), getInventorySummary(200), getDashboard()]);
    if (alertsRes.status === 'rejected') {
      const f = onLoadFailure('alerts', alertsRes.reason, ALERT_ROWS, []);
      setState({ source: f.source, rows: f.data, cards: null, versions: new Map(), error: f.error, forecastMeta: null });
      return;
    }
    const alerts: ApiAlert[] = alertsRes.value.items;
    const forecasts = forecastsRes.status === 'fulfilled' ? forecastsRes.value.items : [];
    const usable = new Map<string, number>();
    if (inventoryRes.status === 'fulfilled') for (const i of inventoryRes.value.items) usable.set(i.hospitalDrugId, i.usable);
    const nearExpiry = dashboardRes.status === 'fulfilled' ? dashboardRes.value.tiles.nearExpiry.detected : null;
    onLoadSuccess('alerts');
    setState({
      source: 'live',
      rows: buildStockAlertRows(forecasts, usable, alerts),
      cards: buildSummaryCards(alerts, nearExpiry),
      versions: new Map(alerts.map((a) => [a.id, a.version])),
      error: null,
      forecastMeta: forecastsRes.status === 'fulfilled' ? { modelVersion: forecastsRes.value.meta.modelVersion, originUsed: forecastsRes.value.meta.originUsed, mockData: forecastsRes.value.meta.mockData } : null,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ack = useCallback(
    async (alertId: string) => {
      await ackAlert(alertId, state.versions.get(alertId));
      await load();
    },
    [load, state.versions],
  );
  const snooze = useCallback(
    async (alertId: string, reason: string, hours: number) => {
      await snoozeAlert(alertId, reason, hours, state.versions.get(alertId));
      await load();
    },
    [load, state.versions],
  );

  return { ...state, reload: load, ack, snooze };
}
