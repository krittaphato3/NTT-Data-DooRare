import type { ChatMessage, ILLMProvider, LLMResponse, ToolCall } from '../providers/types.js';
import { byokService } from '../byok/byok.service.js';
import { providerFactory } from '../providers/factory.js';
import { defaultToolRegistry, ToolRegistry } from '../tools/registry.js';
import { stageTools } from '../tools/selector.js';
import type { RequestContext, ToolProposalPayload, ToolQuestion, ToolResult } from '../tools/tool.types.js';
import { getDefaultClarifyOptions } from '../tools/askOperator.tool.js';

export interface ReActExecutionEvent {
  type: 'token' | 'thought' | 'tool_start' | 'tool_end' | 'proposal' | 'question' | 'done' | 'error';
  token?: string;
  thought?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: ToolResult;
  /** true when this observation came from the per-turn cache instead of a fresh execution. */
  cached?: boolean;
  /** true when the tool rejected its arguments and the harness is about to ask the operator instead. */
  needsInput?: boolean;
  proposal?: ToolProposalPayload;
  /** Clarifying questions from ask_operator: the turn ends here and the UI collects the answers. */
  questions?: ToolQuestion[];
  message?: string;
}

export interface ReActExecuteOptions {
  messages: ChatMessage[];
  context: RequestContext;
  maxIterations?: number;
  timeoutMs?: number;
  onEvent?: (event: ReActExecutionEvent) => void | Promise<void>;
  providerOverride?: ILLMProvider;
  registryOverride?: ToolRegistry;
}

export interface ReActExecuteResult {
  finalResponse: string;
  toolExecutionCount: number;
  proposals: ToolProposalPayload[];
  iterations: number;
  abortedDueToLimit: boolean;
  /** Tools actually offered to the model this turn (staged subset of the role's registry). */
  stagedTools: string[];
}

/**
 * Builds the system instructions including caller context, guidelines, and tool usage rules.
 */
