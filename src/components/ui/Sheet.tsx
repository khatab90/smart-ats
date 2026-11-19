import { X } from "lucide-react";
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
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const host = document.getElementById("sheet-root");
  const node = (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("إغلاق")}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-brand-950/45 backdrop-blur-[2px]"
      />
      <div className="relative flex max-h-[88%] animate-sheet-in flex-col rounded-t-[28px] bg-surface">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" />
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

export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  danger,
  loading,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
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
      }
    >
      {children}
    </Sheet>
  );
}
