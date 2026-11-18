import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { CommandProgress } from "../../components/control";
import { sourceBadge } from "../../components/status";
import { Badge, Button, Card, ConfirmSheet, SectionTitle, SourceIcon } from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { DeviceStatus, SourceId, SourceReport } from "../../data/types";
import { installedSources } from "../../domain/sources";
import { useCommand } from "../../hooks/useCommand";
import { fmtReading } from "../../lib/format";
import { useActiveDevice } from "../../store/devices";

export const fmtVf = (r: SourceReport | undefined) => `${fmtReading(r?.v)} V • ${fmtReading(r?.f, 1)} Hz`;

/**
 * Sources worth showing right now: everything when no source feeds the
 * load (each with its reason), otherwise the usable ones plus any that need
 * the user's attention (a generator that failed to start).
 */
export function visibleSources(status: DeviceStatus | null): SourceId[] {
  const noSource = status?.system_state === "no_source";
  return installedSources(status).filter((id) => {
    const r = status?.sources?.[id];
    if (!r) return false;
    if (noSource) return true;
    return (
      status?.active_source === id ||
      r.available ||
      r.qualified ||
      r.reason === "qualifying" ||
      r.reason === "standby" ||
      r.reason === "failed_to_start"
    );
  });
}

export function SourcesCard() {
  const { status, link, isAdmin } = useActiveDevice();
  const { state: cmd, send, reset, busy } = useCommand();
  const [confirmReset, setConfirmReset] = useState(false);
  const live = link === "live" || link === "stale";
  const noSource = status?.system_state === "no_source";
  const visible = visibleSources(status);

  return (
    <div>
      <SectionTitle title="حالة مصادر الطاقة" />
      <Card className="divide-y divide-line">
        {!live ? (
          <p className="p-4 text-center text-[13px] text-muted">
            {link === "never" ? "لا توجد بيانات حالياً." : "حالة المصادر غير معروفة أثناء انقطاع الاتصال بالبورد."}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-muted">لا توجد مصادر متاحة حالياً.</p>
        ) : (
          visible.map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && !noSource;
            const b = sourceBadge(r, isActive);
            const genLocked = id === "generator" && r?.reason === "failed_to_start";
            return (
              <div key={id} className="p-4">
                <div className="flex items-center gap-3">
                  <SourceIcon source={id} muted={!isActive && !r?.qualified} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{SOURCE_META[id].name}</p>
                    <p className="num text-[12px] text-muted" dir="ltr" style={{ textAlign: "right" }}>
                      {fmtVf(r)}
                    </p>
                  </div>
                  <Badge tone={b.tone} dot pulse={isActive}>
                    {b.label}
                  </Badge>
                </div>
                {genLocked && (
                  <div className="mt-3 rounded-2xl bg-danger-soft p-3">
                    <p className="text-[12px] leading-5 text-danger-strong">
                      فشلت كل محاولات تشغيل المولد، فأوقف البورد استخدامه. افحص المولد (الوقود، البطارية، المفتاح)
                      ثم أعد المحاولة.
                    </p>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={RotateCcw}
                        className="mt-2"
                        disabled={link !== "live" || busy}
                        onClick={() => setConfirmReset(true)}
                      >
                        إعادة محاولة المولد
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>
      <CommandProgress state={cmd} onDismiss={reset} />
      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="إعادة محاولة تشغيل المولد"
        confirmLabel="إعادة المحاولة"
        onConfirm={() => {
          void send("reset_generator", {});
          setConfirmReset(false);
        }}
      >
        <p className="text-[13px] leading-6 text-ink-2">
          سيسمح البورد باستخدام المولد من جديد. إذا احتاجه النظام سيحاول تشغيله بعدد المحاولات المضبوط في الإعدادات.
        </p>
      </ConfirmSheet>
    </div>
  );
}
