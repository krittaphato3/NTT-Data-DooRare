/**
 * Tool staging: sends the model only the tools that plausibly matter for this turn.
 *
 * A pharmacist's registry slice is 15 tools (+2 web) and governance roles reach 22; every schema is sent on every turn, which
 * costs tokens and increases wrong-tool calls. This scores tool names against the user's message and the open screen and keeps
 * the best `maxTools`. It is conservative on purpose: when nothing scores, it falls back to the full list (the old behaviour),
 * so staging can never make a tool unreachable for an ambiguous question.
 *
 * No dependency, no embeddings: family regexes cover the Thai/English intents the copilot actually receives.
 * `AI_TOOL_STAGING=off` disables it; `AI_TOOL_STAGING_MAX` changes the cap (default 10).
 */
import type { ToolDefinition } from '../providers/types.js';

export interface StageInput {
  /** The latest user message (plus any active-record hint). */
  query: string;
  pageTitle?: string;
  currentPath?: string;
  /** Active role, used to pin its own HITL proposal tool. */
  role?: string;
  maxTools?: number;
}

export interface StageResult {
  tools: ToolDefinition[];
  /** false = the full role list was sent (either it fit, staging is off, or the intent was too vague). */
  staged: boolean;
  names: string[];
}

const DEFAULT_MAX = 10;
/** Fewer confident matches than this and we keep the full list instead of guessing. */
const MIN_MATCHED = 4;

interface Family {
  id: string;
  /** Intent words in the user's message or the current screen. */
  intent: RegExp;
  /** Which tool names belong to the family. */
  tools: RegExp;
}

const FAMILIES: Family[] = [
  { id: 'stock', intent: /สต็อก|คงคลัง|rop|reorder|ขาดยา|วิกฤต|สต็อกวิกฤต|stock|alert|reorder/i, tools: /stock|alert|reorder|forecast_trend|near_expiry/i },
  { id: 'borrow', intent: /ยืม|lender|borrow|คำขอ|อนุมัติ|waiver/i, tools: /borrow|lender|waiver|ladder|reorder_recommendation/i },
  { id: 'incident', intent: /เหตุ|incident|ฉุกเฉิน|emergency|คัดกรอง|ผู้ป่วย|แผนเวชภัณฑ์|antidote|ยาแก้พิษ|ชุดยา|kit/i, tools: /incident|kit|emergency|antidote|cold_chain|hospital_kpi|submit_er_action_proposal/i },
  { id: 'transport', intent: /ขนส่ง|รถ|driver|trip|จัดส่ง|เส้นทาง|eta|dispatch|อุณหภูมิ|barcode|tamper/i, tools: /trip|transport|dispatch|traffic|temperature|barcode|tamper|cold_chain/i },
  { id: 'pool', intent: /pool|จัดสรร|allocation|หมดอายุ|near.?expiry|แบ่งจ่าย|fefo/i, tools: /pool|allocation|near_expiry|fefo|expiry/i },
  { id: 'procure', intent: /จัดซื้อ|จัดหา|rfq|vendor|ราคา|purchase|po\b|procurement|ต้นทุน|cost/i, tools: /rfq|vendor|purchase|procurement|cost/i },
  { id: 'governance', intent: /ผู้ใช้|สิทธิ|audit|ตรวจสอบ|config|นโยบาย|รายงาน|mapping|ved|health|kill.?switch/i, tools: /audit|admin|config|verify|health|mapping|ved|waiver|system|region/i },
  { id: 'web', intent: /เว็บ|ค้นเว็บ|google|ลิงก์|link|guideline|แนวทาง|อ้างอิง/i, tools: /^web_/i },
];

/** Scores the role's tools and returns the ones worth sending. */
export function stageTools(all: ToolDefinition[], input: StageInput): StageResult {
  const names = (list: ToolDefinition[]) => list.map((t) => t.name);
  if (all.length === 0) return { tools: [], staged: false, names: [] };

  const max = Math.max(MIN_MATCHED, input.maxTools ?? (Number(process.env.AI_TOOL_STAGING_MAX) || DEFAULT_MAX));
  if (process.env.AI_TOOL_STAGING === 'off' || all.length <= max) {
    return { tools: all, staged: false, names: names(all) };
  }

  const query = (input.query ?? '').toLowerCase();
  const page = `${input.pageTitle ?? ''} ${input.currentPath ?? ''}`.toLowerCase();
  const words = [...new Set(query.match(/[a-z][a-z_]{2,}/g) ?? [])];

  const weights = FAMILIES.map((family) => ({
    family,
    weight: (family.intent.test(query) ? 3 : 0) + (family.intent.test(page) ? 2 : 0),
  }));

  const scored = all.map((tool, index) => {
    let score = 0;
    for (const { family, weight } of weights) {
      if (weight > 0 && family.tools.test(tool.name)) score += weight;
    }
    if (query.includes(tool.name)) score += 6;
    const description = (tool.description ?? '').toLowerCase();
    // Whole words only: "rop" must not score a hit inside "proposal".
    for (const word of words) if (new RegExp(`\\b${word}\\b`).test(description)) score += 1;
    return { tool, score, index };
  });

  // The role's own HITL proposal tool is never staged away: an answer that cannot propose an action is worse than a few
  // extra tokens. Other roles' proposal tools stay out unless their family matched.
  const primaryProposal = `submit_${String(input.role ?? '').toLowerCase()}_proposal`;
  // ask_operator is the escape hatch every tool leans on: it is never staged away.
  const picked: ToolDefinition[] = all.filter((t) => t.name === primaryProposal || t.name === 'ask_operator');
  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  for (const entry of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(entry.tool)) picked.push(entry.tool);
  }

  // Too vague to narrow: send everything rather than hide a tool the operator needs.
  if (picked.length < MIN_MATCHED) return { tools: all, staged: false, names: names(all) };

  // Keep the registry's order: models anchor on the first tool, and leading with the HITL proposal tool made them ask
  // instead of reading.
  const order = new Map(all.map((tool, index) => [tool.name, index]));
  picked.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));

  return { tools: picked, staged: picked.length < all.length, names: names(picked) };
}
