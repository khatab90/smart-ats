-- Migration 7 — app version requirements.
--
-- An installed app older than the database (for example one that still
-- reads a column a migration removed) used to fail at start with "database
-- not set up". Now the server says which app versions it supports, and the
-- app shows "update required" with a download button instead.
--
-- Release rule (CONTRIBUTING.md): a migration that breaks older apps raises
-- min_app_version in the same migration; latest_app_version is raised with
-- every release so installed apps can offer the update.

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  min_app_version text not null,
  latest_app_version text not null,
  download_url text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

insert into public.app_config (min_app_version, latest_app_version, download_url)
values ('2.11.0', '2.12.0', 'https://github.com/khatab90/smart-ats/releases/latest')
on conflict (id) do update
  set min_app_version = excluded.min_app_version,
      latest_app_version = excluded.latest_app_version,
      download_url = excluded.download_url,
      updated_at = now();

-- Readable before sign-in: an outdated app must be able to say so on the
-- sign-in screen too.
create or replace function public.app_requirements()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
       'min_version', min_app_version,
       'latest_version', latest_app_version,
       'download_url', download_url)
     from public.app_config where id),
    '{}'::jsonb);
$$;
revoke all on function public.app_requirements() from public;
grant execute on function public.app_requirements() to anon, authenticated;
