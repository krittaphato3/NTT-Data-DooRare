import { apiJson } from './apiFetch';

export interface ApiNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

/** API-PL-004: the signed-in user's unread in-app notifications (newest first). */
export const getUnreadNotifications = (limit = 20) =>
  apiJson<{ ok: true; items: ApiNotification[]; nextCursor: string | null; unreadCount: number }>(`/notifications?unread=true&limit=${limit}`);

/** API-PL-005 */
export const markNotificationRead = (id: string) => apiJson<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) });
