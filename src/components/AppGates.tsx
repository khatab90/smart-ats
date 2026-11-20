import { CloudAlert, Download, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./ui";
import { Logo } from "./Shell";
import { openInBrowser } from "../platform/native";
import { useAppVersion } from "../store/appVersion";
import { useAuth } from "../store/auth";
import { t } from "../i18n";

/** Full-screen states shown instead of the app when it cannot run normally. */
function Gate({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="no-scrollbar flex h-full flex-col items-center justify-center overflow-y-auto px-8 py-10 text-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">{icon}</div>
        <h1 className="mt-5 text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-[14px] leading-7 text-muted">{body}</p>
        <div className="mt-7 space-y-3">{children}</div>
      </div>
    </div>
  );
}

/** This installed version is older than the server supports. */
export function UpdateRequired() {
  const { current, requirements, recheck } = useAppVersion();
  const { refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  const url = requirements?.download_url;
  return (
    <Gate
      icon={<Logo size={64} />}
      title={t("يلزم تحديث التطبيق")}
      body={t(
        "هذا الإصدار ({0}) لم يعد يعمل مع الخادم. نزّل الإصدار الأحدث وثبّته فوق الحالي؛ حسابك وأجهزتك تبقى كما هي.",
        { 0: current },
      )}
    >
      {url && (
        <Button full size="lg" icon={Download} onClick={() => void openInBrowser(url)}>
          {requirements?.latest_version
            ? t("تحميل الإصدار {0}", { 0: requirements.latest_version })
            : t("تحميل التحديث")}
        </Button>
      )}
      <Button
        full
        variant="ghost"
        icon={RefreshCw}
        loading={checking}
        onClick={async () => {
          setChecking(true);
          await Promise.all([recheck(), refreshProfile()]);
          setChecking(false);
        }}
      >
        {t("إعادة التحقق")}
      </Button>
    </Gate>
  );
}

/** The server answers but the app's data is not there (maintenance, a broken setup). */
export function ServerNotReady() {
  const { refreshProfile, signOut } = useAuth();
  return (
    <Gate
      icon={
        <span className="flex size-16 items-center justify-center rounded-3xl bg-warn-soft text-warn">
          <CloudAlert className="size-7" />
        </span>
      }
      title={t("الخدمة غير متاحة حالياً")}
      body={t("تعذر الوصول إلى بيانات التطبيق على الخادم. حاول مرة أخرى بعد قليل.")}
    >
      <Button full size="lg" icon={RefreshCw} onClick={() => void refreshProfile()}>
        {t("إعادة المحاولة")}
      </Button>
      <Button full variant="ghost" onClick={() => void signOut()}>
        {t("تسجيل الخروج")}
      </Button>
    </Gate>
  );
}
