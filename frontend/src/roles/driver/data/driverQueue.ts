/**
 * The driver's offline queue (FR-F2a-016, NFR-011): status changes and photos taken without signal are kept in
 * IndexedDB with a client event id and the capture time, then uploaded in order through `events:sync`.
 */
import { syncTransportEvents, uploadTransportPhoto } from '../../../services/transportApi';

export interface QueuedEvent {
  clientEventId: string;
  taskId: string;
  taskNo: string;
  seq: number;
  toStatus: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED';
  capturedAt: string;
  note: string;
  /** Compressed photos (base64 JPEG), uploaded when the event syncs. */
  photos: string[];
  state: 'pending' | 'rejected';
  detail?: string;
}

const DB_NAME = 'doorare-driver';
const STORE = 'queue';
const bus = new EventTarget();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'clientEventId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const notify = () => bus.dispatchEvent(new Event('change'));

export async function listQueue(): Promise<QueuedEvent[]> {
  const all = await run('readonly', (s) => s.getAll() as IDBRequest<QueuedEvent[]>);
  return all.sort((a, b) => a.taskId.localeCompare(b.taskId) || a.seq - b.seq);
}

export async function enqueueEvent(event: Omit<QueuedEvent, 'clientEventId' | 'state'>): Promise<QueuedEvent> {
  const item: QueuedEvent = { ...event, clientEventId: crypto.randomUUID(), state: 'pending' };
  await run('readwrite', (s) => s.put(item));
  notify();
  return item;
}

export async function clearRejected(): Promise<void> {
  const rejected = (await listQueue()).filter((e) => e.state === 'rejected');
  for (const e of rejected) await run('readwrite', (s) => s.delete(e.clientEventId));
  notify();
}

export function onQueueChange(listener: () => void): () => void {
  bus.addEventListener('change', listener);
  return () => bus.removeEventListener('change', listener);
}

export interface SyncSummary {
  applied: number;
  duplicate: number;
  rejected: number;
}

let syncing: Promise<SyncSummary> | null = null;

/** Uploads queued photos, then sends each task's events in `seq` order. Throws on a network error (queue kept). */
export function syncQueue(): Promise<SyncSummary> {
  if (!syncing) {
    syncing = (async () => {
      const summary: SyncSummary = { applied: 0, duplicate: 0, rejected: 0 };
      const pending = (await listQueue()).filter((e) => e.state === 'pending');
      const byTask = new Map<string, QueuedEvent[]>();
      for (const event of pending) byTask.set(event.taskId, [...(byTask.get(event.taskId) ?? []), event]);
      for (const [taskId, events] of byTask) {
        const payload = [];
        for (const event of events) {
          const photoKeys: string[] = [];
          for (const photo of event.photos) photoKeys.push((await uploadTransportPhoto(taskId, photo)).photoKey);
          payload.push({ clientEventId: event.clientEventId, seq: event.seq, toStatus: event.toStatus, capturedAt: event.capturedAt, photoKeys });
        }
        const { results } = await syncTransportEvents(taskId, payload);
        for (const result of results) {
          const event = events.find((e) => e.clientEventId === result.clientEventId);
          if (!event) continue;
          if (result.outcome === 'APPLIED' || result.outcome === 'DUPLICATE') {
            await run('readwrite', (s) => s.delete(event.clientEventId));
            summary[result.outcome === 'APPLIED' ? 'applied' : 'duplicate'] += 1;
          } else {
            await run('readwrite', (s) => s.put({ ...event, state: 'rejected', detail: result.detail ?? result.outcome } satisfies QueuedEvent));
            summary.rejected += 1;
          }
        }
      }
      notify();
      return summary;
    })().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}
