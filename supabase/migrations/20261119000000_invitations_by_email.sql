-- =====================================================================
-- Smart ATS — migration 3: invitations found by the signed-in email
--
-- Run ONCE in Supabase → SQL Editor after migration 2. Safe to re-run.
--
-- With Google sign-in the invitee may never open the invitation email: they
-- just sign in with the invited address. These functions let a signed-in user
-- see and accept the pending invitations sent to their *verified* email, so
-- an invitation never depends on the email being delivered. The email link
-- (token) keeps working as before.
-- =====================================================================

-- The caller's email, only when Supabase has verified it (Google sign-in, or
-- a confirmed email/password account). Never trust an unverified address.
create or replace function public._verified_email()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
$$;

create or replace function public.my_invitations()
returns table (
  id uuid,
  device_id text,
  device_name text,
  role text,
  inviter_name text,
  expires_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id, i.device_id, coalesce(nullif(d.name, ''), d.id), i.role,
         nullif(p.full_name, ''), i.expires_at
  from public.invitations i
  join public.devices d on d.id = i.device_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public._verified_email()
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    and not exists (
      select 1 from public.device_members m where m.device_id = i.device_id and m.user_id = auth.uid())
  order by i.created_at desc
$$;

create or replace function public.accept_my_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public._verified_email();
  v_inv public.invitations;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found then raise exception 'INVITATION_INVALID' using errcode = 'P0002'; end if;
  if v_email is null or v_inv.email <> v_email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then raise exception 'INVITATION_EXPIRED' using errcode = '22023'; end if;

  insert into public.device_members (device_id, user_id, role, added_by)
  values (v_inv.device_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (device_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_inv.device_id, now(), 'app', 'member_added', v_uid,
          jsonb_build_object('user_id', v_uid, 'role', v_inv.role, 'via', 'invitation'));
  return jsonb_build_object('ok', true, 'device_id', v_inv.device_id, 'role', v_inv.role);
end $$;

revoke execute on function public._verified_email() from public, anon, authenticated;
revoke execute on function public.my_invitations() from public, anon;
revoke execute on function public.accept_my_invitation(uuid) from public, anon;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_my_invitation(uuid) to authenticated;
