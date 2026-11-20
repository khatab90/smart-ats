import { X, type LucideIcon } from "lucide-react";
import { pushBackHandler } from "../../lib/backStack";
import { cn } from "../../lib/cn";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { t } from "../../i18n";

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The Android back button closes it before anything behind it.
    const offBack = pushBackHandler(() => {
      onClose();
      return true;
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      offBack();
    };
  }, [open, onClose]);
  if (!open) return null;
  const host = document.getElementById("sheet-root");
  const node = (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("إغلاق")}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-brand-950/45 backdrop-blur-[2px]"
      />
      <div className="relative flex max-h-[88%] animate-sheet-in flex-col rounded-t-[28px] bg-surface pb-safe md:max-h-[85%] md:pb-0 md:w-full md:max-w-lg md:animate-dialog-in md:rounded-[28px] md:shadow-[0_24px_60px_-20px_rgba(10,25,50,0.55)]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line md:hidden" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <h2 className="text-[17px] font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("إغلاق")}
              className="flex size-9 items-center justify-center rounded-xl bg-canvas text-muted hover:text-ink"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-6">{footer}</div>}
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}

/**
 * A centered confirmation dialog for actions that change the board or the
 * app: the action runs only from its confirm button.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  danger,
  loading,
  disabled,
  icon: Icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The Android back button closes it before anything behind it.
    const offBack = pushBackHandler(() => {
      onClose();
      return true;
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      offBack();
    };
  }, [open, onClose]);
  if (!open) return null;
  const host = document.getElementById("sheet-root");
  const node = (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label={t("إغلاق")}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-brand-950/50 backdrop-blur-[3px]"
      />
      <div className="relative flex max-h-full w-full max-w-sm animate-dialog-in flex-col overflow-hidden rounded-[28px] bg-surface md:max-w-md shadow-[0_24px_60px_-20px_rgba(10,25,50,0.55)]">
        <div className="overflow-y-auto px-5 pt-6 pb-5 text-center">
          {Icon && (
            <span
              className={cn(
                "mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl",
                danger ? "bg-danger-soft text-danger" : "bg-brand-50 text-brand-700",
              )}
            >
              <Icon className="size-6" strokeWidth={1.8} />
            </span>
          )}
          <h2 id="confirm-title" className="text-[17px] font-bold text-ink">
            {title}
          </h2>
          {children && <div className="mt-3 text-start">{children}</div>}
        </div>
        <div className="flex gap-3 border-t border-line px-5 pt-4 pb-5">
          <Button
            full
            loading={loading}
            disabled={disabled}
            onClick={onConfirm}
            className={
              danger ? "bg-danger text-white shadow-none hover:bg-danger-strong" : undefined
            }
          >
            {confirmLabel}
          </Button>
          <Button full variant="secondary" onClick={onClose}>
            {t("إلغاء")}
          </Button>
        </div>
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}
