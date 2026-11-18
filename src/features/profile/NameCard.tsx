import { Save, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../store/auth";
import { Msg } from "./shared";

export function NameCard({ initial, onSaved }: { initial: string; onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setName(initial), [initial]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (name.trim().length < 3) return setError("أدخل الاسم الكامل");
    setError("");
    setSaving(true);
    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", user.id);
    if (!err) await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSaving(false);
    if (err) setError(errorMessage(err));
    else await onSaved();
  };

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">الاسم</p>
        {error && <Msg text={error} tone="error" />}
        <Field
          label="الاسم الكامل"
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
          حفظ الاسم
        </Button>
      </form>
    </Card>
  );
}
