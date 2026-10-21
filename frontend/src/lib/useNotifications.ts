import { useCallback, useEffect, useState } from 'react';
import { fmtThaiTime } from '../roles/warehouse/data/transportLive';
import { onLoadFailure, onLoadSuccess } from '../services/dataSource';
import { getUnreadNotifications, markNotificationRead } from '../services/notificationsApi';

export interface BellItem {
  id?: string;
  drug: string;
  time: string;
}

/** The bell of the top bar: unread in-app notifications of the signed-in user, refreshed every minute. */
export function useNotifications(enabled: boolean, mock: BellItem[]) {
  const [state, setState] = useState<{ items: BellItem[]; unread: number; live: boolean }>({ items: [], unread: 0, live: false });
  const load = useCallback(async () => {
    try {
      const res = await getUnreadNotifications(20);
      onLoadSuccess('notifications');
      setState({ items: res.items.map((n) => ({ id: n.id, drug: n.title, time: fmtThaiTime(n.createdAt) })), unread: res.unreadCount, live: true });
    } catch (error) {
      const f = onLoadFailure('notifications', error, mock, [] as BellItem[]);
      setState({ items: f.data, unread: f.data.length, live: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [enabled, load]);
  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
      await load();
    },
    [load],
  );
  return { ...state, markRead };
}
