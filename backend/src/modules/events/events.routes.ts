/**
 * GET /api/v1/events — Server-Sent Events stream of table-change signals for the signed-in user.
 * Each event is `event: change` with `data: {"t":"<table>"}`; the browser re-fetches its own (hospital-scoped) data.
 * The client reads it with fetch + Authorization header (EventSource cannot send headers).
 */
import { Router } from 'express';
import { onChange } from '../../core/realtime.js';
import { requireAuth } from '../../middleware/auth.js';

export const eventsRouter = Router();

eventsRouter.get('/', requireAuth, (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: do not buffer the stream
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const off = onChange((table) => {
    res.write(`event: change\ndata: ${JSON.stringify({ t: table })}\n\n`);
  });
  // Comment line every 25 s keeps proxies from closing an idle stream.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    off();
  });
});
