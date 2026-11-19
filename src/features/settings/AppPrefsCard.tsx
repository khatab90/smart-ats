import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Card, ConfirmDialog, Segmented } from "../../components/ui";
import type { Lang } from "../../i18n";
import { t } from "../../i18n";
import type { ThemePref } from "../../lib/prefs";
import { usePrefs } from "../../store/prefs";

/** Theme and language for this phone or browser (not the account). */
const LANG_NAME: Record<Lang, string> = { ar: "العربية", en: "English" };
/** Said in the new language too, so the choice is clear to a reader of either. */
const RELOAD_IN: Record<Lang, string> = {
  ar: "سيُعاد تحميل التطبيق باللغة العربية.",
  en: "The app will reload in English.",
};

export function AppPrefsCard() {
  const { theme, lang, setTheme, setLang } = usePrefs();
  const [pending, setPending] = useState<Lang | null>(null);
  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink">{t("المظهر")}</p>
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: t("تلقائي"), icon: Monitor },
            { value: "light", label: t("فاتح"), icon: Sun },
            { value: "dark", label: t("داكن"), icon: Moon },
          ]}
        />
        <p className="mt-1.5 text-[11px] text-muted">
          {t("«تلقائي» يتبع إعداد الوضع الداكن في هاتفك.")}
        </p>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <Languages className="size-4 text-muted" /> {t("اللغة")}
        </p>
        {/* Each language is named in itself, so it can be found in either. */}
        <Segmented<Lang>
          value={lang}
          onChange={(l) => l !== lang && setPending(l)}
          options={[
            { value: "ar", label: LANG_NAME.ar },
            { value: "en", label: LANG_NAME.en },
          ]}
        />
      </div>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        icon={Languages}
        title={t("تغيير اللغة إلى {0}؟", { 0: pending ? LANG_NAME[pending] : "" })}
        confirmLabel={t("تأكيد")}
        onConfirm={() => pending && setLang(pending)}
      >
        {pending && (
          <div className="space-y-1 text-center text-[13px] leading-6 text-ink-2">
            <p>{t("سيُعاد تحميل التطبيق لتطبيق اللغة الجديدة.")}</p>
            <p className="text-muted" dir={pending === "ar" ? "rtl" : "ltr"}>
              {RELOAD_IN[pending]}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
