import type { ToolLogEntry } from '../components/ai/ToolExecutionLogCard';

export interface DisplayChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isThinking?: boolean;
  toolLogs?: ToolLogEntry[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: DisplayChatMessage[];
  proposals?: any[];
}

const STORAGE_KEY = 'doorare_chat_sessions_v1';
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds

/**
 * Loads all active sessions from localStorage, automatically purging any session older than 24 hours.
 */
export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: ChatSession[] = JSON.parse(raw);
    const now = Date.now();

    // 24-Hour Auto-Clean Filter
    const activeSessions = parsed.filter(
      (s) => s.updatedAt && now - s.updatedAt < RETENTION_MS,
    );

    // If any expired sessions were pruned, write the cleaned list back to storage
    if (activeSessions.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSessions));
    }

    // Return most recently updated sessions first
    return activeSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Saves or updates a session in localStorage with defensive deduplication.
 */
export function saveSession(session: ChatSession): void {
  try {
    const sessions = loadSessions();
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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
  } catch (err) {
    console.error('Failed to save chat session:', err);
  }
}

/**
 * Deletes a single session by ID.
 */
export function deleteSession(id: string): void {
  try {
    const sessions = loadSessions().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

/**
 * Purges all chat sessions.
 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
