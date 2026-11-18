import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { NotificationType } from "../data/types";

export interface Toast {
  id: string;
  kind: "success" | "error" | "info" | NotificationType;
  title: string;
  body?: string;
}

interface ToastCtx {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissToast = useCallback(
    (id: string) => setToasts((p) => p.filter((t) => t.id !== id)),
    [],
  );
  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `t${++seq}`;
    setToasts((prev) => [...prev.slice(-1), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);
  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside ToastProvider");
  return c;
}
