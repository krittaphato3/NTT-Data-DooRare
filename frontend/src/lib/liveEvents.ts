/**
 * Realtime change signals from `GET /api/v1/events` (SSE). One shared stream per browser tab; screens subscribe
 * with `useLiveRefresh(tables, reload)` and re-fetch their own data when one of those tables changes.
 * Uses fetch (not EventSource) so the Authorization header can be sent. Reconnects with back-off; after a
 * reconnect every subscriber reloads once, since changes may have been missed while the stream was down.
 */
import { useEffect, useRef } from 'react';
import { getStoredToken } from '../services/apiFetch';

type Listener = (table: string | null) => void; // null = "resync everything" (after reconnect)

const listeners = new Set<Listener>();
let controller: AbortController | null = null;
let retryMs = 1000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let connectedOnce = false;
/** Set after a 401/403; cleared when a new subscriber arrives (e.g. screens mounting after sign-in). */
let stopped = false;

function emit(table: string | null): void {
  listeners.forEach((l) => {
    try {
      l(table);
    } catch {
      /* a subscriber must not break the others */
    }
  });
}

function scheduleReconnect(): void {
  if (stopped || retryTimer || listeners.size === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

async function connect(): Promise<void> {
  if (listeners.size === 0) return;
  const token = getStoredToken();
  // Not signed in yet: check again later (no request is sent until a token exists).
  if (!token) {
    scheduleReconnect();
    return;
  }
  const ctrl = new AbortController();
  controller = ctrl;
  try {
    const res = await fetch('/api/v1/events', { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: ctrl.signal });
    // Rejected token (expired / signed out): stop. The stream starts again when a screen subscribes after the next sign-in.
    if (res.status === 401 || res.status === 403) {
      if (controller === ctrl) controller = null;
      stopped = true;
      return;
    }
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    retryMs = 1000;
    if (connectedOnce) emit(null); // catch up on anything missed while disconnected
    connectedOnce = true;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = block.split('\n').find((l) => l.startsWith('data:'));
        if (!data) continue;
        try {
          const t = (JSON.parse(data.slice(5).trim()) as { t?: string }).t;
          if (t) emit(t);
        } catch {
          /* ignore malformed line */
        }
      }
    }
  } catch {
    if (ctrl.signal.aborted) return;
  } finally {
    if (controller === ctrl) controller = null;
  }
  if (!ctrl.signal.aborted) scheduleReconnect();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  if (stopped) {
    stopped = false;
    retryMs = 1000;
  }
  if (!controller && !retryTimer) void connect();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) {
      controller?.abort();
      controller = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}

/**
 * Calls `reload` (debounced) whenever one of `tables` changes on the server, or after the stream reconnects.
 * Pass `enabled = false` to pause (e.g. mock mode).
 */
export function useLiveRefresh(tables: readonly string[], reload: () => unknown, enabled = true, debounceMs = 400): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = tables.join(',');
  useEffect(() => {
    if (!enabled) return;
    const watched = new Set(key.split(','));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribe((table) => {
      if (table !== null && !watched.has(table)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void reloadRef.current();
      }, debounceMs);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [key, enabled, debounceMs]);
}

/** Table groups the screens listen to. */
export const LIVE = {
  borrow: ['borrow_request', 'borrow_leg', 'return_obligation', 'transport_task'],
  lender: ['borrow_leg', 'borrow_request', 'transport_task'],
  transport: ['transport_task', 'transport_event'],
  incident: ['incident', 'incident_patient_count', 'emergency_plan', 'borrow_leg', 'borrow_request', 'kit_pack_task', 'kit_stock', 'transport_task'],
  kit: ['kit_pack_task', 'kit_stock', 'incident', 'emergency_plan'],
  alerts: ['stock_alert', 'borrow_request'],
  notification: ['notification'],
  dashboard: ['borrow_request', 'borrow_leg', 'stock_alert', 'transport_task', 'transport_event', 'near_expiry_item', 'allocation_plan', 'plan_approval', 'incident'],
} as const;
