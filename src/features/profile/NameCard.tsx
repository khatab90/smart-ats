import { Save, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field } from "../../components/ui";
import { updateName } from "../../api/profile";
import { useAuth } from "../../store/auth";
import { Msg } from "./shared";
import { t } from "../../i18n";

export function NameCard({ initial, onSaved }: { initial: string; onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setName(initial), [initial]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (name.trim().length < 3) return setError(t("أدخل الاسم الكامل"));
    setError("");
    setSaving(true);
    const { error: err } = await updateName(user.id, name.trim());
    setSaving(false);
    if (err !== null) setError(err);
    else await onSaved();
  };

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">{t("الاسم")}</p>
        {error && <Msg text={error} tone="error" />}
        <Field
          label={t("الاسم الكامل")}
          icon={User}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          full
          icon={Save}
          loading={saving}
          disabled={name.trim() === initial.trim()}
        >
          {t("حفظ الاسم")}
        </Button>
      </form>
    </Card>
  );
}
