/** Values of the incident intake form (UI-11). All counts are strings so the inputs stay controlled while empty. */
export interface IntakeValues {
  category: string;
  location: string;
  detail: string;
  red: string;
  yellow: string;
  green: string;
  black: string;
  /** Patients whose count / triage level is not yet clear. */
  unknown: string;
  /** ETA from the rescue unit, in minutes. */
  eta: string;
  /** ETA is a guess: the system compares it with real travel time and uses the smaller value. */
  unsureEta: boolean;
}

export const DEFAULT_INTAKE: IntakeValues = {
  category: 'รถโดยสาร / อุบัติเหตุจราจรหมู่',
  location: 'ถ.เทพารักษ์ กม.12 ขาออก',
  detail: 'รถตู้ชนท้ายรถบัสที่คว่ำ มีผู้บาดเจ็บเพิ่ม',
  red: '2',
  yellow: '3',
  green: '4',
  black: '0',
  unknown: '0',
  eta: '20',
  unsureEta: true,
};

/** Everyone counted so far, including patients whose level is not yet known. */
export function triageTotal(v: IntakeValues): number {
  return (['red', 'yellow', 'green', 'black', 'unknown'] as const).reduce((n, k) => n + (Number(v[k]) || 0), 0);
}

/** Real travel time now (Amazon Location Service, mock). */
export const REAL_TRAVEL_MIN = 22;

/** ETA the plan is built against: the smaller of the report and real travel time when unsure. */
export function effectiveEtaMin(v: IntakeValues): number {
  const reported = Number(v.eta) || 0;
  if (!reported) return REAL_TRAVEL_MIN;
  return v.unsureEta ? Math.min(reported, REAL_TRAVEL_MIN) : reported;
}
