import type { Profile } from "../data/types";
import { supabase } from "./client";
import { run } from "./result";

export const getProfile = (userId: string) =>
  run(
    supabase.from("profiles").select("id, email, phone, full_name").eq("id", userId).maybeSingle(),
    (d) => d as Profile | null,
  );

/** Raw variant for schema detection at startup (needs the error object). */
export const probeProfile = (userId: string) =>
  supabase.from("profiles").select("id, email, phone, full_name").eq("id", userId).maybeSingle();

export async function updateName(userId: string, fullName: string) {
  const r = await run(
    supabase.from("profiles").update({ full_name: fullName }).eq("id", userId),
    () => null,
  );
  if (!r.error) await supabase.auth.updateUser({ data: { full_name: fullName } });
  return r;
}
