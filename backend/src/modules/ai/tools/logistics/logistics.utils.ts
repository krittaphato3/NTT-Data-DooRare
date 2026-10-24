/**
 * Logistics AI utilities and security helpers.
 */

// G-09 Prompt Injection detection pattern for logistics inputs (voice delay reports, notes, etc.)
export const INJECTION_PATTERN =
  /(ignore\s+(all\s+)?previous\s+instructions|(?:^|\n)\s*system\s*:|override\s+all|you\s+are\s+now|developer\s+mode|as\s+an\s+ai|ยกเลิกคำสั่ง(ก่อนหน้า|ทั้งหมด)|ลืมคำสั่ง(ทั้งหมด|ก่อนหน้า)|แทนที่คำสั่ง|ละเว้นคำสั่ง|(?:^|\n)\s*คำสั่งใหม่\s*:|(?:^|\n)\s*ระบบ\s*:|ตอนนี้คุณคือ|โหมดนักพัฒนา|ในฐานะ\s*(เอไอ|ai))/i;

/**
 * Returns true if text matches prompt injection heuristic patterns.
 */
export function isPromptInjection(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return INJECTION_PATTERN.test(text);
}

/**
 * Warning threshold cut-off for mild elevated cold-chain temperatures before critical excursion.
 * Temperatures between 8.0°C and 10.0°C represent WARNING_HIGH; temperatures above 10.0°C represent CRITICAL_HIGH.
 */
export const COLD_CHAIN_WARNING_MAX_TEMP = 10.0;

/**
 * Standard Thailand VAT rate (7%).
 */
export const VAT_RATE = 0.07;

/**
 * Default procurement lead time estimate when no incoming order history exists.
 */
export const DEFAULT_LEAD_TIME_DAYS = 14;

/**
 * Default minimum order quantity assumption when vendor contract data is unavailable.
 */
export const DEFAULT_MOQ = 1;

/**
 * Reorder urgency days-of-cover thresholds.
 */
export const REORDER_URGENCY_CRITICAL_DAYS = 2;
export const REORDER_URGENCY_HIGH_DAYS = 7;
export const REORDER_URGENCY_MEDIUM_DAYS = 14;

