// Central fetch for authenticated API calls: attaches the session token.
// Swapping to real JWT later only changes how the backend validates it;
// callers keep using apiFetch unchanged.
const API_BASE = '/api/v1';
const STORAGE_KEY = 'doorare_auth_session';

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw).token ?? null) : null;
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  // A rejected token (expired, or the server restarted and dropped its sessions) must not leave screens quietly on stale/mock data.
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  }
  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    throw Object.assign(new Error(problem.message || problem.title || `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}