export function buildSystemPrompt(context: RequestContext): string {
  const role = context.role || 'USER';
  const hospital = context.hospitalId ? `Hospital ID: ${context.hospitalId}` : 'Regional Scope';
  const screen = typeof context.pageTitle === 'string' && context.pageTitle ? context.pageTitle : 'unknown';
  const path = typeof context.currentPath === 'string' && context.currentPath ? context.currentPath : 'unknown';
  const activeId = typeof context.activeId === 'string' && context.activeId ? context.activeId : null;
  const isWebSearchAllowed = Boolean(context.webSearchEnabled);

  return `You are DooRare AI Copilot, an intelligent clinical and logistical assistant for rare drug logistics and emergency management.
Current User Context:
- Active Role: ${role}
- Jurisdiction: ${hospital}
- Current Screen: ${screen} (${path})
- Record Open On This Screen: ${activeId ?? 'none'}
- Web Search: ${isWebSearchAllowed ? 'ENABLED by user' : 'DISABLED'}
- Timestamp: ${new Date().toISOString()}

Operational Guidelines:
1. Always prioritize patient safety and high-alert drug regulations.
2. For medical or emergency incidents, recommend formal actions and kit requirements accurately.
3. Proposal tools (submit_*_proposal) are Terminal Tools. Once you call a proposal tool to present a HITL decision card to the operator, do NOT immediately call subsequent proposal tools that depend on that proposal being approved. Wait for the operator to review and approve the proposal card first. Explain your findings and proposal clearly in your final response.
   CRITICAL PROPOSAL DETAIL RULE:
   - Always populate the summary object with comprehensive, structured clinical details:
     'drug_name': full generic name, strength and dosage form (e.g. "Paracetamol 500 mg tablets")
     'quantity': number of units (e.g. 200)
     'unit': unit of measure (e.g. "tablets", "vials", "ชุด")
     'lender_hospital_name': specific lender hospital name (e.g. "โรงพยาบาลบางบ่อ")
     'urgency': "VERY_URGENT" | "URGENT" | "NORMAL"
     'transit_minutes': estimated delivery / transit time in minutes from lender ladder calculation
     'reason': explicit clinical rationale for this action
     'delivery_method': logistics channel (e.g. "รถขนส่งมาตรฐานควบคุมอุณหภูมิ")
   This ensures the operator receives an official, formal executive proposal document to authorize.
4. For ER_STAFF: When emergency casualties or trauma events are reported, propose DECLARE_INCIDENT via submit_er_action_proposal (with title, eventType, and patientCounts) so an incident is officially established. Never invent or hallucinate an incident UUID in targetId; if targetId is unknown, leave it empty and the system will automatically bind to the hospital's active incident.
5. Keep explanations concise, professional, and clear. Avoid inventing hospital stocks or fake delivery times when tools are available.
6. The operator is looking at the screen and record above. When they say "this", "อันนี้", "รายการนี้" or name an open record without an id, use Record Open On This Screen instead of asking for it again. If it is none, ask one short question naming what you need (incident, borrow request, drug, hospital).
7. Answer in the operator's language: Thai when they write Thai (the whole UI is Thai), English when they write English. Keep drug names, item codes and numbers exactly as the tools return them.
When calling ask_operator: The question, header, and option choices MUST ALWAYS match the language the operator used in their prompt (e.g., Thai if the prompt is in Thai, English if the prompt is in English).
8. Prefer acting over asking: when a read tool covers the question, call it in this turn instead of replying "I can help with that" or asking for an id first. Many read tools work without a drug id and return hospital-wide rows; ask one short question only when the tools genuinely need an id the operator has not given and the screen has none.
9. If a tool returns "Invalid tool arguments" or if the operator's request is underspecified (missing formulation, lender hospital, quantity, or urgency):
   CRITICAL MULTI-QUESTION & CHOICES RULE:
   - Ask ALL missing parameters at once in a SINGLE call to ask_operator (provide 2 to 3 questions in the questions array).
   - DO NOT ask questions one-by-one across multiple turns! That is strictly forbidden.
   - MANDATORY CLICKABLE OPTIONS: For EVERY question in the questions array, you MUST ALWAYS provide 2 to 4 recommended choices in the 'options' field (e.g. options: ["Paracetamol tablet 500 mg", "Paracetamol syrup 120 mg/5 mL"] for formulation, or options: ["ให้ระบบจัดอันดับโรงพยาบาลที่เหมาะสมที่สุดอัตโนมัติ", "รพ.สมุทรปราการ", "รพ.บางพลี"] for hospital, or options: ["ปกติ (NORMAL)", "ด่วน (URGENT)", "ด่วนมาก (VERY_URGENT)"] for urgency).
   - NEVER omit options or provide empty options! The operator relies on clickable choice pills to answer rapidly.
   - For drug borrowing/lending, ask: (1) Drug formulation & strength with choices, (2) Target lender hospital with choices, (3) Urgency with choices.
   - The UI presents this as a multi-step card where the operator clicks a choice to auto-advance to the next question.
   - After calling ask_operator with all needed questions and options, stop immediately.
10. ${isWebSearchAllowed
    ? "DooRare's own tools are authoritative for stock, forecasts, borrow requests, plans and incidents. Web search is enabled by the operator: use web_search / web_fetch ONLY for external public guidelines, clinical references, or when the operator pastes a link, and cite the URL you used."
    : "Web search is DISABLED for this session. Rely strictly on DooRare internal hospital tools, database records, and provided reference files. Do NOT attempt to search the web."}`;
}

/**
 * Core ReAct Engine implementing Thought -> Action -> Observation -> Final Answer loop.
 */
export class ReActEngine {
  private readonly defaultMaxIterations = 8;
  private readonly defaultTimeoutMs = Number(process.env.AI_AGENT_TIMEOUT_MS) || 60000; // 60 seconds default

  /**
   * Returns active LLM provider via BYOK factory and active configuration.
   */
  async getActiveProvider(): Promise<ILLMProvider> {
    const raw = await byokService.getRawConfig();
    return providerFactory.getProvider({
      config: raw.config,
      agentEnabled: raw.agentEnabled,
    });
  }

