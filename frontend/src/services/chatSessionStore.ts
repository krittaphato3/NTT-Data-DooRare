import type { ToolLogEntry } from '../components/ai/ToolExecutionLogCard';
import type { ClarifyQuestion } from './aiChatApi';

export interface DisplayChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isThinking?: boolean;
  toolLogs?: ToolLogEntry[];
  /** Questions the copilot is waiting on; kept so the panel survives a reload. */
  questions?: ClarifyQuestion[];
  questionsAnswered?: boolean;
  savedAnswers?: { header: string; answer: string }[];
  /** Attached HITL proposal; rendered inline in the message turn so it is not pushed to the bottom. */
  proposal?: any;
  proposalStatus?: 'pending' | 'approved' | 'declined' | 'failed';
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: DisplayChatMessage[];
  proposals?: any[];
}

export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000; // 30 Days in milliseconds (auto-pruned after 30 days)

export interface SessionDateGroup {
  id: 'today' | 'yesterday' | 'previous7Days' | 'previous30Days';
  title: string;
  items: ChatSession[];
}

/**
 * Categorizes active sessions into Today, Yesterday, Previous 7 Days, and Earlier (up to 30 days).
 */
export function groupSessionsByDate(sessions: ChatSession[]): SessionDateGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7Days = startOfToday - 6 * 24 * 60 * 60 * 1000;

  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const previous7Days: ChatSession[] = [];
  const previous30Days: ChatSession[] = [];

  for (const s of sessions) {
    const timestamp = s.updatedAt || s.createdAt || 0;
    if (timestamp >= startOfToday) {
      today.push(s);
    } else if (timestamp >= startOfYesterday) {
      yesterday.push(s);
    } else if (timestamp >= startOf7Days) {
      previous7Days.push(s);
    } else {
      previous30Days.push(s);
    }
  }

  const groups: SessionDateGroup[] = [];
  if (today.length > 0) {
    groups.push({ id: 'today', title: 'วันนี้', items: today });
  }
  if (yesterday.length > 0) {
    groups.push({ id: 'yesterday', title: 'เมื่อวาน', items: yesterday });
  }
  if (previous7Days.length > 0) {
    groups.push({ id: 'previous7Days', title: '7 วันที่ผ่านมา', items: previous7Days });
  }
  if (previous30Days.length > 0) {
    groups.push({ id: 'previous30Days', title: 'ก่อนหน้า (ภายใน 30 วัน)', items: previous30Days });
  }

  return groups;
}

/**
 * Strips leading emojis or legacy chat icon artifacts from a session title.
 */
function sanitizeTitle(title: string): string {
  if (!title) return 'บทสนทนา';
  return title
    .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\s]+/u, '')
    .trim() || 'บทสนทนา';
}

/**
 * Returns a storage key partitioned by user identity / role scope.
 */
export function getStorageKey(userScope?: string | null): string {
  if (!userScope) return 'doorare_chat_sessions_guest_v1';
  return `doorare_chat_sessions_${userScope}_v1`;
}

/**
 * Loads all active sessions from localStorage for a specific user/role scope,
 * automatically purging any session older than 24 hours.
 */
export function loadSessions(userScope?: string | null): ChatSession[] {
  const storageKey = getStorageKey(userScope);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed: ChatSession[] = JSON.parse(raw);
    const now = Date.now();

    // 24-Hour Auto-Clean Filter & Title Sanitization (remove any emoji artifacts)
    const activeSessions = parsed
      .filter((s) => s.updatedAt && now - s.updatedAt < RETENTION_MS)
      .map((s) => ({
        ...s,
        title: sanitizeTitle(s.title),
      }));

    // If any expired sessions were pruned or titles sanitized, write the cleaned list back to storage
    if (activeSessions.length !== parsed.length) {
      localStorage.setItem(storageKey, JSON.stringify(activeSessions));
    }

    // Return most recently updated sessions first
    return activeSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Saves or updates a session in localStorage for a specific user/role scope.
 */
export function saveSession(session: ChatSession, userScope?: string | null): void {
  const storageKey = getStorageKey(userScope);
  try {
    const sessions = loadSessions(userScope);
    // 1. Match by session ID
    let index = sessions.findIndex((s) => s.id === session.id);

    // 2. Defensive match: if ID was generated freshly in a closure race, match by initial user message & time window
    if (index === -1 && session.messages && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m) => m.role === 'user')?.content?.trim();
      if (firstUserMsg) {
        index = sessions.findIndex((s) => {
          const sFirstMsg = s.messages?.find((m) => m.role === 'user')?.content?.trim();
          return (
            sFirstMsg &&
            sFirstMsg === firstUserMsg &&
            Math.abs(s.createdAt - session.createdAt) < 60000 // created within 60s
          );
        });
      }
    }

    const targetId = index >= 0 ? sessions[index].id : session.id;
    const updatedSession: ChatSession = {
      ...session,
      id: targetId,
      updatedAt: Date.now(),
    };

    if (index >= 0) {
      sessions[index] = updatedSession;
    } else {
      sessions.unshift(updatedSession);
    }

    // Strict deduplication by ID
    const seenIds = new Set<string>();
    const deduplicated = sessions.filter((s) => {
      if (!s.id || seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    localStorage.setItem(storageKey, JSON.stringify(deduplicated));
  } catch (err) {
    console.error('Failed to save chat session:', err);
  }
}

/**
 * Deletes a single session by ID for a specific user scope.
 */
export function deleteSession(id: string, userScope?: string | null): void {
  const storageKey = getStorageKey(userScope);
  try {
    const sessions = loadSessions(userScope).filter((s) => s.id !== id);
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

/**
 * Purges all chat sessions for a specific user scope.
 */
export function clearAllSessions(userScope?: string | null): void {
  const storageKey = getStorageKey(userScope);
  try {
    localStorage.removeItem(storageKey);
  } catch {}
}

/**
 * Formats session timestamps in relative or readable Thai format.
 */
export function formatSessionRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);

  if (diffSec < 60) return 'เมื่อสักครู่';
  if (diffSec < 3600) return `เมื่อ ${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `เมื่อ ${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;

  const date = new Date(timestamp);
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
