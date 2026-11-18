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
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth";
import { useToast } from "./toast";

const DEFAULT_PREFS: NotificationPrefs = {
  transfer: true,
  electrical_fault: true,
  connection_lost: true,
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
  prefsRef.current = prefs;

  const reload = useCallback(async () => {
    if (!uid) return;
    const [list, p] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, device_id, type, critical, title, body, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("notification_preferences")
        .select("transfer, electrical_fault, connection_lost, sound")
        .maybeSingle(),
    ]);
    if (list.error) {
      setError(errorMessage(list.error));
    } else {
      setItems(list.data as NotificationRow[]);
      setError(null);
    }
    if (!p.error && p.data) setPrefs(p.data as NotificationPrefs);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void reload();
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (p) => {
          const row = p.new as NotificationRow;
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
          pushToast({ kind: row.type, title: row.title, body: row.body });
          if (prefsRef.current.sound || row.critical) playAlert();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, reload, pushToast]);

  const savePrefs = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!uid) return;
      const next = { ...prefsRef.current, ...patch };
      const { error: err } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: uid, ...next, updated_at: new Date().toISOString() });
      if (err) {
        pushToast({ kind: "error", title: "تعذر حفظ الإعدادات", body: errorMessage(err) });
        return;
      }
      setPrefs(next);
    },
    [uid, pushToast],
  );

  const markRead = useCallback(async (id: number) => {
    const at = new Date().toISOString();
    const { error: err } = await supabase
      .from("notifications")
      .update({ read_at: at })
      .eq("id", id)
      .is("read_at", null);
    if (!err) setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? at } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const at = new Date().toISOString();
    const { error: err } = await supabase
      .from("notifications")
      .update({ read_at: at })
      .eq("user_id", uid)
      .is("read_at", null);
    if (err) pushToast({ kind: "error", title: "تعذر تحديث الإشعارات", body: errorMessage(err) });
    else setItems((p) => p.map((n) => ({ ...n, read_at: n.read_at ?? at })));
  }, [uid, pushToast]);

  const remove = useCallback(
    async (id: number) => {
      const { error: err } = await supabase.from("notifications").delete().eq("id", id);
      if (err) pushToast({ kind: "error", title: "تعذر حذف الإشعار", body: errorMessage(err) });
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
