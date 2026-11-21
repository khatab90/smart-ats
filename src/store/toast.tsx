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
    // Confirmations go quickly (they sit over the screen header); problems stay
    // longer so they can be read. A tap closes any of them at once.
    const ms = t.kind === "success" || t.kind === "info" ? 3000 : 6000;
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
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
