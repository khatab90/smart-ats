-- Migration 10 — release 2.15.0: the sign-in screens can tell "no account",
-- "not confirmed yet" and "account without a password" apart, so they say
-- what to do instead of a bare "email or password incorrect".
--
-- Trade-off: anyone can learn whether an email has an account. Supabase's own
-- sign-up already reveals this, and the app needs it to guide people; nothing
-- else about the account is returned.

create or replace function public.account_status(p_email text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
        'status', case when u.email_confirmed_at is null then 'unconfirmed' else 'ready' end,
        'password', coalesce(u.encrypted_password, '') <> '',
        'google', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google')
     from auth.users u
     where lower(u.email) = lower(btrim(coalesce(p_email, '')))
     limit 1),
    jsonb_build_object('status', 'none'));
$$;

revoke all on function public.account_status(text) from public;
grant execute on function public.account_status(text) to anon, authenticated;

update public.app_config set latest_app_version = '2.15.0', updated_at = now() where id;
