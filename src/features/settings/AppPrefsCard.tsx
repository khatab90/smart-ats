import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { Card, Segmented } from "../../components/ui";
import type { Lang } from "../../i18n";
import { t } from "../../i18n";
import type { ThemePref } from "../../lib/prefs";
import { usePrefs } from "../../store/prefs";

/** Theme and language for this phone or browser (not the account). */
export function AppPrefsCard() {
  const { theme, lang, setTheme, setLang } = usePrefs();
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
          onChange={setLang}
          options={[
            { value: "ar", label: "العربية" },
            { value: "en", label: "English" },
          ]}
        />
      </div>
    </Card>
  );
}
