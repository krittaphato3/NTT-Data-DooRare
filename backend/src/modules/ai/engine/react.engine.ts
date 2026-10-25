import type { ChatMessage, ILLMProvider, LLMResponse, ToolCall } from '../providers/types.js';
import { byokService } from '../byok/byok.service.js';
import { providerFactory } from '../providers/factory.js';
import { defaultToolRegistry, ToolRegistry } from '../tools/registry.js';
import type { RequestContext, ToolProposalPayload, ToolResult } from '../tools/tool.types.js';

export interface ReActExecutionEvent {
  type: 'token' | 'thought' | 'tool_start' | 'tool_end' | 'proposal' | 'done' | 'error';
  token?: string;
  thought?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: ToolResult;
  proposal?: ToolProposalPayload;
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
}

/**
 * Builds the system instructions including caller context, guidelines, and tool usage rules.
 */
export function buildSystemPrompt(context: RequestContext): string {
  const role = context.role || 'USER';
  const hospital = context.hospitalId ? `Hospital ID: ${context.hospitalId}` : 'Regional Scope';

  return `You are DooRare AI Copilot, an intelligent clinical and logistical assistant for rare drug logistics and emergency management.
Current User Context:
- Active Role: ${role}
- Jurisdiction: ${hospital}
- Timestamp: ${new Date().toISOString()}

Operational Guidelines:
1. Always prioritize patient safety and high-alert drug regulations.
2. For medical or emergency incidents, recommend formal actions and kit requirements accurately.
3. Proposal tools (submit_*_proposal) are Terminal Tools. Once you call a proposal tool to present a HITL decision card to the operator, do NOT immediately call subsequent proposal tools that depend on that proposal being approved. Wait for the operator to review and approve the proposal card first. Explain your findings and proposal clearly in your final response.
4. For ER_STAFF: When emergency casualties or trauma events are reported, propose DECLARE_INCIDENT via submit_er_action_proposal (with title, eventType, and patientCounts) so an incident is officially established. Do NOT attempt to borrow antidotes or dispatch kits without an active incident ID (targetId).
5. Keep explanations concise, professional, and clear. Avoid inventing hospital stocks or fake delivery times when tools are available.`;
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
    try {
      const { config } = await byokService.getRawConfig();
      isStreamingEnabled = config.streamingEnabled !== false;
    } catch {
      isStreamingEnabled = true;
    }

    // Get tools allowed for the current role
    const tools = registry.getToolDefinitionsForRole(context.role);

    // Prepare conversational history starting with system prompt
    const conversation: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(context),
      },
      ...messages,
    ];

    let iteration = 0;
    let toolExecutionCount = 0;
    const proposals: ToolProposalPayload[] = [];
    let finalResponse = '';
    let abortedDueToLimit = false;

    const startTime = Date.now();

    while (iteration < maxIterations) {
      if (Date.now() - startTime > timeoutMs) {
        const timeoutMsg = `Execution timed out after ${timeoutMs}ms.`;
        await onEvent({ type: 'error', message: timeoutMsg });
        throw new Error(timeoutMsg);
      }

      iteration++;

      // Step 1: Query LLM with current conversation state & available tools
      const response: LLMResponse = await provider.chat(conversation, tools);

      // Emit model reasoning / thinking if present
      if (response.thought) {
        if (isStreamingEnabled) {
          const thoughtTokens = response.thought.match(/\S+\s*|\s+/g) || [response.thought];
          for (const t of thoughtTokens) {
            await onEvent({ type: 'thought', thought: t });
            await new Promise((resolve) => setTimeout(resolve, 18));
          }
        } else {
          await onEvent({ type: 'thought', thought: response.thought });
        }
      }

      // If the LLM generates conversational text, stream it word by word if streaming is enabled
      if (response.content) {
        finalResponse = response.content;
        if (isStreamingEnabled) {
          // Break text into natural chunks/words for fluid SSE streaming animation
          const tokens = response.content.match(/\S+\s*|\s+/g) || [response.content];
          for (const t of tokens) {
            await onEvent({ type: 'token', token: t });
            // Micro delay to emulate realistic real-time token generation stream
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        } else {
          // Non-streaming mode: send entire text at once without artificial token pacing
          await onEvent({ type: 'token', token: response.content });
        }
      }

      // Step 2: Check if LLM requested any tool calls
      const toolCalls = response.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        // No further tools required - conversation has reached terminal conclusion
        break;
      }

      // If model called tools but didn't output native thinking, synthesize harness process thought
      if (!response.thought) {
        const toolNames = toolCalls.map((tc) => tc.function.name).join(', ');
        const processMsg = `วิเคราะห์ขั้นตอนการทำงาน: ตรวจพบความจำเป็นในการเรียกใช้เครื่องมือ [${toolNames}] เพื่อดึงข้อมูลสถานะล่าสุดจากฐานข้อมูล...`;
        if (isStreamingEnabled) {
          const thoughtTokens = processMsg.match(/\S+\s*|\s+/g) || [processMsg];
          for (const t of thoughtTokens) {
            await onEvent({ type: 'thought', thought: t });
            await new Promise((resolve) => setTimeout(resolve, 18));
          }
        } else {
          await onEvent({ type: 'thought', thought: processMsg });
        }
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

        await onEvent({
          type: 'tool_start',
          toolCall: {
            id: call.id,
            name: toolName,
            arguments: toolArgs,
          },
        });

        // Execute via Tool Registry
        const result = await registry.executeTool(toolName, toolArgs, context);
        toolExecutionCount++;

        await onEvent({
          type: 'tool_end',
          toolCall: {
            id: call.id,
            name: toolName,
            arguments: toolArgs,
          },
          toolResult: result,
        });

        // After tool execution, synthesize observation reflection thought for process transparency
        if (result.success) {
          const obsMsg = `\nได้รับผลการทำงานจาก [${toolName}] เรียบร้อย กำลังสังเคราะห์ข้อมูลเพื่อตอบกลับ...`;
          if (isStreamingEnabled) {
            const obsTokens = obsMsg.match(/\S+\s*|\s+/g) || [obsMsg];
            for (const t of obsTokens) {
              await onEvent({ type: 'thought', thought: t });
              await new Promise((resolve) => setTimeout(resolve, 18));
            }
          } else {
            await onEvent({ type: 'thought', thought: obsMsg });
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
    };
  }
}

export const reactEngine = new ReActEngine();
