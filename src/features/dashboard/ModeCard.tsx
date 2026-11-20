import { ArrowLeftRight, BrainCircuit, Clock3, Hand, ShieldCheck, Zap } from "lucide-react";
import { priorityText } from "../settings/summaries";
import { useState } from "react";
import { CommandProgress } from "../../components/control";
import { Card, ConfirmDialog, Segmented, SourceIcon } from "../../components/ui";
import { MODE_LABEL, SOURCE_META, SOURCE_ORDER } from "../../data/meta";
import type { SourceId, SystemMode } from "../../data/types";
import { useCommand } from "../../hooks/useCommand";
import { cn } from "../../lib/cn";
import { fmtNum } from "../../lib/format";
import {
  installedSources,
  isUsableManually,
  outsideSchedule,
  predictSmartTarget,
} from "../../domain/sources";
import { useActiveDevice, useNow } from "../../store/devices";
import { sourceBadge } from "../../components/status";
import { isRtl, t } from "../../i18n";

export function ModeCard() {
  const { status, settings, link, isAdmin, serverNow } = useActiveDevice();
  useNow(30_000);
  // Manual mode may revert by itself (Device settings → timers).
  const revertMs =
    status?.mode === "manual" && settings?.manual_revert_min && status.mode_since
      ? Date.parse(status.mode_since) + settings.manual_revert_min * 60_000 - serverNow()
      : null;
  const revertMin = revertMs !== null && revertMs > 0 ? Math.ceil(revertMs / 60_000) : null;
  const { state, send, reset, busy } = useCommand();
  const [confirm, setConfirm] = useState<
    { kind: "mode"; mode: SystemMode } | { kind: "source"; source: SourceId } | null
  >(null);
  const mode = status?.mode ?? null;
  const canControl = isAdmin && link === "live";
  const priority = settings?.priority ?? SOURCE_ORDER;
  const prediction = predictSmartTarget(priority, status?.sources);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-ink">{t("وضع النظام")}</p>
          <p className="text-[12px] text-muted">
            {mode === "smart"
              ? t("البورد يختار المصدر حسب ترتيب الأولوية")
              : mode === "manual"
                ? revertMin !== null
                  ? t("أنت تختار المصدر يدوياً • يعود للذكي خلال {0} د", { 0: revertMin })
                  : t("أنت تختار المصدر يدوياً")
                : t("الوضع غير معروف حتى تصل بيانات من البورد")}
          </p>
        </div>
        <ShieldCheck className="size-5 text-ok" />
      </div>
      <Segmented
        className="mt-3"
        value={(mode ?? "") as SystemMode}
        onChange={(m) => m !== mode && setConfirm({ kind: "mode", mode: m })}
        options={[
          {
            value: "smart",
            label: MODE_LABEL.smart,
            icon: BrainCircuit,
            disabled: !canControl || busy,
          },
          { value: "manual", label: MODE_LABEL.manual, icon: Hand, disabled: !canControl || busy },
        ]}
      />
      {!isAdmin && <p className="mt-2 text-[11px] text-muted">{t("صلاحية المشاهد: عرض فقط.")}</p>}
      {isAdmin && link !== "live" && (
        <p className="mt-2 text-[11px] text-muted">{t("التحكم متاح فقط أثناء اتصال البورد.")}</p>
      )}
      <CommandProgress state={state} onDismiss={reset} />

      {mode === "manual" && (
        <div
          className="mt-4 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, installedSources(status).length)}, minmax(0, 1fr))`,
          }}
        >
          {installedSources(status).map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && status?.system_state !== "no_source";
            const usable = isUsableManually(r);
            const reason = isActive
              ? t("فعّال")
              : usable
                ? outsideSchedule(r)
                  ? t("خارج الوقت")
                  : t("متاح")
                : sourceBadge(r, false).label;
            return (
              <button
                key={id}
                type="button"
                disabled={!canControl || busy || isActive || !usable}
                onClick={() => setConfirm({ kind: "source", source: id })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition disabled:cursor-not-allowed",
                  isActive
                    ? "border-ok bg-ok-soft/60 ring-2 ring-ok/20"
                    : "border-line bg-surface enabled:hover:border-brand-200",
                  !usable && !isActive && "border-dashed opacity-70",
                )}
              >
                <SourceIcon source={id} size="sm" muted={!usable && !isActive} />
                <span className="text-[12px] font-semibold text-ink">{SOURCE_META[id].short}</span>
                <span
                  className={cn(
                    "text-center text-[10px] font-semibold",
                    isActive ? "text-ok-strong" : usable ? "text-muted" : "text-danger",
                  )}
                >
                  {reason}
                </span>
                {!usable && !isActive && r?.v !== null && r?.v !== undefined && (
                  <span className="num text-[10px] text-faint" dir="ltr">
                    {fmtNum(r.v)} V
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === "mode"}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "mode" && confirm.mode === "smart"
            ? t("التحويل إلى الوضع الذكي")
            : t("التحويل إلى الوضع اليدوي")
        }
        icon={confirm?.kind === "mode" && confirm.mode === "smart" ? BrainCircuit : Hand}
        confirmLabel={t("تأكيد")}
        onConfirm={() => {
          if (confirm?.kind === "mode") void send("set_mode", { mode: confirm.mode });
          setConfirm(null);
        }}
      >
        {confirm?.kind === "mode" && confirm.mode === "smart" ? (
          <div className="space-y-3 text-[13px] leading-6 text-ink-2">
            {prediction && prediction !== status?.active_source ? (
              <p className="rounded-2xl border border-warn/30 bg-warn-soft p-3 font-semibold text-warn-strong">
                {t("سيتم التحويل إلى")} {SOURCE_META[prediction].name}{" "}
                {t(
                  "فوراً، لأنه المصدر الأعلى أولوية المتاح حالياً (مع مراعاة شروط التحويل الآمن في البورد).",
                )}
              </p>
            ) : prediction ? (
              <p className="rounded-2xl bg-canvas p-3">
                {t("سيبقى النظام على")} {SOURCE_META[prediction].name}{" "}
                {t("لأنه الأعلى أولوية المتاح.")}
              </p>
            ) : (
              <p className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-danger-strong">
                {t("لا يوجد مصدر مؤهَّل حالياً. سينتقل البورد إلى أول مصدر يصبح صالحاً حسب الأولوية.")}
              </p>
            )}
            <p>
              {t("الترتيب الحالي:")} {priorityText(priority, installedSources(status))}
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-ink-2">
            {t(
              "سيحتفظ البورد بالمصدر الحالي ولن ينتقل حسب الأولوية. الحماية تبقى فعّالة: إذا خرج المصدر المختار عن حدود التشغيل سينقل البورد الحمل وسيُعرض لك تنبيه بذلك.",
            )}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "source"}
        onClose={() => setConfirm(null)}
        title={t("تأكيد التحويل اليدوي")}
        icon={ArrowLeftRight}
        confirmLabel={t("تأكيد التحويل")}
        onConfirm={() => {
          if (confirm?.kind === "source") void send("set_source", { source: confirm.source });
          setConfirm(null);
        }}
      >
        {confirm?.kind === "source" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4 rounded-2xl bg-canvas py-5">
              {status?.active_source ? (
                <SourceIcon source={status.active_source} size="lg" />
              ) : null}
              <span className="text-xl text-faint">{isRtl() ? "←" : "→"}</span>
              <SourceIcon source={confirm.source} size="lg" />
            </div>
            <ul className="space-y-2 rounded-2xl border border-line p-4 text-[12px] leading-6 text-muted">
              <li className="flex gap-2">
                <Zap className="mt-1 size-3.5 shrink-0 text-brand-500" />
                {t("يفصل البورد المصدر الحالي ويتأكد من فتحه، ثم ينتظر مهلة الأمان (")}
                {settings
                  ? t("{0} ث", { 0: fmtNum(settings.neutral_delay_ms / 1000, 1) })
                  : t("حسب الإعدادات")}
                {t(") قبل توصيل المصدر الجديد.")}
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-1 size-3.5 shrink-0 text-ok" />
                {t("يتحقق البورد من جهد وتردد المصدر ويرفض الأمر إذا كان خارج الحدود المضبوطة.")}
              </li>
              {outsideSchedule(status?.sources?.[confirm.source]) && (
                <li className="flex gap-2">
                  <Clock3 className="mt-1 size-3.5 shrink-0 text-solar" />
                  {t(
                    "الطاقة الشمسية خارج وقتها المحدد. التحويل اليدوي مسموح، وستبقى عليها ما دمت في الوضع اليدوي.",
                  )}
                </li>
              )}
            </ul>
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
