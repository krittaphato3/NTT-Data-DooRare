import type { AIProviderType } from '../byok/byok.types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string | null;
  thought?: string | null;
  toolCalls?: ToolCall[];
  usage?: LLMUsage;
  model: string;
}

export interface ProviderConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  modelId: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ILLMProvider {
  readonly providerType: AIProviderType;
  chat(messages: ChatMessage[], tools?: ToolDefinition[], options?: ChatOptions): Promise<LLMResponse>;
  testConnection(): Promise<ProviderConnectionResult>;
}
