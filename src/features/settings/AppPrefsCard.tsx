import { Monitor, Moon, Sun } from "lucide-react";
import { Card, Segmented } from "../../components/ui";
import type { DigitStyle, ThemePref } from "../../lib/prefs";
import { usePrefs } from "../../store/prefs";

/** Theme and digit style for this phone or browser (not the account). */
export function AppPrefsCard() {
  const { theme, digits, setTheme, setDigits } = usePrefs();
  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink">المظهر</p>
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "تلقائي", icon: Monitor },
            { value: "light", label: "فاتح", icon: Sun },
            { value: "dark", label: "داكن", icon: Moon },
          ]}
        />
        <p className="mt-1.5 text-[11px] text-muted">«تلقائي» يتبع إعداد الوضع الداكن في هاتفك.</p>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink">الأرقام</p>
        {/* data-latin: the "123" choice must stay Western to show the difference. */}
        <div data-latin>
          <Segmented<DigitStyle>
            value={digits}
            onChange={setDigits}
            options={[
              { value: "latn", label: "123" },
              { value: "arab", label: "١٢٣" },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}
