import { Bell, LogOut, Plus, Router, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import { arCount, initialOf } from "../lib/format";
import { useState } from "react";
import { Badge, Card, ConfirmDialog, Row, RowGroup } from "../components/ui";
import { ROLE_META } from "../data/meta";
import { AppPrefsCard } from "../features/settings/AppPrefsCard";
import { useAuth } from "../store/auth";
import { useActiveDevice, useDevices } from "../store/devices";
import { useNav } from "../store/nav";
import { useNotifications } from "../store/notifications";
import { t, uiStart } from "../i18n";

const DEVICE_COUNT = {
  one: t("جهاز واحد"),
  two: t("جهازان"),
  few: t("أجهزة"),
  many: t("جهازاً"),
  base: t("جهاز"),
};

export function More() {
  const { profile, user, signOut } = useAuth();
  const { memberships } = useDevices();
  const { membership, device } = useActiveDevice();
  const { unreadCount } = useNotifications();
  const { push } = useNav();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="space-y-5 px-5 pt-4 pb-32">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">{t("المزيد")}</h1>

      <Card onClick={() => push("profile")} className="flex items-center gap-3 p-4">
        <span className="flex size-14 items-center justify-center rounded-[20px] bg-brand-800 text-xl font-bold text-white">
          {initialOf(profile?.full_name, user?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">
            {profile?.full_name || t("بدون اسم")}
          </p>
          <p className="truncate text-[12px] text-muted" dir="ltr" style={{ textAlign: uiStart() }}>
            {user?.email}
          </p>
          {membership && (
            <Badge tone="info" className="mt-1.5">
              {membership.isOwner ? t("مالك • ") : ""}
              {ROLE_META[membership.role].label} {t("في")} {device?.name || device?.id}
            </Badge>
          )}
        </div>
      </Card>

      <RowGroup title={t("الأجهزة")}>
        <Row
          icon={Router}
          title={t("أجهزتي")}
          subtitle={
            memberships.length
              ? t("المرتبطة بحسابك: {0}", { 0: arCount(memberships.length, DEVICE_COUNT) })
              : t("لا توجد أجهزة مرتبطة بحسابك")
          }
          onClick={() => push("devices")}
        />
        <Row
          icon={Plus}
          title={t("إضافة جهاز جديد")}
          subtitle={t("بمعرّف الجهاز ورمز PIN")}
          onClick={() => push("addDevice")}
        />
        {device && (
          <Row
            icon={Settings2}
            title={t("إعدادات الجهاز")}
            subtitle={t("الأولوية والحماية والمؤقتات وأوقات الشمسية")}
            onClick={() => push("settings")}
          />
        )}
      </RowGroup>

      <RowGroup title={t("الحساب")}>
        <Row
          icon={UserRound}
          title={t("الملف الشخصي")}
          subtitle={t("الاسم والبريد والهاتف وكلمة المرور")}
          onClick={() => push("profile")}
        />
        {device && (
          <Row
            icon={Users}
            title={t("المستخدمون والصلاحيات")}
            subtitle={t("المسؤولون والمشاهدون والدعوات")}
            onClick={() => push("users")}
          />
        )}
        <Row
          icon={Bell}
          title={t("الإشعارات")}
          subtitle={t("الانقطاع والتحويل والخلل الكهربائي والاتصال")}
          onClick={() => push("notifications")}
          right={unreadCount ? <Badge tone="danger">{unreadCount}</Badge> : undefined}
        />
      </RowGroup>

      <div>
        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">{t("إعدادات التطبيق")}</p>
        <AppPrefsCard />
      </div>

      <button
        type="button"
        onClick={() => setSigningOut(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/20 bg-surface py-3.5 text-[14px] font-bold text-danger transition hover:bg-danger-soft"
      >
        <LogOut className="size-[18px]" /> {t("تسجيل الخروج")}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-faint">
        <ShieldCheck className="size-3.5" /> {t("Smart ATS • الإصدار")} {__APP_VERSION__}
      </p>

      <ConfirmDialog
        open={signingOut}
        onClose={() => setSigningOut(false)}
        icon={LogOut}
        danger
        title={t("تسجيل الخروج؟")}
        confirmLabel={t("تسجيل الخروج")}
        onConfirm={() => {
          setSigningOut(false);
          void signOut();
        }}
      >
        <p className="text-center text-[13px] leading-6 text-ink-2">
          {t("ستحتاج إلى تسجيل الدخول مرة أخرى لمتابعة أجهزتك.")}
        </p>
      </ConfirmDialog>
    </div>
  );
}
