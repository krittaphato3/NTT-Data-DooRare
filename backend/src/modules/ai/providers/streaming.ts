/**
 * Minimal Server-Sent Events reader for provider streaming responses.
 * Shared by the OpenAI-compatible providers (data: {json} / [DONE]) and Anthropic (event: + data: pairs).
 * No dependency: providers send plain `text/event-stream`.
 */
import type { LLMResponse, LLMUsage, ToolCall } from './types.js';

export async function consumeSse(
  res: Response,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  if (!res.body) throw new Error('Streaming response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          event = 'message';
          continue;
        }
        if (line.startsWith(':')) continue; // comment / keepalive
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        if (!data) continue;
        onEvent(event, data);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads an OpenAI-compatible `/chat/completions` stream: text deltas go to `onDelta`, tool calls arrive in fragments and are
 * reassembled by index. Shared by the OpenAI, Azure and Custom (OpenAI-compatible) providers.
 */
export async function readOpenAiCompatStream(
  res: Response,
  model: string,
  onDelta: (text: string) => void,
): Promise<LLMResponse> {
  // Some OpenAI-compatible endpoints ignore `stream: true` and answer with one JSON body: read it as a normal reply.
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = (await res.json().catch(() => null)) as any;
    const choice = data?.choices?.[0];
    const text = choice?.message?.content ?? choice?.text ?? null;
    if (typeof text === 'string' && text) onDelta(text);
    return {
      model,
      content: text,
      thought: choice?.message?.reasoning_content ?? null,
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function?.name,
          arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
        },
      })),
      usage: data?.usage
        ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0, totalTokens: data.usage.total_tokens ?? 0 }
        : undefined,
    };
  }

  let content = '';
  let thought = '';
  let usage: LLMUsage | undefined;
  const pending = new Map<number, { id: string; name: string; args: string }>();

  await consumeSse(res, (_event, data) => {
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const delta = json.choices?.[0]?.delta ?? {};
    if (typeof delta.reasoning_content === 'string') thought += delta.reasoning_content;
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      onDelta(delta.content);
    }
    for (const tc of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
      const idx = typeof tc.index === 'number' ? tc.index : 0;
      const cur = pending.get(idx) ?? { id: '', name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      pending.set(idx, cur);
    }
    if (json.usage) {
      usage = {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0,
      };
    }
  });

  const toolCalls: ToolCall[] = [...pending.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v.name)
    .map(([, v]) => ({
      id: v.id || `call_${v.name}`,
      type: 'function' as const,
      function: { name: v.name, arguments: v.args || '{}' },
    }));

  return {
    model,
    content: content || null,
    thought: thought || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
  };
}
