import type { Tone } from './transport';

/** [background, foreground] per tone — matches the `.t-*` badge classes. */
export const TONE_COLORS: Record<Tone, [string, string]> = {
  amber: ['#FEF3C7', '#92400E'],
  green: ['#DCFCE7', '#166534'],
  blue: ['#DBEAFE', '#1E40AF'],
  teal: ['#CCFBF1', '#115E59'],
  red: ['#FEE2E2', '#991B1B'],
  grey: ['#F1F5F9', '#475569'],
  orange: ['#FFEDD5', '#9A3412'],
};
