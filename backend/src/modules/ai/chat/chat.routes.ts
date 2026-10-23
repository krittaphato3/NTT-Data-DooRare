import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { reactEngine } from '../engine/react.engine.js';
import type { ChatMessage } from '../providers/types.js';
import type { RequestContext } from '../tools/tool.types.js';

export const aiChatRouter = Router();

/**
 * Format Server-Sent Event (SSE) message
 */
function sendSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Flush if compression/buffering middleware is present
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

/**
 * POST /api/v1/ai/chat
 * Streams ReAct reasoning, tool-calling events, and tokens via Server-Sent Events (SSE).
 */
aiChatRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const { messages, routeContext } = req.body as {
    messages: ChatMessage[];
    routeContext?: {
      currentPath?: string;
      pageTitle?: string;
      hospitalId?: string;
      activeId?: string;
    };
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Array of messages is required.' });
    return;
  }

  // Setup Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx)

  // Construct request context
  const user = req.user;
  const context: RequestContext = {
    userId: user?.id,
    role: user?.role,
    hospitalId: routeContext?.hospitalId || user?.hospitalId || null,
    currentPath: routeContext?.currentPath,
    pageTitle: routeContext?.pageTitle,
    activeId: routeContext?.activeId,
  };

  // Keep connection alive with heartbeat comments if needed
  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  // Handle client disconnection
  let isClientDisconnected = false;
  req.on('close', () => {
    isClientDisconnected = true;
    clearInterval(heartbeat);
  });

  try {
    sendSseEvent(res, 'status', {
      message: 'Processing request with DooRare AI Copilot...',
      role: context.role,
    });

    const result = await reactEngine.execute({
      messages,
      context,
      onEvent: (event) => {
        if (isClientDisconnected) return;

        switch (event.type) {
          case 'token':
            sendSseEvent(res, 'token', { text: event.token });
            break;
          case 'thought':
            sendSseEvent(res, 'thought', { text: event.thought });
            break;
          case 'tool_start':
            sendSseEvent(res, 'tool_start', {
              id: event.toolCall?.id,
              name: event.toolCall?.name,
              args: event.toolCall?.arguments,
            });
            break;
          case 'tool_end':
            sendSseEvent(res, 'tool_end', {
              id: event.toolCall?.id,
              name: event.toolCall?.name,
              success: event.toolResult?.success,
              data: event.toolResult?.data,
              error: event.toolResult?.error,
            });
            break;
          case 'proposal':
            sendSseEvent(res, 'proposal', {
              proposal: event.proposal,
            });
            break;
          case 'error':
            sendSseEvent(res, 'error', {
              message: event.message,
            });
            break;
          case 'done':
            sendSseEvent(res, 'done', {
              message: 'Cycle completed successfully.',
            });
            break;
        }
      },
    });

    if (!isClientDisconnected) {
      sendSseEvent(res, 'finish', {
        iterations: result.iterations,
        toolCount: result.toolExecutionCount,
        hasProposals: result.proposals.length > 0,
      });
      res.end();
    }
  } catch (error: any) {
    if (!isClientDisconnected) {
      sendSseEvent(res, 'error', {
        message: error.message || 'An internal AI engine error occurred.',
      });
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
});
