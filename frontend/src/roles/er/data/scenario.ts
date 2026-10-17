/**
 * Special incident states used to preview the UI (S1–S7). `normal` is the regular active incident.
 * S1 patients arrived · S2 no ETA · S3 all lenders refused · S4 Agent fallback · S5 kit without recipe ·
 * S6 cancel (reported by mistake) · S7 no open incident.
 */
export type Scenario = 'normal' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7';

export const SCENARIOS: Scenario[] = ['normal', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