  /**
   * Executes the ReAct cycle until a terminal answer or proposal is reached.
   */
  async execute(options: ReActExecuteOptions): Promise<ReActExecuteResult> {
    const {
      messages,
      context,
      maxIterations = this.defaultMaxIterations,
      timeoutMs = this.defaultTimeoutMs,
      onEvent = () => {},
      providerOverride,
      registryOverride,
    } = options;

    const provider = providerOverride || (await this.getActiveProvider());
    const registry = registryOverride || defaultToolRegistry;

    let isStreamingEnabled = true;
    // An explicitly injected provider already carries its own streaming behaviour; skip the BYOK read (and its DB hit).
    if (!providerOverride) {
      try {
        const { config } = await byokService.getRawConfig();
        isStreamingEnabled = config.streamingEnabled !== false;
      } catch {
        isStreamingEnabled = true;
      }
    }

    // Stage the role's tools for this turn: sending 15–22 schemas on every message costs tokens and invites wrong-tool
    // calls. stageTools falls back to the full list when the intent is too vague to narrow safely.
    const roleTools = registry.getToolDefinitionsForRole(context.role);
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const staging = stageTools(roleTools, {
      query: typeof lastUserMessage === 'string' ? lastUserMessage : '',
      role: context.role,
      pageTitle: typeof context.pageTitle === 'string' ? context.pageTitle : undefined,
      currentPath: typeof context.currentPath === 'string' ? context.currentPath : undefined,
    });

    // Optional web search: only expose web_search / web_fetch when explicitly enabled by user
    const isWebSearchAllowed = Boolean(context.webSearchEnabled);
    const tools = isWebSearchAllowed
      ? staging.tools
      : staging.tools.filter((t) => t.name !== 'web_search' && t.name !== 'web_fetch');

    // Web Fetch Script: automatically extract and pre-fetch any public URLs in the user prompt
    // so that ANY model (even without native search or tool-calling capabilities) has full access to the page text!
    const preFetchedContexts: ChatMessage[] = [];
    if (typeof lastUserMessage === 'string') {
      const urlMatches = lastUserMessage.match(/https?:\/\/[^\s<>"')]+/g);
      if (urlMatches && urlMatches.length > 0) {
        const targetUrl = urlMatches[0];
        try {
          const fetchRes = await registry.executeTool('web_fetch', { url: targetUrl }, context);
          if (fetchRes.success && fetchRes.data) {
            const pageData = fetchRes.data as any;
            preFetchedContexts.push({
              role: 'system',
              content: `[Web Fetch Script: Pre-fetched content from ${targetUrl}]\nTitle: ${pageData.title || 'Untitled'}\nStatus: ${pageData.status}\n\n${pageData.text || ''}`,
            });
          }
        } catch {
          // Continue if URL fetch fails
        }
      }
    }

    // Prepare conversational history starting with system prompt
    const conversation: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(context),
      },
      ...preFetchedContexts,
      ...messages,
    ];

    let iteration = 0;
    let toolExecutionCount = 0;
    // Per-turn result cache: the model often re-asks for a read it already made; one DB round trip per (tool, args) is enough.
    const toolResultCache = new Map<string, ToolResult>();
    const toolFailures = new Map<string, number>();
    const proposals: ToolProposalPayload[] = [];
    let finalResponse = '';
    let abortedDueToLimit = false;

    const startTime = Date.now();

    reactLoop: while (iteration < maxIterations) {
      if (Date.now() - startTime > timeoutMs) {
        const timeoutMsg = `Execution timed out after ${timeoutMs}ms.`;
        await onEvent({ type: 'error', message: timeoutMsg });
        throw new Error(timeoutMsg);
      }

      iteration++;

      // Step 1: Query LLM with current conversation state & available tools. Providers that support it stream,
      // and each delta goes to the client as it arrives (no synthetic word pacing).
      let streamedText = '';
      const response: LLMResponse = await provider.chat(
        conversation,
        tools,
        isStreamingEnabled
          ? {
              onDelta: (text) => {
                if (!text) return;
                streamedText += text;
                void onEvent({ type: 'token', token: text });
              },
            }
          : undefined,
      );

      // Emit model reasoning / thinking if present (whole: providers stream text, not reasoning)
      if (response.thought) {
        await onEvent({ type: 'thought', thought: response.thought });
      }

      if (response.content) {
        finalResponse = response.content;
        // A provider without delta streaming (or streaming disabled) returns the whole answer at once.
        if (!streamedText) await onEvent({ type: 'token', token: response.content });
      }

      // Step 2: Check if LLM requested any tool calls
      const toolCalls = response.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        // No further tools required - conversation has reached terminal conclusion
        break;
      }

      // Record assistant message with tool calls in history
      conversation.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: toolCalls,
      });

      // Step 3: Execute tool calls sequentially
      for (const call of toolCalls) {
        const toolName = call.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          toolArgs = {};
        }

        const isAskOperator = toolName === 'ask_operator';

        // Do not emit tool_start / tool_end for ask_operator:
        // ask_operator is rendered strictly as a ClarifyPanel card, not as a tool execution log card.
        if (!isAskOperator) {
          await onEvent({
            type: 'tool_start',
            toolCall: {
              id: call.id,
              name: toolName,
              arguments: toolArgs,
            },
          });
        }

        // Execute via Tool Registry
        const cacheKey = cacheKeyFor(toolName, toolArgs);
        const cachedResult = toolResultCache.get(cacheKey);
        const result = cachedResult ?? (await registry.executeTool(toolName, toolArgs, context));
        if (!cachedResult) toolResultCache.set(cacheKey, result);
        if (!cachedResult) toolExecutionCount++;

        if (!isAskOperator) {
          await onEvent({
            type: 'tool_end',
            toolCall: {
              id: call.id,
              name: toolName,
              arguments: toolArgs,
            },
            toolResult: result,
            cached: Boolean(cachedResult),
            needsInput: !result.success && Boolean(result.validationErrors?.length || parseErrorFields(result.error ?? '').length),
          });
        }

        // A clarifying question is terminal: the panel collects the answer, which returns as the next user message.
        if (result.question) {
          await onEvent({ type: 'question', questions: result.question.questions });
          break reactLoop;
        }

        // If ask_operator was called but somehow didn't produce result.question, recover from toolArgs
        if (isAskOperator) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
          const isThai = /[\u0E00-\u0E7F]/.test(lastUserMsg);

          const rawList = Array.isArray(toolArgs?.questions) && toolArgs.questions.length > 0
            ? toolArgs.questions
            : [toolArgs];

          const recoveredQuestions = rawList.map((q: any) => {
            const rawQ = String(q?.question || q?.prompt || q?.text || q?.title || (isThai ? 'กรุณาระบุข้อมูลเพิ่มเติมเพื่อดำเนินการต่อ' : 'Please provide additional information to continue')).trim();
            const rawHeader = String(q?.header || q?.title || q?.label || (rawQ.length > 30 ? rawQ.slice(0, 30) : rawQ) || (isThai ? 'ข้อมูลเพิ่มเติม' : 'Additional Info')).trim().slice(0, 50);

            const rawOptions = (Array.isArray(q?.options) && q.options.length > 0)
              ? q.options
              : (Array.isArray(q?.choices) && q.choices.length > 0)
                ? q.choices
                : (Array.isArray(q?.items) && q.items.length > 0)
                  ? q.items
                  : (typeof q?.options === 'string')
                    ? q.options.split(/[,|\n]/).map((s: string) => ({ label: s.trim() }))
                    : (typeof q?.choices === 'string')
                      ? q.choices.split(/[,|\n]/).map((s: string) => ({ label: s.trim() }))
                      : [];

            let options = rawOptions
              .map((opt: any) => {
                if (typeof opt === 'string') return { label: opt.trim() };
                return {
                  label: String(opt?.label || opt?.text || opt?.value || opt?.name || opt?.choice || '').trim(),
                  description: opt?.description ? String(opt.description).trim() : undefined,
                };
              })
              .filter((opt: any) => Boolean(opt.label))
              .slice(0, 8);

            if (options.length === 0) {
              options = getDefaultClarifyOptions(rawHeader, rawQ);
            }

            return {
              header: rawHeader,
              question: rawQ,
              options,
              allowFreeText: q?.allowFreeText !== false,
              multiSelect: Boolean(q?.multiSelect),
            };
          });

          await onEvent({
            type: 'question',
            questions: recoveredQuestions.length > 0 ? recoveredQuestions : [
              {
                header: isThai ? 'ข้อมูลเพิ่มเติม' : 'Additional Info',
                question: isThai ? 'กรุณาระบุข้อมูลเพิ่มเติมเพื่อดำเนินการต่อ' : 'Please provide additional information to continue',
                options: getDefaultClarifyOptions('ข้อมูลเพิ่มเติม', 'กรุณาระบุข้อมูลเพิ่มเติม'),
                allowFreeText: true,
                multiSelect: false,
              },
            ],
          });
          break reactLoop;
        }

        // Guardrail: a tool that keeps rejecting the arguments must not be retried a third time — ask instead.
        if (!result.success) {
          // Anything that reads as "the arguments were rejected" is a missing-information problem, not an error to show:
          // ask the operator straight away (first failure), instead of painting a red tool card and retrying blind.
          const inputErrors = result.validationErrors?.length
            ? result.validationErrors
            : parseErrorFields(result.error ?? '');
          if (inputErrors.length > 0) {
            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
            await onEvent({ type: 'question', questions: questionsFromValidation(toolName, inputErrors, lastUserMsg) });
            break reactLoop;
          }

          const failures = (toolFailures.get(toolName) ?? 0) + 1;
          toolFailures.set(toolName, failures);
          if (failures >= 2) {
            conversation.push({
              role: 'system',
              content: `[harness] '${toolName}' failed ${failures} times in this turn. Do not call it again with guessed arguments: call ask_operator to collect the missing values from the operator.`,
            });
          }
        }

        // If tool generated a Proposal card, capture and emit event
        if (result.proposal) {
          proposals.push(result.proposal);
          await onEvent({
            type: 'proposal',
            proposal: result.proposal,
          });
        }

        // Add tool execution observation to conversation history
        conversation.push({
          role: 'tool',
          name: toolName,
          tool_call_id: call.id,
          content: JSON.stringify(result.success ? result.data || result.proposal : { error: result.error }),
        });
      }
    }

    if (iteration >= maxIterations && !finalResponse) {
      abortedDueToLimit = true;
      finalResponse = `ReAct loop reached the maximum allowed tool iterations (${maxIterations}).`;
      await onEvent({ type: 'token', token: finalResponse });
    }

    await onEvent({ type: 'done' });

    return {
      finalResponse,
      toolExecutionCount,
      proposals,
      iterations: iteration,
      abortedDueToLimit,
      stagedTools: staging.names,
    };
  }
}

