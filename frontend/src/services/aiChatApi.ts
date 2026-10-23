export function getAuthToken(): string | null {
  try {
    const raw = sessionStorage.getItem('doorare_auth_session') || localStorage.getItem('doorare_auth_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.token || null;
    }
  } catch {}
  return null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface RouteContext {
  currentPath?: string;
  pageTitle?: string;
  hospitalId?: string | null;
  activeId?: string;
}

export interface StreamEventCallbacks {
  onStatus?: (data: { message: string; role?: string }) => void;
  onToken?: (text: string) => void;
  onToolStart?: (tool: { id?: string; name: string; args?: Record<string, unknown> }) => void;
  onToolEnd?: (res: { id?: string; name?: string; success?: boolean; data?: unknown; error?: string }) => void;
  onProposal?: (proposal: any) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

/**
 * Stream messages and execution events from /api/v1/ai/chat via SSE
 */
export async function streamAiChat(
  messages: ChatMessage[],
  routeContext: RouteContext,
  callbacks: StreamEventCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAuthToken();
  const res = await fetch('/api/v1/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, routeContext }),
    signal,
  });

  if (!res.ok) {
    let errorMsg = `Server error ${res.status}`;
    try {
      const errJson = await res.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch {}
    callbacks.onError?.(errorMsg);
    return;
  }

  if (!res.body) {
    callbacks.onError?.('ReadableStream not supported by browser.');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Ignore empty lines and SSE comments

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace(/^event:\s*/, '');
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace(/^data:\s*/, '');
          try {
            const parsed = JSON.parse(rawData);
            switch (currentEvent) {
              case 'status':
                callbacks.onStatus?.(parsed);
                break;
              case 'token':
                callbacks.onToken?.(parsed.text || '');
                break;
              case 'tool_start':
                callbacks.onToolStart?.(parsed);
                break;
              case 'tool_end':
                callbacks.onToolEnd?.(parsed);
                break;
              case 'proposal':
                callbacks.onProposal?.(parsed.proposal);
                break;
              case 'error':
                callbacks.onError?.(parsed.message);
                break;
              case 'done':
              case 'finish':
                callbacks.onDone?.();
                break;
            }
          } catch {
            // Unparseable JSON chunk
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
