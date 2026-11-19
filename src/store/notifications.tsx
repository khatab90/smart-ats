import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NotificationPrefs, NotificationRow } from "../data/types";
import * as api from "../api/notifications";
import { notificationText } from "../domain/notifications";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import { t } from "../i18n";

const DEFAULT_PREFS: NotificationPrefs = {
  source_outage: true,
  transfer: true,
  electrical_fault: true,
  connection_lost: true,
  transfer_failed: true,
  sound: false,
};
interface NotificationsCtx {
  items: NotificationRow[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  prefs: NotificationPrefs;
  savePrefs: (patch: Partial<NotificationPrefs>) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: number) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<NotificationsCtx | null>(null);

function playAlert() {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.17);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio unavailable */
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { pushToast } = useToast();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const reload = useCallback(async () => {
    if (!uid) return;
    const [list, p] = await Promise.all([api.listNotifications(), api.getPreferences()]);
    if (list.error !== null) {
      setError(list.error);
    } else {
      setItems(list.data);
      setError(null);
    }
    if (p.error === null && p.data) setPrefs(p.data);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void reload();
    if (!uid) return;
    return api.subscribeNotifications(uid, (row) => {
      setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
      const text = notificationText(row);
      pushToast({ kind: row.type, title: text.title, body: text.body });
      if (prefsRef.current.sound || row.critical) playAlert();
    });
  }, [uid, reload, pushToast]);

  const savePrefs = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!uid) return;
      const next = { ...prefsRef.current, ...patch };
      const { error: err } = await api.savePreferences(uid, next);
      if (err !== null) {
        pushToast({ kind: "error", title: t("تعذر حفظ الإعدادات"), body: err });
        return;
      }
      setPrefs(next);
    },
    [uid, pushToast],
  );

  const markRead = useCallback(async (id: number) => {
    const at = new Date().toISOString();
    const { error: err } = await api.markRead(id, at);
    if (err === null)
      setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? at } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const at = new Date().toISOString();
    const { error: err } = await api.markAllRead(uid, at);
    if (err !== null) pushToast({ kind: "error", title: t("تعذر تحديث الإشعارات"), body: err });
    else setItems((p) => p.map((n) => ({ ...n, read_at: n.read_at ?? at })));
  }, [uid, pushToast]);

  const remove = useCallback(
    async (id: number) => {
      const { error: err } = await api.deleteNotification(id);
      if (err !== null) pushToast({ kind: "error", title: t("تعذر حذف الإشعار"), body: err });
      else setItems((p) => p.filter((n) => n.id !== id));
    },
    [pushToast],
  );

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      unreadCount: items.filter((n) => !n.read_at).length,
      prefs,
      savePrefs,
      markRead,
      markAllRead,
      remove,
      reload,
    }),
    [items, loading, error, prefs, savePrefs, markRead, markAllRead, remove, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications must be used inside NotificationsProvider");
  return c;
}
