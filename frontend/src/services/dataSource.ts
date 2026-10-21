/**
 * One place that decides what a screen does when its API call fails.
 *  - default: show nothing invented. The hook reports the error here and the app shell shows a banner (see DataStatusBanner).
 *  - `?mock=1` (kept in localStorage until `?mock=0`): demo mode, hooks fall back to their mock fixtures and the banner says so.
 * A 401 never reaches a hook as a "failure": apiFetch clears the dead session and reloads to the login page.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'doorare_mock';

function readFlag(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('mock');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const mockFallbackEnabled = (): boolean => readFlag();

export type DataSource = 'loading' | 'live' | 'mock' | 'error';

/** What a hook stores after a failed load: the mock fixtures only in demo mode, otherwise the empty value. */
export function onLoadFailure<T>(key: string, error: unknown, mock: T, empty: T): { source: 'mock' | 'error'; data: T; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  const mockMode = mockFallbackEnabled();
  setStatus(key, mockMode ? 'mock' : 'error', message);
  return { source: mockMode ? 'mock' : 'error', data: mockMode ? mock : empty, error: message };
}

export function onLoadSuccess(key: string): void {
  setStatus(key, 'live', null);
}

interface Entry { state: 'live' | 'mock' | 'error'; message: string | null }
let entries: Record<string, Entry> = {};
let snapshot: { errors: string[]; mock: boolean } = { errors: [], mock: false };
const listeners = new Set<() => void>();

function setStatus(key: string, state: Entry['state'], message: string | null): void {
  if (entries[key]?.state === state && entries[key]?.message === message) return;
  entries = { ...entries, [key]: { state, message } };
  snapshot = {
    errors: Object.entries(entries).filter(([, e]) => e.state === 'error').map(([k, e]) => `${k}: ${e.message}`),
    mock: Object.values(entries).some((e) => e.state === 'mock'),
  };
  listeners.forEach((l) => l());
}

export function useDataStatus(): { errors: string[]; mock: boolean } {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}
