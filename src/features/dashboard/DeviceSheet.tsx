import { Plus, Router } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Sheet, StatusDot } from "../../components/ui";
import type { DeviceStatus } from "../../data/types";
import { cn } from "../../lib/cn";
import { fmtAgo } from "../../lib/format";
import { fetchLinkSummaries } from "../../api/devices";
import { useDevices } from "../../store/devices";
import { useNav } from "../../store/nav";
import { t } from "../../i18n";

export function DeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { memberships, activeId, setActiveId, clockOffsetMs } = useDevices();
  const { push } = useNav();
  const [statuses, setStatuses] = useState<
    Record<string, Pick<DeviceStatus, "online" | "last_seen_at" | "interval_ms">>
  >({});

  useEffect(() => {
    if (!open || !memberships.length) return;
    void fetchLinkSummaries(memberships.map((m) => m.device.id)).then(({ data }) => {
      const map: typeof statuses = {};
      for (const row of data ?? []) map[row.device_id] = row;
      setStatuses(map);
    });
  }, [open, memberships]);

  return (
    <Sheet open={open} onClose={onClose} title={t("أجهزتي")}>
      <div className="space-y-2">
        {memberships.map((m) => {
          const selected = m.device.id === activeId;
          const s = statuses[m.device.id];
          const seen = s?.last_seen_at ? Date.parse(s.last_seen_at) : null;
          const online = Boolean(s?.online && seen && Date.now() + clockOffsetMs - seen < 30_000);
          return (
            <button
              key={m.device.id}
              type="button"
              onClick={() => {
                setActiveId(m.device.id);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition",
                selected ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-2xl",
                  online ? "bg-ok-soft text-ok" : "bg-canvas text-faint",
                )}
              >
                <Router className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {m.device.name || m.device.id}
                </span>
                <span className="num block text-[11px] text-muted">
                  <span dir="ltr">{m.device.id}</span> •{" "}
                  {!s
                    ? "…"
                    : online
                      ? t("متصل")
                      : seen
                        ? t("غير متصل • {0}", { 0: fmtAgo(seen, Date.now() + clockOffsetMs) })
                        : t("لم يتصل بعد")}
                </span>
              </span>
              <StatusDot tone={online ? "ok" : "danger"} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          full
          icon={Plus}
          onClick={() => {
            onClose();
            push("addDevice");
          }}
        >
          {t("إضافة جهاز")}
        </Button>
        <Button
          full
          variant="secondary"
          onClick={() => {
            onClose();
            push("devices");
          }}
        >
          {t("إدارة الأجهزة")}
        </Button>
      </div>
    </Sheet>
  );
}
