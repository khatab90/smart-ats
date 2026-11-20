-- Migration 6 — phone numbers removed.
--
-- The app no longer asks for or shows a phone number (no SMS verification,
-- no phone on profiles or in the members list). Accounts are identified by
-- their verified email only. Existing numbers in profiles are deleted;
-- auth.users keeps whatever Supabase Auth stores, unused by the app.

-- Profiles mirror the verified email and the name only.
create or replace function public._sync_profile_from_auth()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
  after insert or update of email on auth.users
  for each row execute function public._sync_profile_from_auth();

-- The members list loses its phone column (a new return type needs a drop).
drop function if exists public.list_device_members(text);
create function public.list_device_members(p_device_id text)
returns table (
  user_id uuid, role text, added_at timestamptz, is_owner boolean,
  full_name text, email text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_device_member(p_device_id) then
    raise exception 'NOT_MEMBER' using errcode = '42501';
  end if;
  return query
  select m.user_id, m.role, m.added_at, (d.owner_id = m.user_id),
         p.full_name, p.email
  from public.device_members m
  join public.devices d on d.id = m.device_id
  join public.profiles p on p.id = m.user_id
  where m.device_id = p_device_id
  order by m.added_at;
end $$;
revoke all on function public.list_device_members(text) from public;
grant execute on function public.list_device_members(text) to authenticated;

alter table public.profiles drop column if exists phone;
