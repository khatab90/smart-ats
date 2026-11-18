-- =====================================================================
-- Smart ATS — database schema (protocol v1)
--
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE.
--
-- Data ownership:
--   * ESP32 boards are the only source of electrical readings, states and
--     device events. They write through the device_* RPC functions below,
--     authenticated by a per-device secret token (never the service role).
--   * The app reads through Row Level Security and writes only what users
--     own (profile, preferences, settings) or through checked RPCs.
--   * No demo / simulated rows are inserted by this migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public._sha256_hex(p text)
returns text language sql immutable strict
set search_path = pg_catalog
as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

create or replace function public._random_hex(p_uuids int default 2)
returns text language sql volatile
set search_path = pg_catalog
as $$
  select string_agg(replace(gen_random_uuid()::text, '-', ''), '')
  from generate_series(1, greatest(p_uuids, 1))
$$;

create or replace function public._safe_ts(p text)
returns timestamptz language plpgsql stable
set search_path = pg_catalog
as $$
begin
  if p is null or p = '' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public._source_name(p text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case p
    when 'grid' then 'الشبكة الوطنية'
    when 'solar' then 'الطاقة الشمسية'
    when 'generator' then 'المولد'
    else 'مصدر غير معروف' end
$$;

-- ---------------------------------------------------------------------
-- Profiles (mirrors verified auth fields)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public._sync_profile_from_auth()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    lower(new.email),
    nullif(new.phone, ''),
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
  after insert or update of email, phone on auth.users
  for each row execute function public._sync_profile_from_auth();

-- Backfill profiles for users created before this migration.
insert into public.profiles (id, email, phone, full_name)
select u.id, lower(u.email), nullif(u.phone, ''), coalesce(left(u.raw_user_meta_data ->> 'full_name', 120), '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------
create table if not exists public.devices (
  id text primary key check (id ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  environment text not null default 'production' check (environment in ('production', 'test')),
  name text not null default '' check (char_length(name) <= 60),
  location text check (location is null or char_length(location) <= 120),
  owner_id uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  firmware text,
  hardware_rev text,
  created_at timestamptz not null default now()
);

-- Secrets live apart from devices so no client role can ever read them.
create table if not exists public.device_secrets (
  device_id text primary key references public.devices (id) on delete cascade,
  token_hash text not null,
  pin_hash text not null,
  failed_claims int not null default 0,
  locked_until timestamptz
);

create table if not exists public.device_members (
  device_id text not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
create index if not exists device_members_user_idx on public.device_members (user_id);

-- Latest state reported by the board (one row per device).
create table if not exists public.device_status (
  device_id text primary key references public.devices (id) on delete cascade,
  online boolean not null default false,
  last_seen_at timestamptz,
  device_ts timestamptz,
  seq bigint,
  protocol_version int,
  interval_ms int check (interval_ms is null or interval_ms between 200 and 60000),
  mode text check (mode in ('smart', 'manual')),
  mode_since timestamptz,
  system_state text check (system_state in ('normal', 'transferring', 'no_source', 'lockout')),
  active_source text check (active_source in ('grid', 'solar', 'generator')),
  active_since timestamptz,
  sources jsonb,
  load jsonb,
  contactors jsonb,
  alarms jsonb not null default '[]'::jsonb,
  override jsonb,
  config_version int,
  controller jsonb,
  rssi int,
  energy_wh jsonb,
  runtime jsonb,
  updated_at timestamptz not null default now()
);

-- Raw readings for live charts (pruned after a few days).
create table if not exists public.telemetry (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices (id) on delete cascade,
  device_ts timestamptz not null,
  received_at timestamptz not null default now(),
  seq bigint,
  active_source text,
  system_state text,
  load_voltage real,
  load_current real,
  load_power_w real,
  load_frequency real,
  grid_voltage real,
  grid_frequency real,
  solar_voltage real,
  solar_frequency real,
  generator_voltage real,
  generator_frequency real
);
create index if not exists telemetry_device_ts_idx on public.telemetry (device_id, device_ts desc);

-- Server-side hourly aggregation of the board's per-source energy counters.
create table if not exists public.energy_hourly (
  device_id text not null references public.devices (id) on delete cascade,
  hour_start timestamptz not null,
  source text not null check (source in ('grid', 'solar', 'generator')),
  wh double precision not null default 0 check (wh >= 0),
  primary key (device_id, hour_start, source)
);

-- Unified, numbered event log. Every event is always stored.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices (id) on delete cascade,
  seq bigint,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  origin text not null check (origin in ('device', 'server', 'app')),
  type text not null check (type in (
    -- reported by the board
    'source_lost', 'source_restored',
    'transfer_started', 'transfer_completed', 'transfer_failed',
    'no_source_started', 'no_source_ended',
    'electrical_fault', 'electrical_fault_cleared',
    'interlock_fault', 'transfer_lockout', 'protection_override',
    'mode_changed', 'controller_restarted',
    'settings_applied', 'settings_rejected', 'runtime_reset',
    -- recorded by the server / app actions
    'connection_lost', 'connection_restored',
    'command_sent', 'command_result',
    'settings_changed',
    'device_claimed', 'device_released',
    'member_added', 'member_removed', 'role_changed', 'ownership_transferred',
    'invitation_sent', 'invitation_revoked'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  source text check (source in ('grid', 'solar', 'generator')),
  from_source text check (from_source in ('grid', 'solar', 'generator')),
  to_source text check (to_source in ('grid', 'solar', 'generator')),
  actor_id uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb
);
create unique index if not exists events_device_seq_uidx on public.events (device_id, seq) where seq is not null;
create index if not exists events_device_time_idx on public.events (device_id, occurred_at desc);

-- Device configuration (validated here and again by the board).
create table if not exists public.device_settings (
  device_id text primary key references public.devices (id) on delete cascade,
  version int not null default 1,
  priority text[] not null default array['grid', 'solar', 'generator']
    check (cardinality(priority) = 3 and priority @> array['grid', 'solar', 'generator']),
  nominal_voltage int check (nominal_voltage in (220, 230, 240)),
  nominal_frequency int check (nominal_frequency in (50, 60)),
  uv_trip_pct numeric(4, 1) not null default 17 check (uv_trip_pct between 5 and 30),
  uv_recover_pct numeric(4, 1) not null default 13 check (uv_recover_pct between 2 and 29),
  uv_delay_ms int not null default 2000 check (uv_delay_ms between 100 and 30000),
  ov_trip_pct numeric(4, 1) not null default 10 check (ov_trip_pct between 3 and 25),
  ov_recover_pct numeric(4, 1) not null default 8 check (ov_recover_pct between 1 and 24),
  ov_delay_ms int not null default 500 check (ov_delay_ms between 50 and 10000),
  uf_trip_pct numeric(4, 1) not null default 4 check (uf_trip_pct between 1 and 10),
  of_trip_pct numeric(4, 1) not null default 4 check (of_trip_pct between 1 and 10),
  f_recover_pct numeric(4, 1) not null default 2 check (f_recover_pct between 0.5 and 9),
  f_delay_ms int not null default 1000 check (f_delay_ms between 100 and 30000),
  return_delay_s int not null default 120 check (return_delay_s between 30 and 1800),
  min_dwell_s int not null default 60 check (min_dwell_s between 0 and 1800),
  rate_limit_count int not null default 6 check (rate_limit_count between 2 and 30),
  rate_limit_window_min int not null default 10 check (rate_limit_window_min between 1 and 120),
  neutral_delay_ms int not null default 1000 check (neutral_delay_ms between 500 and 3000),
  transfer_timeout_ms int not null default 5000 check (transfer_timeout_ms between 1000 and 30000),
  gen_crank_attempts int not null default 3 check (gen_crank_attempts between 1 and 6),
  gen_warmup_s int not null default 30 check (gen_warmup_s between 0 and 600),
  gen_cooldown_s int not null default 180 check (gen_cooldown_s between 0 and 1800),
  grid_capacity_kw numeric(7, 2) check (grid_capacity_kw is null or grid_capacity_kw > 0),
  solar_capacity_kw numeric(7, 2) check (solar_capacity_kw is null or solar_capacity_kw > 0),
  generator_capacity_kw numeric(7, 2) check (generator_capacity_kw is null or generator_capacity_kw > 0),
  max_current_a numeric(6, 1) check (max_current_a is null or max_current_a > 0),
  manual_revert_min int check (manual_revert_min is null or manual_revert_min between 5 and 1440),
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint settings_uv_band check (uv_recover_pct < uv_trip_pct),
  constraint settings_ov_band check (ov_recover_pct < ov_trip_pct),
  constraint settings_f_band check (f_recover_pct < least(uf_trip_pct, of_trip_pct)),
  constraint settings_timezone check (now() at time zone timezone is not null)
);

-- Command queue with a full lifecycle (A8).
create table if not exists public.device_commands (
  id uuid primary key,
  device_id text not null references public.devices (id) on delete cascade,
  type text not null check (type in ('set_mode', 'set_source', 'reset_runtime')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending', 'delivered', 'accepted', 'executing', 'completed', 'rejected', 'failed', 'expired')),
  result jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists device_commands_device_idx on public.device_commands (device_id, status, created_at);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('admin', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index if not exists invitations_device_idx on public.invitations (device_id);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  transfer boolean not null default true,
  electrical_fault boolean not null default true,
  connection_lost boolean not null default true,
  sound boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id text not null references public.devices (id) on delete cascade,
  event_id bigint references public.events (id) on delete set null,
  type text not null check (type in (
    'source_outage', 'transfer', 'electrical_fault', 'connection_lost', 'transfer_failed')),
  critical boolean not null default false,
  title text not null,
  body text not null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_dedupe_idx on public.notifications (user_id, device_id, dedupe_key, created_at desc);

-- ---------------------------------------------------------------------
-- Membership helpers (used by RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_device_member(p_device text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.device_members m where m.device_id = p_device and m.user_id = auth.uid())
$$;

create or replace function public.is_device_admin(p_device text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.device_members m
    where m.device_id = p_device and m.user_id = auth.uid() and m.role = 'admin')
$$;

create or replace function public.is_device_owner(p_device text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.devices d where d.id = p_device and d.owner_id = auth.uid())
$$;

create or replace function public.shares_device_with(p_user uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.device_members a
    join public.device_members b on a.device_id = b.device_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.device_secrets enable row level security;
alter table public.device_members enable row level security;
alter table public.device_status enable row level security;
alter table public.telemetry enable row level security;
alter table public.energy_hourly enable row level security;
alter table public.events enable row level security;
alter table public.device_settings enable row level security;
alter table public.device_commands enable row level security;
alter table public.invitations enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- Start from zero privileges for client roles, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.devices to authenticated;
grant update (name, location) on public.devices to authenticated;
grant select on public.device_members to authenticated;
grant select on public.device_status to authenticated;
grant select on public.telemetry to authenticated;
grant select on public.energy_hourly to authenticated;
grant select on public.events to authenticated;
grant select on public.device_settings to authenticated;
grant update (
  priority, nominal_voltage, nominal_frequency,
  uv_trip_pct, uv_recover_pct, uv_delay_ms, ov_trip_pct, ov_recover_pct, ov_delay_ms,
  uf_trip_pct, of_trip_pct, f_recover_pct, f_delay_ms,
  return_delay_s, min_dwell_s, rate_limit_count, rate_limit_window_min,
  neutral_delay_ms, transfer_timeout_ms,
  gen_crank_attempts, gen_warmup_s, gen_cooldown_s,
  grid_capacity_kw, solar_capacity_kw, generator_capacity_kw, max_current_a,
  manual_revert_min, timezone
) on public.device_settings to authenticated;
grant select on public.device_commands to authenticated;
grant select (id, device_id, email, role, invited_by, created_at, last_sent_at, expires_at,
  accepted_at, accepted_by, revoked_at) on public.invitations to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_device_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices for select to authenticated
  using (public.is_device_member(id));
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated
  using (public.is_device_admin(id)) with check (public.is_device_admin(id));

drop policy if exists members_select on public.device_members;
create policy members_select on public.device_members for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists status_select on public.device_status;
create policy status_select on public.device_status for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists telemetry_select on public.telemetry;
create policy telemetry_select on public.telemetry for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists energy_select on public.energy_hourly;
create policy energy_select on public.energy_hourly for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists settings_select on public.device_settings;
create policy settings_select on public.device_settings for select to authenticated
  using (public.is_device_member(device_id));
drop policy if exists settings_update on public.device_settings;
create policy settings_update on public.device_settings for update to authenticated
  using (public.is_device_admin(device_id)) with check (public.is_device_admin(device_id));

drop policy if exists commands_select on public.device_commands;
create policy commands_select on public.device_commands for select to authenticated
  using (public.is_device_member(device_id));

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_device_admin(device_id));

drop policy if exists prefs_select on public.notification_preferences;
create policy prefs_select on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
drop policy if exists prefs_insert on public.notification_preferences;
create policy prefs_insert on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists prefs_update on public.notification_preferences;
create policy prefs_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Triggers: settings versioning + audit, notifications from events
-- ---------------------------------------------------------------------
create or replace function public._settings_before_update()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.device_id := old.device_id;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public._settings_after_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_changed jsonb;
begin
  select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.key not in ('version', 'updated_at', 'updated_by')
    and (to_jsonb(old) -> n.key) is distinct from n.value;
  insert into public.events (device_id, occurred_at, origin, type, severity, actor_id, data)
  values (new.device_id, now(), 'app', 'settings_changed', 'info', auth.uid(),
          jsonb_build_object('version', new.version, 'changed', v_changed));
  return new;
end $$;

drop trigger if exists settings_before_update on public.device_settings;
create trigger settings_before_update before update on public.device_settings
  for each row execute function public._settings_before_update();
drop trigger if exists settings_after_update on public.device_settings;
create trigger settings_after_update after update on public.device_settings
  for each row execute function public._settings_after_update();

create or replace function public._fault_label(p_kind text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case p_kind
    when 'undervoltage' then 'انخفاض الجهد'
    when 'overvoltage' then 'ارتفاع الجهد'
    when 'underfrequency' then 'انخفاض التردد'
    when 'overfrequency' then 'ارتفاع التردد'
    when 'unstable' then 'تحويلات متكررة بسبب عدم الاستقرار'
    else 'خروج عن حدود التشغيل' end
$$;

-- Maps the unified event log onto the five user notification types.
-- Preferences only affect delivery; the event row itself is always kept.
create or replace function public._events_notify()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_title text;
  v_body text;
  v_critical boolean := false;
  v_key text;
  v_window interval := interval '10 minutes';
  v_device text;
  v_value text;
begin
  select coalesce(nullif(d.name, ''), d.id) into v_device from public.devices d where d.id = new.device_id;
  v_value := new.data ->> 'value';

  if new.type = 'source_lost' and coalesce((new.data ->> 'was_active')::boolean, false) then
    v_type := 'source_outage'; v_critical := true;
    v_title := 'انقطاع المصدر الحالي';
    v_body := format('انقطع %s الذي يغذي الأحمال في «%s».', public._source_name(new.source), v_device);
    v_key := 'outage:' || coalesce(new.source, '-');
  elsif new.type = 'no_source_started' then
    v_type := 'source_outage'; v_critical := true;
    v_title := 'لا يوجد مصدر متاح';
    v_body := format('الأحمال في «%s» بدون كهرباء: لا يوجد أي مصدر صالح للتشغيل.', v_device);
    v_key := 'no_source';
  elsif new.type = 'transfer_completed' then
    v_type := 'transfer';
    v_title := 'تحويل بين المصادر';
    v_body := format('تم التحويل من %s إلى %s في «%s».',
      case when new.from_source is null then 'لا يوجد مصدر' else public._source_name(new.from_source) end,
      public._source_name(new.to_source), v_device);
    v_key := 'transfer:' || coalesce(new.from_source, '-') || '>' || coalesce(new.to_source, '-');
    v_window := interval '1 minute';
  elsif new.type in ('electrical_fault', 'transfer_lockout') then
    v_type := 'electrical_fault';
    v_title := 'خلل كهربائي';
    v_body := format('%s في %s%s («%s»).',
      public._fault_label(case when new.type = 'transfer_lockout' then 'unstable' else new.data ->> 'kind' end),
      case when new.source is null then 'النظام' else public._source_name(new.source) end,
      case when v_value is null then '' else ': ' || v_value end,
      v_device);
    v_key := 'fault:' || coalesce(new.source, '-') || ':' || coalesce(new.data ->> 'kind', new.type);
  elsif new.type = 'connection_lost' then
    v_type := 'connection_lost';
    v_title := 'انقطاع الاتصال بالبورد';
    v_body := format('لم تصل بيانات من جهاز «%s» منذ أكثر من 30 ثانية.', v_device);
    v_key := 'connection';
  elsif new.type in ('transfer_failed', 'interlock_fault') then
    v_type := 'transfer_failed'; v_critical := true;
    v_title := case when new.type = 'interlock_fault' then 'فشل التحويل: عطل القفل المتبادل' else 'فشل عملية التحويل' end;
    v_body := case when new.type = 'interlock_fault'
      then format('عدم تطابق بين أمر الكونتاكتور وحالته الفعلية في «%s». تم قفل النظام.', v_device)
      else format('تعذر الانتقال إلى %s في «%s».', public._source_name(new.to_source), v_device) end;
    v_key := 'transfer_failed:' || new.type || ':' || coalesce(new.to_source, '-');
  else
    return new;
  end if;

  insert into public.notifications (user_id, device_id, event_id, type, critical, title, body, dedupe_key)
  select m.user_id, new.device_id, new.id, v_type, v_critical, v_title, v_body, v_key
  from public.device_members m
  left join public.notification_preferences p on p.user_id = m.user_id
  where m.device_id = new.device_id
    and (v_critical or case v_type
          when 'transfer' then coalesce(p.transfer, true)
          when 'electrical_fault' then coalesce(p.electrical_fault, true)
          when 'connection_lost' then coalesce(p.connection_lost, true)
          else true end)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = m.user_id and n.device_id = new.device_id
        and n.dedupe_key = v_key and n.created_at > now() - v_window);
  return new;
end $$;

drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events
  for each row execute function public._events_notify();

-- ---------------------------------------------------------------------
-- Device-facing API (called by ESP32 with the anon key + device token)
-- ---------------------------------------------------------------------
create or replace function public._device_auth(p_device_id text, p_token text)
returns public.devices language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.devices;
begin
  select d.* into v_device
  from public.devices d
  join public.device_secrets s on s.device_id = d.id
  where d.id = p_device_id and s.token_hash = public._sha256_hex(coalesce(p_token, ''));
  if not found then
    raise exception 'DEVICE_AUTH_FAILED' using errcode = '28000';
  end if;
  return v_device;
end $$;

create or replace function public._insert_device_event(p_device_id text, p_event jsonb, p_now timestamptz)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_type text := p_event ->> 'type';
  v_ts timestamptz := coalesce(public._safe_ts(p_event ->> 'ts'), p_now);
begin
  if v_type is null or v_type not in (
    'source_lost', 'source_restored', 'transfer_started', 'transfer_completed', 'transfer_failed',
    'no_source_started', 'no_source_ended', 'electrical_fault', 'electrical_fault_cleared',
    'interlock_fault', 'transfer_lockout', 'protection_override', 'mode_changed',
    'controller_restarted', 'settings_applied', 'settings_rejected', 'runtime_reset') then
    raise exception 'INVALID_EVENT_TYPE: %', coalesce(v_type, 'null') using errcode = '22023';
  end if;
  if v_ts > p_now + interval '5 minutes' then v_ts := p_now; end if;
  insert into public.events (device_id, seq, occurred_at, origin, type, severity, source, from_source, to_source, data)
  values (
    p_device_id,
    nullif(p_event ->> 'seq', '')::bigint,
    v_ts,
    'device',
    v_type,
    coalesce(p_event ->> 'severity', 'info'),
    p_event ->> 'source',
    p_event ->> 'from',
    p_event ->> 'to',
    coalesce(p_event -> 'data', '{}'::jsonb)
  )
  on conflict (device_id, seq) where seq is not null do nothing;
end $$;

create or replace function public.device_ingest(p_device_id text, p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_ts timestamptz;
  v_prev public.device_status;
  v_newer boolean;
  v_src text;
  v_new double precision;
  v_old double precision;
  v_delta double precision;
  v_event jsonb;
  v_commands jsonb;
  v_settings_version int;
  v_seq bigint := nullif(p_payload ->> 'seq', '')::bigint;
begin
  perform public._device_auth(p_device_id, p_token);
  if coalesce(nullif(p_payload ->> 'v', '')::int, 0) <> 1 then
    raise exception 'UNSUPPORTED_PROTOCOL' using errcode = '22023';
  end if;

  v_ts := coalesce(public._safe_ts(p_payload ->> 'ts'), v_now);
  if v_ts > v_now + interval '5 minutes' then v_ts := v_now; end if;

  insert into public.device_status (device_id) values (p_device_id) on conflict (device_id) do nothing;
  select * into v_prev from public.device_status where device_id = p_device_id for update;
  v_newer := v_prev.device_ts is null or v_ts >= v_prev.device_ts;

  -- Buffered events are replay-safe thanks to (device_id, seq) uniqueness.
  for v_event in select value from jsonb_array_elements(coalesce(p_payload -> 'events', '[]'::jsonb)) loop
    perform public._insert_device_event(p_device_id, v_event, v_now);
  end loop;

  if not v_prev.online and v_prev.last_seen_at is not null then
    insert into public.events (device_id, occurred_at, origin, type, severity, data)
    values (p_device_id, v_now, 'server', 'connection_restored', 'info',
            jsonb_build_object('offline_since', v_prev.last_seen_at));
  end if;

  if v_newer and jsonb_typeof(p_payload -> 'energy_wh') = 'object' then
    foreach v_src in array array['grid', 'solar', 'generator'] loop
      v_new := nullif(p_payload -> 'energy_wh' ->> v_src, '')::double precision;
      v_old := nullif(v_prev.energy_wh ->> v_src, '')::double precision;
      if v_new is not null and v_old is not null then
        v_delta := v_new - v_old;
        if v_delta < 0 then v_delta := v_new; end if; -- counter restarted on the board
        if v_delta > 0 and v_delta < 100000 then
          insert into public.energy_hourly (device_id, hour_start, source, wh)
          values (p_device_id, date_trunc('hour', v_ts), v_src, v_delta)
          on conflict (device_id, hour_start, source) do update set wh = public.energy_hourly.wh + excluded.wh;
        end if;
      end if;
    end loop;
  end if;

  if v_newer then
    update public.device_status set
      online = true,
      last_seen_at = v_now,
      device_ts = v_ts,
      seq = v_seq,
      protocol_version = 1,
      interval_ms = nullif(p_payload ->> 'interval_ms', '')::int,
      mode = p_payload ->> 'mode',
      mode_since = public._safe_ts(p_payload ->> 'mode_since'),
      system_state = p_payload ->> 'state',
      active_source = p_payload ->> 'active',
      active_since = public._safe_ts(p_payload ->> 'active_since'),
      sources = p_payload -> 'sources',
      load = p_payload -> 'load',
      contactors = p_payload -> 'contactors',
      alarms = coalesce(p_payload -> 'alarms', '[]'::jsonb),
      override = p_payload -> 'override',
      config_version = nullif(p_payload ->> 'config_version', '')::int,
      controller = p_payload -> 'controller',
      rssi = nullif(p_payload ->> 'rssi', '')::int,
      energy_wh = coalesce(p_payload -> 'energy_wh', energy_wh),
      runtime = coalesce(p_payload -> 'runtime', runtime),
      updated_at = v_now
    where device_id = p_device_id;

    if p_payload ? 'fw' then
      update public.devices set firmware = left(p_payload ->> 'fw', 40) where id = p_device_id;
    end if;
  else
    update public.device_status set online = true, last_seen_at = v_now where device_id = p_device_id;
  end if;

  insert into public.telemetry (
    device_id, device_ts, seq, active_source, system_state,
    load_voltage, load_current, load_power_w, load_frequency,
    grid_voltage, grid_frequency, solar_voltage, solar_frequency, generator_voltage, generator_frequency)
  values (
    p_device_id, v_ts, v_seq, p_payload ->> 'active', p_payload ->> 'state',
    nullif(p_payload #>> '{load,v}', '')::real,
    nullif(p_payload #>> '{load,a}', '')::real,
    nullif(p_payload #>> '{load,w}', '')::real,
    nullif(p_payload #>> '{load,f}', '')::real,
    nullif(p_payload #>> '{sources,grid,v}', '')::real,
    nullif(p_payload #>> '{sources,grid,f}', '')::real,
    nullif(p_payload #>> '{sources,solar,v}', '')::real,
    nullif(p_payload #>> '{sources,solar,f}', '')::real,
    nullif(p_payload #>> '{sources,generator,v}', '')::real,
    nullif(p_payload #>> '{sources,generator,f}', '')::real);

  if v_seq is not null and v_seq % 500 = 0 then
    delete from public.telemetry where device_id = p_device_id and device_ts < v_now - interval '3 days';
  end if;

  update public.device_commands set status = 'expired', updated_at = v_now
  where device_id = p_device_id and status in ('pending', 'delivered') and expires_at < v_now;

  with delivered as (
    update public.device_commands set status = 'delivered', updated_at = v_now
    where device_id = p_device_id and status in ('pending', 'delivered') and expires_at >= v_now
    returning id, type, payload, expires_at, created_at)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'type', type, 'payload', payload, 'expires_at', expires_at) order by created_at), '[]'::jsonb)
  into v_commands from delivered;

  select version into v_settings_version from public.device_settings where device_id = p_device_id;

  return jsonb_build_object(
    'ok', true,
    'server_time', v_now,
    'settings_version', v_settings_version,
    'commands', v_commands);
end $$;

create or replace function public.device_get_settings(p_device_id text, p_token text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
begin
  perform public._device_auth(p_device_id, p_token);
  select to_jsonb(s) - 'updated_by' into v_settings from public.device_settings s where s.device_id = p_device_id;
  return v_settings;
end $$;

create or replace function public.device_ack_command(
  p_device_id text, p_token text, p_command_id uuid, p_status text, p_result jsonb default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cmd public.device_commands;
begin
  perform public._device_auth(p_device_id, p_token);
  if p_status not in ('accepted', 'executing', 'completed', 'rejected', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select * into v_cmd from public.device_commands where id = p_command_id and device_id = p_device_id for update;
  if not found then
    raise exception 'COMMAND_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_cmd.status in ('completed', 'rejected', 'failed', 'expired') then
    return jsonb_build_object('ok', true, 'status', v_cmd.status, 'duplicate', true);
  end if;
  update public.device_commands
  set status = p_status, result = coalesce(p_result, result), updated_at = now()
  where id = p_command_id;
  if p_status in ('completed', 'rejected', 'failed') then
    insert into public.events (device_id, occurred_at, origin, type, severity, actor_id, data)
    values (p_device_id, now(), 'device', 'command_result',
            case when p_status = 'completed' then 'info' else 'warning' end,
            v_cmd.created_by,
            jsonb_build_object('command_id', v_cmd.id, 'command', v_cmd.type, 'payload', v_cmd.payload,
                               'status', p_status, 'result', p_result));
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ---------------------------------------------------------------------
-- App-facing API (authenticated users)
-- ---------------------------------------------------------------------
create or replace function public.server_now()
returns timestamptz language sql stable
set search_path = pg_catalog
as $$ select now() $$;

create or replace function public.claim_device(
  p_device_id text, p_pin text, p_environment text, p_name text,
  p_location text default null, p_timezone text default 'UTC')
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_device public.devices;
  v_secret public.device_secrets;
  v_id text := upper(trim(coalesce(p_device_id, '')));
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if char_length(v_name) < 2 then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;

  select * into v_device from public.devices where id = v_id for update;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_device.environment <> coalesce(p_environment, 'production') then
    raise exception 'ENVIRONMENT_MISMATCH' using errcode = '22023';
  end if;
  if v_device.owner_id = v_uid then raise exception 'ALREADY_YOURS' using errcode = '23505'; end if;
  if v_device.owner_id is not null then raise exception 'CLAIMED_BY_OTHER' using errcode = '42501'; end if;

  select * into v_secret from public.device_secrets where device_id = v_id for update;
  if v_secret.locked_until is not null and v_secret.locked_until > now() then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = '42501';
  end if;
  if v_secret.pin_hash <> public._sha256_hex(v_id || ':' || trim(coalesce(p_pin, ''))) then
    update public.device_secrets
    set failed_claims = failed_claims + 1,
        locked_until = case when failed_claims + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where device_id = v_id;
    return jsonb_build_object('ok', false, 'error', 'INVALID_PIN');
  end if;

  update public.device_secrets set failed_claims = 0, locked_until = null where device_id = v_id;
  update public.devices
  set owner_id = v_uid, claimed_at = now(), name = left(v_name, 60),
      location = nullif(left(trim(coalesce(p_location, '')), 120), '')
  where id = v_id;
  insert into public.device_members (device_id, user_id, role, added_by)
  values (v_id, v_uid, 'admin', v_uid)
  on conflict (device_id, user_id) do update set role = 'admin';
  insert into public.device_settings (device_id, timezone)
  values (v_id, coalesce(nullif(p_timezone, ''), 'UTC'))
  on conflict (device_id) do update set timezone = excluded.timezone;
  insert into public.device_status (device_id) values (v_id) on conflict (device_id) do nothing;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_id, now(), 'app', 'device_claimed', v_uid, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'device_id', v_id);
end $$;

-- Owner hands the board back: members, invitations, commands and history
-- are removed so a future owner never sees this site's data.
create or replace function public.release_device(p_device_id text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_device_owner(p_device_id) then raise exception 'NOT_OWNER' using errcode = '42501'; end if;
  delete from public.notifications where device_id = p_device_id;
  delete from public.device_members where device_id = p_device_id;
  delete from public.invitations where device_id = p_device_id;
  delete from public.device_commands where device_id = p_device_id;
  delete from public.telemetry where device_id = p_device_id;
  delete from public.energy_hourly where device_id = p_device_id;
  delete from public.events where device_id = p_device_id;
  -- Settings return to factory defaults for the next owner.
  delete from public.device_settings where device_id = p_device_id;
  insert into public.device_settings (device_id) values (p_device_id);
  update public.devices set owner_id = null, claimed_at = null, name = '', location = null where id = p_device_id;
end $$;

create or replace function public.leave_device(p_device_id text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_device_owner(p_device_id) then raise exception 'OWNER_CANNOT_LEAVE' using errcode = '42501'; end if;
  delete from public.device_members where device_id = p_device_id and user_id = auth.uid();
  delete from public.notifications where device_id = p_device_id and user_id = auth.uid();
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'member_removed', auth.uid(), jsonb_build_object('user_id', auth.uid(), 'left', true));
end $$;

create or replace function public.send_command(p_command_id uuid, p_device_id text, p_type text, p_payload jsonb)
returns public.device_commands language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cmd public.device_commands;
  v_status public.device_status;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_src text;
begin
  if not public.is_device_admin(p_device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;

  select * into v_cmd from public.device_commands where id = p_command_id;
  if found then
    if v_cmd.device_id <> p_device_id then raise exception 'COMMAND_ID_CONFLICT' using errcode = '23505'; end if;
    return v_cmd; -- idempotent retry
  end if;

  if p_type = 'set_mode' then
    if v_payload ->> 'mode' not in ('smart', 'manual') then raise exception 'INVALID_PAYLOAD' using errcode = '22023'; end if;
  elsif p_type = 'set_source' then
    if v_payload ->> 'source' not in ('grid', 'solar', 'generator') then raise exception 'INVALID_PAYLOAD' using errcode = '22023'; end if;
  elsif p_type = 'reset_runtime' then
    if jsonb_typeof(v_payload -> 'sources') <> 'array' or jsonb_array_length(v_payload -> 'sources') = 0 then
      raise exception 'INVALID_PAYLOAD' using errcode = '22023';
    end if;
    for v_src in select jsonb_array_elements_text(v_payload -> 'sources') loop
      if v_src not in ('grid', 'solar', 'generator') then raise exception 'INVALID_PAYLOAD' using errcode = '22023'; end if;
    end loop;
  else
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;

  select * into v_status from public.device_status where device_id = p_device_id;
  if not coalesce(v_status.online, false) or v_status.last_seen_at < now() - interval '30 seconds' then
    raise exception 'DEVICE_OFFLINE' using errcode = '55000';
  end if;

  insert into public.device_commands (id, device_id, type, payload, created_by, expires_at)
  values (p_command_id, p_device_id, p_type, v_payload, auth.uid(), now() + interval '10 seconds')
  returning * into v_cmd;

  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'command_sent', auth.uid(),
          jsonb_build_object('command_id', p_command_id, 'command', p_type, 'payload', v_payload));
  return v_cmd;
end $$;

create or replace function public.set_member_role(p_device_id text, p_user_id uuid, p_role text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_device_admin(p_device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  if p_role not in ('admin', 'viewer') then raise exception 'INVALID_ROLE' using errcode = '22023'; end if;
  if exists (select 1 from public.devices where id = p_device_id and owner_id = p_user_id) then
    raise exception 'CANNOT_CHANGE_OWNER' using errcode = '42501';
  end if;
  update public.device_members set role = p_role where device_id = p_device_id and user_id = p_user_id;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'role_changed', auth.uid(), jsonb_build_object('user_id', p_user_id, 'role', p_role));
end $$;

create or replace function public.remove_member(p_device_id text, p_user_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_device_admin(p_device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  if exists (select 1 from public.devices where id = p_device_id and owner_id = p_user_id) then
    raise exception 'CANNOT_REMOVE_OWNER' using errcode = '42501';
  end if;
  delete from public.device_members where device_id = p_device_id and user_id = p_user_id;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002'; end if;
  delete from public.notifications where device_id = p_device_id and user_id = p_user_id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'member_removed', auth.uid(), jsonb_build_object('user_id', p_user_id));
end $$;

create or replace function public.transfer_ownership(p_device_id text, p_user_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_device_owner(p_device_id) then raise exception 'NOT_OWNER' using errcode = '42501'; end if;
  if not exists (select 1 from public.device_members where device_id = p_device_id and user_id = p_user_id and role = 'admin') then
    raise exception 'TARGET_NOT_ADMIN' using errcode = '22023';
  end if;
  update public.devices set owner_id = p_user_id where id = p_device_id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'ownership_transferred', auth.uid(), jsonb_build_object('user_id', p_user_id));
end $$;

create or replace function public.create_invitation(p_device_id text, p_email text, p_role text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text := public._random_hex(2);
  v_id uuid;
  v_expires timestamptz := now() + interval '72 hours';
begin
  if not public.is_device_admin(p_device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  if p_role not in ('admin', 'viewer') then raise exception 'INVALID_ROLE' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL' using errcode = '22023'; end if;
  if exists (
    select 1 from public.device_members m join public.profiles p on p.id = m.user_id
    where m.device_id = p_device_id and p.email = v_email) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  -- One live invitation per email and device: older pending ones are revoked.
  update public.invitations set revoked_at = now()
  where device_id = p_device_id and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (device_id, email, role, token_hash, invited_by, expires_at)
  values (p_device_id, v_email, p_role, public._sha256_hex(v_token), auth.uid(), v_expires)
  returning id into v_id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (p_device_id, now(), 'app', 'invitation_sent', auth.uid(), jsonb_build_object('email', v_email, 'role', p_role));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end $$;

create or replace function public.resend_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations;
  v_token text := public._random_hex(2);
  v_expires timestamptz := now() + interval '72 hours';
begin
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or not public.is_device_admin(v_inv.device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  update public.invitations
  set token_hash = public._sha256_hex(v_token), expires_at = v_expires, last_sent_at = now()
  where id = p_invitation_id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_inv.device_id, now(), 'app', 'invitation_sent', auth.uid(),
          jsonb_build_object('email', v_inv.email, 'role', v_inv.role, 'resent', true));
  return jsonb_build_object('id', v_inv.id, 'email', v_inv.email, 'token', v_token, 'expires_at', v_expires);
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or not public.is_device_admin(v_inv.device_id) then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  if v_inv.accepted_at is not null then raise exception 'INVITATION_CLOSED' using errcode = '22023'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation_id and revoked_at is null;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_inv.device_id, now(), 'app', 'invitation_revoked', auth.uid(), jsonb_build_object('email', v_inv.email));
end $$;

create or replace function public.get_invitation(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select i.*, coalesce(nullif(d.name, ''), d.id) as device_name, p.full_name as inviter_name
  into v_row
  from public.invitations i
  join public.devices d on d.id = i.device_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = public._sha256_hex(coalesce(p_token, ''));
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  return jsonb_build_object(
    'status', case
      when v_row.accepted_at is not null then 'accepted'
      when v_row.revoked_at is not null then 'revoked'
      when v_row.expires_at < now() then 'expired'
      else 'pending' end,
    'device_id', v_row.device_id,
    'device_name', v_row.device_name,
    'role', v_row.role,
    'email', v_row.email,
    'inviter_name', v_row.inviter_name,
    'expires_at', v_row.expires_at,
    'email_matches', v_row.email = lower(coalesce(auth.jwt() ->> 'email', '')));
end $$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select * into v_inv from public.invitations
  where token_hash = public._sha256_hex(coalesce(p_token, '')) for update;
  if not found then raise exception 'INVITATION_INVALID' using errcode = 'P0002'; end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then raise exception 'INVITATION_EXPIRED' using errcode = '22023'; end if;
  if v_inv.email <> v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501'; end if;

  insert into public.device_members (device_id, user_id, role, added_by)
  values (v_inv.device_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (device_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_inv.device_id, now(), 'app', 'member_added', v_uid,
          jsonb_build_object('user_id', v_uid, 'role', v_inv.role, 'via', 'invitation'));
  return jsonb_build_object('ok', true, 'device_id', v_inv.device_id, 'role', v_inv.role);
end $$;

-- ---------------------------------------------------------------------
-- Maintenance & provisioning (service role / SQL editor only)
-- ---------------------------------------------------------------------
create or replace function public.check_device_heartbeats()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.device_commands set status = 'expired', updated_at = now()
  where status in ('pending', 'delivered') and expires_at < now();

  with stale as (
    update public.device_status set online = false, updated_at = now()
    where online and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
    returning device_id, last_seen_at)
  insert into public.events (device_id, occurred_at, origin, type, severity, data)
  select device_id, now(), 'server', 'connection_lost', 'warning', jsonb_build_object('last_seen_at', last_seen_at)
  from stale;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.prune_telemetry()
returns void language sql security definer
set search_path = public, pg_temp
as $$ delete from public.telemetry where device_id is not null and device_ts < now() - interval '3 days' $$;

-- Factory registration. Returns the one-time secrets to flash/print:
--   token → firmware, pin → device label / QR code.
create or replace function public.register_device(
  p_device_id text, p_environment text default 'production', p_pin text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id text := upper(trim(p_device_id));
  v_token text := public._random_hex(2);
  v_pin text := coalesce(nullif(trim(p_pin), ''),
    lpad((abs(('x' || substr(public._random_hex(1), 1, 8))::bit(32)::int::bigint) % 100000000)::text, 8, '0'));
begin
  if char_length(v_pin) < 6 then raise exception 'PIN_TOO_SHORT' using errcode = '22023'; end if;
  insert into public.devices (id, environment) values (v_id, p_environment);
  insert into public.device_secrets (device_id, token_hash, pin_hash)
  values (v_id, public._sha256_hex(v_token), public._sha256_hex(v_id || ':' || v_pin));
  insert into public.device_status (device_id) values (v_id);
  insert into public.device_settings (device_id) values (v_id);
  return jsonb_build_object('device_id', v_id, 'environment', p_environment, 'token', v_token, 'pin', v_pin);
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.device_ingest(text, text, jsonb) to anon, authenticated;
grant execute on function public.device_get_settings(text, text) to anon, authenticated;
grant execute on function public.device_ack_command(text, text, uuid, text, jsonb) to anon, authenticated;

grant execute on function public.server_now() to anon, authenticated;
grant execute on function public.is_device_member(text) to authenticated;
grant execute on function public.is_device_admin(text) to authenticated;
grant execute on function public.is_device_owner(text) to authenticated;
grant execute on function public.shares_device_with(uuid) to authenticated;
grant execute on function public.claim_device(text, text, text, text, text, text) to authenticated;
grant execute on function public.release_device(text) to authenticated;
grant execute on function public.leave_device(text) to authenticated;
grant execute on function public.send_command(uuid, text, text, jsonb) to authenticated;
grant execute on function public.set_member_role(text, uuid, text) to authenticated;
grant execute on function public.remove_member(text, uuid) to authenticated;
grant execute on function public.transfer_ownership(text, uuid) to authenticated;
grant execute on function public.create_invitation(text, text, text) to authenticated;
grant execute on function public.resend_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.get_invitation(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
-- register_device, check_device_heartbeats and prune_telemetry stay service-role only.

-- ---------------------------------------------------------------------
-- Realtime (postgres_changes honours the RLS policies above)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping realtime setup';
    return;
  end if;
  foreach t in array array['device_status', 'telemetry', 'events', 'device_settings',
                           'device_commands', 'device_members', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Scheduled jobs: heartbeat watchdog every 30 s, daily telemetry pruning.
-- Requires the pg_cron extension (Supabase: Database → Extensions).
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%). Enable it, then re-run this block.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname in ('smart_ats_heartbeat', 'smart_ats_prune');
  perform cron.schedule('smart_ats_heartbeat', '30 seconds', 'select public.check_device_heartbeats()');
  perform cron.schedule('smart_ats_prune', '15 3 * * *', 'select public.prune_telemetry()');
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
