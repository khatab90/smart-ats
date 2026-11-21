import { t } from "../../i18n";

/** Wi-Fi strength in words, from the board's RSSI (dBm). */
export function signalWord(rssi: number | null | undefined): string | null {
  if (rssi === null || rssi === undefined) return null;
  if (rssi > -55) return t("قوية");
  if (rssi > -67) return t("جيدة");
  if (rssi > -75) return t("متوسطة");
  return t("ضعيفة");
}

/** Below this the board's reports may start to drop. */
export const WEAK_SIGNAL_DBM = -78;

/** Why the ESP32 last started (esp_reset_reason). */
const RESET_REASON: Record<string, string> = {
  power_on: t("رجوع الكهرباء للبورد"),
  software: t("إعادة تشغيل من البرنامج"),
  panic: t("خطأ في البرنامج"),
  int_wdt: t("توقف البرنامج (مؤقت الحماية)"),
  task_wdt: t("توقف البرنامج (مؤقت الحماية)"),
  wdt: t("توقف البرنامج (مؤقت الحماية)"),
  brownout: t("انخفاض جهد تغذية البورد"),
  external: t("زر إعادة التشغيل"),
  deep_sleep: t("استيقاظ من السكون"),
};

export const resetReasonText = (r: string | null | undefined) =>
  r ? (RESET_REASON[r] ?? r) : null;
