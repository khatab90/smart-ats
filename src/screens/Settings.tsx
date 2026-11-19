import { CircleCheck, Eye, LoaderCircle, Settings2 } from "lucide-react";
import {
  Card,
  EmptyState,
  ErrorState,
  Row,
  RowGroup,
  ScreenHeader,
  Skeleton,
} from "../components/ui";
import { installedSources } from "../domain/sources";
import { SECTION_META } from "../features/settings/sections";
import { sectionSummary } from "../features/settings/summaries";
import { useServerSettings } from "../features/settings/useSettingsForm";
import { fmtDateTime } from "../lib/format";
import { useActiveDevice } from "../store/devices";
import { useNav, type SettingsSection } from "../store/nav";
import { t } from "../i18n";

/** Device settings: a list of sections, each opening its own screen. */
export function Settings() {
  const { device, settings, isAdmin, settingsApplied, status, loading, error, refresh } =
    useActiveDevice();
  const { back, push } = useNav();
  const values = useServerSettings();
  const installed = installedSources(status);

  const row = (s: SettingsSection, warn = false) => {
    const meta = SECTION_META[s];
    return (
      <Row
        key={s}
        icon={meta.icon}
        iconClass={warn ? "bg-warn-soft text-warn-strong" : meta.iconClass}
        title={meta.title}
        subtitle={values ? sectionSummary(s, values, installed) : undefined}
        onClick={() => push(`settings.${s}`)}
      />
    );
  };

  return (
    <div className="pb-10">
      <ScreenHeader
        title={t("إعدادات الجهاز")}
        subtitle={device ? device.name || device.id : undefined}
        onBack={back}
      />
      <div className="space-y-5 px-5">
        {!device ? (
          <EmptyState icon={Settings2} title={t("لا يوجد جهاز")} body={t("أضف جهازاً أولاً.")} />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading || !values || !settings ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <Card className="flex items-center gap-3 p-4">
              {settingsApplied ? (
                <CircleCheck className="size-5 shrink-0 text-ok" />
              ) : (
                <LoaderCircle className="size-5 shrink-0 animate-spin text-warn" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {settingsApplied ? t("الإعدادات مطبَّقة على البورد") : t("بانتظار تأكيد البورد")}
                </p>
                <p className="num text-[11px] text-muted">
                  {t("الإصدار {0} • آخر تعديل {1}", {
                    0: settings.version,
                    1: fmtDateTime(Date.parse(settings.updated_at), settings.timezone),
                  })}
                </p>
              </div>
            </Card>

            {!isAdmin && (
              <p className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-[12px] text-muted">
                <Eye className="size-4 shrink-0" />
                {t("صلاحيتك «مشاهد»: الإعدادات للعرض فقط.")}
              </p>
            )}

            <RowGroup title={t("التشغيل")}>
              {row("priority")}
              {installed.includes("solar") && row("solar")}
              {row("manual")}
            </RowGroup>

            <RowGroup title={t("الحماية الكهربائية")}>
              {row("nominal", !values.nominal_voltage || !values.nominal_frequency)}
              {row("voltage")}
              {row("frequency")}
              {row("timers")}
            </RowGroup>

            <RowGroup title={t("عام")}>{row("timezone")}</RowGroup>
          </>
        )}
      </div>
    </div>
  );
}