/** Reads the field paths out of a tool's own rejection message, which embeds a zod issue JSON. */
function parseErrorFields(error: string): { path: string; message: string }[] {
  if (!/invalid|required|expected|missing|ต้อง/i.test(error)) return [];
  const start = error.indexOf('{');
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(error.slice(start)) as any;
    const issues: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.issues) ? parsed.issues : [parsed];
    return issues
      .filter((issue) => issue && (Array.isArray(issue.path) || typeof issue.path === 'string'))
      .map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path),
        message: [issue.message, issue.expected ? `expected ${issue.expected}` : ''].filter(Boolean).join(', '),
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

/** Turns repeated schema rejections into a question panel, one question per rejected field. */
function questionsFromValidation(
  toolName: string,
  errors: { path: string; message: string }[],
  userPrompt = '',
): ToolQuestion[] {
  const isThai = /[\u0E00-\u0E7F]/.test(userPrompt);
  const byField = new Map<string, string[]>();
  for (const error of errors) {
    const field = error.path || (isThai ? 'ค่าที่ต้องการ' : 'required_value');
    byField.set(field, [...(byField.get(field) ?? []), error.message]);
  }

  const labels = isThai ? FIELD_LABELS_TH : FIELD_LABELS_EN;

  return [...byField.entries()].slice(0, 3).map(([field, messages]) => {
    const rawKey = field.split('.').pop() ?? '';
    const label = labels[rawKey] ?? field;
    const header = label.length > 24 ? field.slice(-24) : label;
    // Clean up internal technical validation strings
    const cleanMsg = messages
      .map((m) => {
        if (/expected object, received string/i.test(m)) return isThai ? 'ต้องระบุข้อมูล' : 'required value';
        return m;
      })
      .join(', ');

    const question = isThai
      ? `ระบุ ${label} (${field}) สำหรับ ${toolName} — ${cleanMsg}`
      : `Please specify ${label} (${field}) for ${toolName} — ${cleanMsg}`;

    return {
      header,
      question,
      options: getDefaultClarifyOptions(header, question),
      allowFreeText: true,
      multiSelect: false,
    };
  });
}

/** Thai labels for the fields the proposal tools reject most often. */
const FIELD_LABELS_TH: Record<string, string> = {
  drugMasterId: 'ชื่อยา / รหัสยา',
  hospitalDrugId: 'รายการยาใน รพ.',
  qtyRequested: 'จำนวนที่ต้องการ',
  quantity: 'จำนวน',
  hospitalId: 'โรงพยาบาล',
  targetId: 'รหัสเป้าหมาย',
  reason: 'เหตุผล',
};

/** English labels for the fields the proposal tools reject most often. */
const FIELD_LABELS_EN: Record<string, string> = {
  drugMasterId: 'Drug name / code',
  hospitalDrugId: 'Hospital drug item',
  qtyRequested: 'Quantity needed',
  quantity: 'Quantity',
  hospitalId: 'Hospital',
  targetId: 'Target reference',
  reason: 'Reason',
};

/** Stable cache key for a tool call: argument key order must not create a second DB round trip. */
function cacheKeyFor(toolName: string, args: unknown): string {
  const stable = (value: unknown): string => {
    if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`;
  };
  return `${toolName}:${stable(args)}`;
}

export const reactEngine = new ReActEngine();
