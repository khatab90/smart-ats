import { ScreenHeader } from "../components/ui";
import { EmailCard } from "../features/profile/EmailCard";
import { NameCard } from "../features/profile/NameCard";
import { PasswordCard } from "../features/profile/PasswordCard";
import { PhoneCard } from "../features/profile/PhoneCard";
import { useAuth } from "../store/auth";
import { useNav, type ProfileSection } from "../store/nav";
import { useToast } from "../store/toast";
import { t } from "../i18n";

const TITLE: Record<ProfileSection, string> = {
  name: t("الاسم"),
  email: t("البريد الإلكتروني"),
  phone: t("رقم الهاتف"),
  password: t("كلمة المرور"),
};

/** One profile item on its own screen. */
export function ProfileSectionScreen({ section }: { section: ProfileSection }) {
  const { profile, refreshProfile } = useAuth();
  const { back } = useNav();
  const { pushToast } = useToast();
  return (
    <div className="pb-10">
      <ScreenHeader title={TITLE[section]} onBack={back} />
      <div className="px-5">
        {section === "name" && (
          <NameCard
            initial={profile?.full_name ?? ""}
            onSaved={async () => {
              await refreshProfile();
              pushToast({ kind: "success", title: t("تم حفظ الاسم") });
              back();
            }}
          />
        )}
        {section === "email" && <EmailCard />}
        {section === "phone" && <PhoneCard onVerified={refreshProfile} />}
        {section === "password" && <PasswordCard />}
      </div>
    </div>
  );
}
