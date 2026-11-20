-- Migration 5 — invitation preview before sign-in.
--
-- Opening an invitation link on a phone that is signed out used to show only
-- "you have an invitation; sign in with the invited email", without saying
-- which email. People then signed in with another address and were refused
-- after the fact. invitation_preview tells the sign-in screen who invited
-- whom to which system, so it can name the invited email, fill it in and
-- warn before a different one is used.
--
-- Callable without a session. It reveals only what the invitation email
-- itself shows, and only to someone holding the unguessable token from that
-- email. Accepting still requires signing in with the invited, verified
-- email (accept_invitation is unchanged).

create or replace function public.invitation_preview(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  select i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
         coalesce(nullif(d.name, ''), d.id) as device_name, p.full_name as inviter_name
  into v_row
  from public.invitations i
  join public.devices d on d.id = i.device_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = public._sha256_hex(coalesce(p_token, ''));
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_row.accepted_at is not null then return jsonb_build_object('status', 'accepted'); end if;
  if v_row.revoked_at is not null then return jsonb_build_object('status', 'revoked'); end if;
  if v_row.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  return jsonb_build_object(
    'status', 'pending',
    'email', v_row.email,
    'role', v_row.role,
    'device_name', v_row.device_name,
    'inviter_name', v_row.inviter_name,
    'expires_at', v_row.expires_at);
end $$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;
