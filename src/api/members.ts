import type { InvitationRow, MemberRow, Role } from "../data/types";
import { appBaseUrl, supabase } from "./client";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase";
import { run } from "./result";

/** Members of a board, with name and email (members only, enforced in SQL). */
export const listMembers = (deviceId: string) =>
  run(supabase.rpc("list_device_members", { p_device_id: deviceId }), (rows) =>
    rows.map((r): MemberRow => ({
      user_id: r.user_id ?? "",
      role: (r.role ?? "viewer") as Role,
      added_at: r.added_at ?? "",
      is_owner: Boolean(r.is_owner),
      full_name: r.full_name ?? "",
      email: r.email,
    })),
  );

export const listPendingInvitations = (deviceId: string) =>
  run(
    supabase
      .from("invitations")
      .select("id, email, role, created_at, last_sent_at, expires_at, accepted_at, revoked_at")
      .eq("device_id", deviceId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    (rows) => rows as InvitationRow[],
  );

export const setRole = (deviceId: string, userId: string, role: Role) =>
  run(
    supabase.rpc("set_member_role", { p_device_id: deviceId, p_user_id: userId, p_role: role }),
    () => null,
  );

export const removeMember = (deviceId: string, userId: string) =>
  run(supabase.rpc("remove_member", { p_device_id: deviceId, p_user_id: userId }), () => null);

export const transferOwnership = (deviceId: string, userId: string) =>
  run(supabase.rpc("transfer_ownership", { p_device_id: deviceId, p_user_id: userId }), () => null);

export const createInvitation = (deviceId: string, email: string, role: Role) =>
  run(
    supabase.rpc("create_invitation", { p_device_id: deviceId, p_email: email, p_role: role }),
    (d) => d as { id: string; token: string; expires_at: string },
  );

export const resendInvitation = (id: string) =>
  run(
    supabase.rpc("resend_invitation", { p_invitation_id: id }),
    (d) => d as { id: string; email: string; token: string; expires_at: string },
  );

export const revokeInvitation = (id: string) =>
  run(supabase.rpc("revoke_invitation", { p_invitation_id: id }), () => null);

export interface InvitationInfo {
  status: "pending" | "accepted" | "revoked" | "expired" | "invalid";
  device_id?: string;
  device_name?: string;
  role?: Role;
  email?: string;
  inviter_name?: string | null;
  expires_at?: string;
  email_matches?: boolean;
}

export const getInvitation = (token: string) =>
  run(supabase.rpc("get_invitation", { p_token: token }), (d) => d as unknown as InvitationInfo);

/** What an invitation link is for, before sign-in (migration 5). */
export interface InvitationPreview {
  status: InvitationInfo["status"];
  email?: string;
  role?: Role;
  device_name?: string;
  inviter_name?: string | null;
  expires_at?: string;
}

export const previewInvitation = (token: string) =>
  run(
    supabase.rpc("invitation_preview", { p_token: token }),
    (d) => d as unknown as InvitationPreview,
  );

export const acceptInvitation = (token: string) =>
  run(
    supabase.rpc("accept_invitation", { p_token: token }),
    (d) => d as { device_id: string; role: Role },
  );

/** A pending invitation addressed to the signed-in user's verified email. */
export interface MyInvitation {
  id: string;
  device_id: string;
  device_name: string;
  role: Role;
  inviter_name: string | null;
  expires_at: string;
}

/** Invitations for my verified email (no email link needed, e.g. after Google sign-in). */
export const listMyInvitations = () =>
  run(supabase.rpc("my_invitations"), (rows) => (rows ?? []) as unknown as MyInvitation[]);

export const acceptMyInvitation = (id: string) =>
  run(
    supabase.rpc("accept_my_invitation", { p_invitation_id: id }),
    (d) => d as { device_id: string; role: Role },
  );

// Isolated, non-persistent client used only to email invitation links, so it
// can never touch the signed-in admin's session storage.
const inviteMailer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "implicit",
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "smart-ats-invite-mailer",
  },
});

/** Emails a one-time sign-in link that lands on the invitation screen. */
export const sendInvitationEmail = (email: string, token: string) =>
  run(
    inviteMailer.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appBaseUrl()}?invite=${encodeURIComponent(token)}`,
        shouldCreateUser: true,
      },
    }),
    () => null,
  );
