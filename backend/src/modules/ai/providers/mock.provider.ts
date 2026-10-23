import type { AIConfig } from '../byok/byok.types.js';
import type {
  ChatMessage,
  ChatOptions,
  ILLMProvider,
  LLMResponse,
  ProviderConnectionResult,
  ToolDefinition,
} from './types.js';

/**
 * Mock LLM Provider for offline, zero-token cost local development and testing.
 * Simulates intelligent responses and deterministic tool-calling without hitting any external API.
 */
export class MockProvider implements ILLMProvider {
  readonly providerType = 'MOCK' as const;
  private readonly config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const start = Date.now();
    // Simulate minimal processing overhead
    await new Promise((resolve) => setTimeout(resolve, 8));
    const latencyMs = Date.now() - start;

    return {
      success: true,
      latencyMs,
      message: 'Mock AI provider connected successfully (Offline Simulation).',
      modelId: this.config.modelPrimary || 'mock-model-primary',
    };
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.modelPrimary || 'mock-model-primary';
    const lastMessage = messages[messages.length - 1];
    const userPrompt = (lastMessage?.content || '').toLowerCase();

    // If tools are provided and user is asking for actions, simulate a tool call
    if (tools && tools.length > 0) {
      if (userPrompt.includes('antidote') || userPrompt.includes('poison')) {
        const tool = tools.find((t) => t.name.includes('antidote') || t.name.includes('locator')) || tools[0];
        return {
          model,
          thought: 'ตรวจพบคำขอค้นหายาแก้พิษฉุกเฉิน กำลังประเมินรัศมีการขนส่ง 60 นาที และตรวจสอบคลังยาของโรงพยาบาลพันธมิตรในเขตสุขภาพที่ 6...',
          content: null,
          toolCalls: [
            {
              id: 'call_mock_antidote_001',
              type: 'function',
              function: {
                name: tool.name,
                arguments: JSON.stringify({ query: 'botulinum', radius_minutes: 60 }),
              },
            },
          ],
          usage: { promptTokens: 35, completionTokens: 25, totalTokens: 60 },
        };
      }

      if (userPrompt.includes('stock') || userPrompt.includes('reorder') || userPrompt.includes('borrow')) {
        const tool = tools.find((t) => t.name.includes('stock') || t.name.includes('ladder')) || tools[0];
        return {
          model,
          thought: 'วิเคราะห์ระดับสต็อกยาและจุดสั่งซื้อซ้ำ (ROP) เปรียบเทียบปริมาณคงคลังและอัตราการใช้ย้อนหลัง...',
          content: null,
          toolCalls: [
            {
              id: 'call_mock_stock_002',
              type: 'function',
              function: {
                name: tool.name,
                arguments: JSON.stringify({ item_code: 'DAT-100', required_qty: 10 }),
              },
            },
          ],
          usage: { promptTokens: 40, completionTokens: 30, totalTokens: 70 },
        };
      }
    }

    // Default simulated conversational response
    return {
      model,
      thought: 'ประมวลผลคำขอของผู้ใช้และสังเคราะห์ข้อมูลตามแนวทางความปลอดภัยด้านยา...',
      content: `[Mock AI Response (${model})]: Processed request for "${lastMessage?.content || ''}". System operating in offline mock simulation mode.`,
      usage: {
        promptTokens: 24,
        completionTokens: 28,
        totalTokens: 52,
      },
    };
  }
}
