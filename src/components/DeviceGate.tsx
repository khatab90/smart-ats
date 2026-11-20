import { Clock3, Plus, Router, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, EmptyState } from "./ui";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { t, uiStart } from "../i18n";

/**
 * The two states every device screen shares, so each tab looks and reads the
 * same before there is anything to show:
 *  - no board linked to the account (offer to add one);
 *  - a board linked that has never reported (show what to check).
 * Offline boards are not gated: their screens show the last known data with
 * a banner, because that data is still useful.
 */

/** Tab title and subtitle, kept on gated screens so the user knows where they are. */
export function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
      <p className="text-[13px] text-muted">{subtitle}</p>
    </div>
  );
}

/** No board linked to this account. `body` says what this screen would show. */
export function NoDevice({ icon = Router, body }: { icon?: LucideIcon; body: string }) {
  const { push } = useNav();
  return (
    <Card className="pt-2">
      <EmptyState
        icon={icon}
        title={t("لا يوجد جهاز مرتبط بحسابك")}
        body={body}
        action={
          <Button icon={Plus} onClick={() => push("addDevice")}>
            {t("إضافة جهاز")}
          </Button>
        }
      />
    </Card>
  );
}

/** True once the active board has loaded and has never sent a reading. */
export function useAwaitingFirstData(): boolean {
  const { device, loading, status, link } = useActiveDevice();
  return Boolean(device) && !(loading && !status) && link === "never";
}

/** A linked board that has not reported yet: what to check, with its ID. */
export function WaitingForBoard({
  compact,
  children,
}: {
  compact?: boolean;
  children?: ReactNode;
}) {
  const { device } = useActiveDevice();
  const steps = [
    t("وصّل البورد بالكهرباء وانتظر دقيقة حتى يقلع."),
    t("تأكد أنه متصل بشبكة Wi-Fi فيها إنترنت."),
    t("تأكد أن معرّف الجهاز المبرمج في البورد هو نفسه المعروض هنا."),
  ];
  if (compact) {
    return (
      <Card className="pt-2">
        <EmptyState
          icon={Clock3}
          title={t("بانتظار أول بيانات من البورد")}
          body={t(
            "تظهر هنا البيانات تلقائياً بعد أول اتصال للبورد. راجع خطوات التشغيل في الرئيسية.",
          )}
        />
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Clock3 className="size-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-ink">{t("بانتظار أول بيانات من البورد")}</h3>
          <p className="mt-1 text-[13px] leading-6 text-muted">
            {t("الجهاز مضاف إلى حسابك، لكن لم تصل منه أي قراءة بعد. ستظهر الحالة هنا تلقائياً.")}
          </p>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 rounded-2xl bg-canvas px-3.5 py-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-[13px] leading-6 text-ink">{s}</span>
          </li>
        ))}
      </ol>
      {device && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-line px-3.5 py-2.5">
          <span className="text-[12px] text-muted">{t("معرّف الجهاز")}</span>
          <span
            className="num text-[14px] font-bold text-ink"
            dir="ltr"
            style={{ textAlign: uiStart() }}
          >
            {device.id}
          </span>
        </div>
      )}
      {children}
    </Card>
  );
}
