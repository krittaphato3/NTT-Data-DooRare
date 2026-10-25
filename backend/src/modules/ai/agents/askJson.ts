/**
 * Shared "one JSON answer" LLM call for the F1 / F3 agents (the F2 allocation agent keeps its own tool loop).
 * Same safety shape as AGT-F2-001: the caller puts all the facts in the prompt, the LLM answers with ONE JSON object, `validate`
 * (code) accepts or rejects it, one retry tells the model why, and when anything goes wrong the caller falls back to its rules.
 * Never call this inside a DB transaction: it can take seconds.
 */
import { byokService } from '../byok/byok.service.js';
import { providerFactory } from '../providers/factory.js';
import type { ChatMessage, ILLMProvider } from '../providers/types.js';

export interface AgentHit {
  rule: string;
  ok: boolean;
  note: string;
}

export interface JsonAgentResult<T> {
  /** OK = the validated answer of the LLM; FALLBACK = the LLM failed / was rejected twice / no LLM; SKIPPED = agent switched off. */
  status: 'OK' | 'FALLBACK' | 'SKIPPED';
  modelId: string | null;
  value: T | null;
  /** The accepted JSON object (as parsed), for the audit record. */
  output: Record<string, unknown> | null;
  hits: AgentHit[];
  flags: string[];
  steps: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  error?: string;
}

export type JsonCheck<T> = { ok: true; value: T; output: Record<string, unknown>; hits: AgentHit[] } | { ok: false; hits: AgentHit[] };

/** Finds the first `{ ... }` object in a model answer (it may be wrapped in ``` fences or prose). */
export function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  const text = (raw ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function askJson<T>(opts: {
  system: string;
  user: string;
  validate: (raw: string | null) => JsonCheck<T>;
  timeoutMs: number;
  maxTokens?: number;
  /** `fast` uses the BYOK fast model when one is set (F3: a smaller, faster model, spec §14.2). */
  modelTier?: 'primary' | 'fast';
  /** Replaces the BYOK provider (tests). */
  provider?: ILLMProvider;
}): Promise<JsonAgentResult<T>> {
  const base = { value: null as T | null, output: null as Record<string, unknown> | null, hits: [] as AgentHit[], steps: 0, tokensIn: 0, tokensOut: 0, latencyMs: 0 };
  let provider = opts.provider;
  let model: string | undefined;
  if (!provider) {
    const { config, agentEnabled } = await byokService.getRawConfig();
    if (!agentEnabled) return { ...base, status: 'SKIPPED', modelId: null, flags: ['AGENT_DISABLED'] };
    if (config.provider === 'MOCK') return { ...base, status: 'FALLBACK', modelId: 'MOCK', flags: ['NO_LLM_CONFIGURED'] };
    provider = providerFactory.getProvider({ config, agentEnabled });
    model = (opts.modelTier === 'fast' && config.modelFast) || config.modelPrimary;
  }
  const started = Date.now();
  const rec = { ...base, modelId: (model ?? provider.providerType) as string | null };
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ];
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const left = opts.timeoutMs - (Date.now() - started);
      if (left <= 0) throw new Error(`timeout after ${opts.timeoutMs} ms`);
      rec.steps += 1;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const res = await Promise.race([
        provider.chat(messages, [], { model, temperature: 0, maxTokens: opts.maxTokens ?? 1800 }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timeout after ${opts.timeoutMs} ms`)), left);
        }),
      ]).finally(() => clearTimeout(timer));
      rec.tokensIn += res.usage?.promptTokens ?? 0;
      rec.tokensOut += res.usage?.completionTokens ?? 0;
      if (res.model) rec.modelId = res.model;
      const check = opts.validate(res.content);
      rec.hits.push(...check.hits);
      if (check.ok) return { ...rec, status: 'OK', value: check.value, output: check.output, flags: [], latencyMs: Date.now() - started };
      messages.push({ role: 'assistant', content: res.content ?? '' });
      messages.push({ role: 'user', content: `คำตอบถูกปฏิเสธ: ${check.hits.filter((h) => !h.ok).map((h) => `${h.rule} ${h.note}`).join('; ')} ตอบใหม่เป็น JSON object เดียวตามรูปแบบที่กำหนด` });
    }
    return { ...rec, status: 'FALLBACK', flags: ['AGENT_FALLBACK'], latencyMs: Date.now() - started };
  } catch (e) {
    return { ...rec, status: 'FALLBACK', flags: ['AGENT_FALLBACK', 'LLM_ERROR'], error: (e instanceof Error ? e.message : String(e)).slice(0, 500), latencyMs: Date.now() - started };
  }
}
