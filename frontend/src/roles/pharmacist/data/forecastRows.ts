/** Maps `GET /forecasts` items onto the stock-alert table row shape (UI-02). Forecast columns only. */
import type { ForecastItem } from '../../../services/forecastApi';
import type { Abc, ForecastMethod, StockAlertRow } from './stockAlerts';

const ABC_VALUES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'V'];

const METHOD_MAP: Record<string, ForecastMethod> = {
  QUANTILE_LGBM: 'QUANTILE_LGBM',
  FALLBACK_CLASSICAL: 'MA_ES',
  MA_ES: 'MA_ES',
  COLD_START: 'COLD_START',
  MIN_MAX: 'MIN_MAX',
};

const round = (n: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

export function forecastToRow(item: ForecastItem): StockAlertRow {
  const onHand = item.stockOnHand ?? 0;
  const dailyUse = item.uPerDay ?? 0;
  const predict = item.p50 === null ? null : round(item.p50);
  const totalTarget = item.totalTarget;
  const lowConfidence = item.flags.includes('LOW_CONFIDENCE');

  // Display hint only (no alert is raised: the alert queue needs GET /alerts, not built yet).
  let note = 'คงเหลือเพียงพอเมื่อเทียบกับ Total Target';
  let noteTone: StockAlertRow['noteTone'] = 'ok';
  if (predict !== null && onHand < predict) {
    note = `คงเหลือ ${onHand.toLocaleString('en-US')} ต่ำกว่า Predict ${predict.toLocaleString('en-US')}`;
    noteTone = 'crit';
  } else if (totalTarget !== null && onHand < totalTarget) {
    note = `คงเหลือต่ำกว่า Total Target ${totalTarget.toLocaleString('en-US')}`;
    noteTone = 'warn';
  }

  return {
    id: item.hospitalDrugId,
    drug: item.itemName ?? item.itemCode ?? item.hospitalDrugId,
    code: item.itemCode ?? '—',
    ved: item.ved ?? 'D',
    abc: (item.abc && ABC_VALUES.includes(item.abc) ? item.abc : '–') as Abc,
    onHand,
    unit: item.baseUnit ?? '—',
    daysLeft: dailyUse > 0 ? round(onHand / dailyUse, 2) : 999,
    dailyUse: round(dailyUse, 2),
    predict,
    totalTarget,
    note,
    noteTone,
    method: item.method ? (METHOD_MAP[item.method] ?? null) : null,
    methodNote: lowConfidence ? 'LOW_CONFIDENCE' : 'ปกติ',
    lowConfidence,
    alert: null,
  };
}
