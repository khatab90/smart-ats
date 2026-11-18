-- =====================================================================
-- Smart ATS — migration 2: reliability, security and retention
--
-- Upgrade path: run this file ONCE in Supabase → SQL Editor after the
-- baseline (20261116000000_smart_ats_schema.sql). It keeps all data and is
-- safe to re-run.
--
-- What changes (audit report references in brackets):
--   * device_ingest never rejects a whole message because of one bad field;
--     bad events are skipped and counted, bad status fields become null [DB-1]
--   * events are de-duplicated per boot: (device_id, boot_id, seq) [DB-2]
--   * a board with a wrong clock no longer freezes the status; server time is
--     used and the board is told via clock_invalid + server_time [DB-3]
--   * retention for events, notifications and commands; faster watchdog [DB-4, DB-5]
--   * a delivered command is re-sent only after 3 s without an ack [DB-6]
--   * members' phone numbers are visible to admins only; profiles are
--     private to their owner [SEC-4]
--   * claim_device checks the PIN before revealing ownership [SEC-5]
--   * release_device wipes the previous owner's last status [SEC-8]
--   * lockout_cleared event (on-site reset of a latched lockout) [ATS-5]
--   * capacity / max-current settings removed (unused, out of scope) [ATS-4]
--   * the generator is a passive source like the grid (started outside the
--     ATS): generator start/warm-up/cool-down settings removed
--   * solar_schedule: hours when Smart mode may use solar; device_get_settings
--     also returns utc_offset_min so the board can evaluate it locally
--   * every notification type can be muted; notifications carry params so
--     the app renders the text [UX, SE-6]
-- =====================================================================

-- ---------------------------------------------------------------------
-- Safe parsing helpers (never raise)
-- ---------------------------------------------------------------------
create or replace function public._safe_num(p text)
returns double precision language plpgsql immutable
set search_path = pg_catalog
as $$
begin
  if p is null or p = '' then return null; end if;
  return p::double precision;
exception when others then
  return null;
end $$;

create or replace function public._safe_int(p text, p_min bigint default null, p_max bigint default null)
returns bigint language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  v double precision := public._safe_num(p);
begin
  if v is null or v <> trunc(v) or v > 9.2e18 or v < -9.2e18 then return null; end if;
  if p_min is not null and v < p_min then return null; end if;
  if p_max is not null and v > p_max then return null; end if;
  return v::bigint;
end $$;

create or replace function public._safe_real(p text)
returns real language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  v double precision := public._safe_num(p);
begin
  if v is null or v = 'NaN'::double precision or abs(v) > 1e9 then return null; end if;
  return v::real;
end $$;

create or replace function public._one_of(p text, p_allowed text[])
returns text language sql immutable
set search_path = pg_catalog
as $$ select case when p = any (p_allowed) then p else null end $$;

create or replace function public._json_object(p jsonb)
returns jsonb language sql immutable
set search_path = pg_catalog
as $$ select case when jsonb_typeof(p) = 'object' then p else null end $$;

-- ---------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------
alter table public.device_status add column if not exists boot_id text;
alter table public.device_status add column if not exists clock_invalid boolean not null default false;
alter table public.device_status add column if not exists skipped_events bigint not null default 0;

alter table public.events add column if not exists boot_id text not null default '';
drop index if exists public.events_device_seq_uidx;
create unique index if not exists events_device_boot_seq_uidx
  on public.events (device_id, boot_id, seq) where seq is not null;

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (type in (
  -- reported by the board
  'source_lost', 'source_restored',
  'transfer_started', 'transfer_completed', 'transfer_failed',
  'no_source_started', 'no_source_ended',
  'electrical_fault', 'electrical_fault_cleared',
  'interlock_fault', 'transfer_lockout', 'protection_override',
  'mode_changed', 'controller_restarted',
  'settings_applied', 'settings_rejected', 'runtime_reset',
  'lockout_cleared',
  -- recorded by the server / app actions
  'connection_lost', 'connection_restored',
  'command_sent', 'command_result',
  'settings_changed',
  'device_claimed', 'device_released',
  'member_added', 'member_removed', 'role_changed', 'ownership_transferred',
  'invitation_sent', 'invitation_revoked'
));

alter table public.notifications add column if not exists params jsonb not null default '{}'::jsonb;

alter table public.notification_preferences add column if not exists source_outage boolean not null default true;
alter table public.notification_preferences add column if not exists transfer_failed boolean not null default true;
grant select, insert, update on public.notification_preferences to authenticated;

-- Capacity and max-current settings were never used by the control logic
-- and the product spec removed capacity indicators and overload alerts.
alter table public.device_settings drop column if exists grid_capacity_kw;
alter table public.device_settings drop column if exists solar_capacity_kw;
alter table public.device_settings drop column if exists generator_capacity_kw;
alter table public.device_settings drop column if exists max_current_a;

-- The generator is started and stopped outside the ATS (manually or by its
-- own controller); the board only sees whether it delivers valid power.
alter table public.device_settings drop column if exists gen_crank_attempts;
alter table public.device_settings drop column if exists gen_warmup_s;
alter table public.device_settings drop column if exists gen_cooldown_s;

-- Solar schedule (Smart mode only). Shape:
--   { "enabled": bool, "periods": [ { "days": [0..6], "start": "HH:MM", "end": "HH:MM" } ] }
-- days = days a period starts on (0 = Sunday … 6 = Saturday, device local
-- time). end < start = overnight. Disabled = solar allowed at any time.
create or replace function public._valid_solar_schedule(p jsonb)
returns boolean language sql immutable
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and jsonb_typeof(p -> 'enabled') = 'boolean'
    and jsonb_typeof(p -> 'periods') = 'array'
    and jsonb_array_length(p -> 'periods') <= 8
    and ((p ->> 'enabled')::boolean = false or jsonb_array_length(p -> 'periods') >= 1)
    and not exists (
      select 1 from jsonb_array_elements(p -> 'periods') e
      where not coalesce(
        jsonb_typeof(e) = 'object'
        and (e ->> 'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and (e ->> 'end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and e ->> 'start' <> e ->> 'end'
        and jsonb_typeof(e -> 'days') = 'array'
        and jsonb_array_length(e -> 'days') between 1 and 7
        and not exists (
          select 1 from jsonb_array_elements(e -> 'days') d
          where jsonb_typeof(d) <> 'number' or d::text !~ '^[0-6]$'),
        false)),
    false)
$$;

alter table public.device_settings
  add column if not exists solar_schedule jsonb not null default '{"enabled": false, "periods": []}'::jsonb;
alter table public.device_settings drop constraint if exists settings_solar_schedule;
alter table public.device_settings
  add constraint settings_solar_schedule check (public._valid_solar_schedule(solar_schedule));
grant update (solar_schedule) on public.device_settings to authenticated;

-- ---------------------------------------------------------------------
-- Profiles are private; members are listed through a checked function
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());

create or replace function public.list_device_members(p_device_id text)
returns table (
  user_id uuid, role text, added_at timestamptz, is_owner boolean,
  full_name text, email text, phone text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.is_device_admin(p_device_id);
begin
  if not public.is_device_member(p_device_id) then
    raise exception 'NOT_MEMBER' using errcode = '42501';
  end if;
  return query
  select m.user_id, m.role, m.added_at, (d.owner_id = m.user_id),
         p.full_name, p.email,
         case when v_admin or m.user_id = auth.uid() then p.phone else null end
  from public.device_members m
  join public.devices d on d.id = m.device_id
  join public.profiles p on p.id = m.user_id
  where m.device_id = p_device_id
  order by m.added_at;
end $$;

-- ---------------------------------------------------------------------
-- Notifications: params for client-side text, every type can be muted
-- ---------------------------------------------------------------------
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
  v_value text := new.data ->> 'value';
  v_kind text;
  v_params jsonb;
begin
  select coalesce(nullif(d.name, ''), d.id) into v_device from public.devices d where d.id = new.device_id;

  if new.type = 'source_lost' and coalesce(public._one_of(new.data ->> 'was_active', array['true']), '') = 'true' then
    v_type := 'source_outage'; v_critical := true;
    v_title := 'انقطاع المصدر الحالي';
    v_body := format('انقطع %s الذي يغذي الأحمال في «%s».', public._source_name(new.source), v_device);
    v_key := 'outage:' || coalesce(new.source, '-');
    v_params := jsonb_build_object('event', 'source_lost', 'source', new.source);
  elsif new.type = 'no_source_started' then
    v_type := 'source_outage'; v_critical := true;
    v_title := 'لا يوجد مصدر متاح';
    v_body := format('الأحمال في «%s» بدون كهرباء: لا يوجد أي مصدر صالح للتشغيل.', v_device);
    v_key := 'no_source';
    v_params := jsonb_build_object('event', 'no_source');
  elsif new.type = 'transfer_completed' then
    v_type := 'transfer';
    v_title := 'تحويل بين المصادر';
    v_body := format('تم التحويل من %s إلى %s في «%s».',
      case when new.from_source is null then 'لا يوجد مصدر' else public._source_name(new.from_source) end,
      public._source_name(new.to_source), v_device);
    v_key := 'transfer:' || coalesce(new.from_source, '-') || '>' || coalesce(new.to_source, '-');
    v_window := interval '1 minute';
    v_params := jsonb_build_object('event', 'transfer', 'from', new.from_source, 'to', new.to_source,
                                   'reason', new.data ->> 'reason');
  elsif new.type in ('electrical_fault', 'transfer_lockout') then
    v_type := 'electrical_fault';
    v_kind := case when new.type = 'transfer_lockout' then 'unstable' else new.data ->> 'kind' end;
    v_title := 'خلل كهربائي';
    v_body := format('%s في %s%s («%s»).',
      public._fault_label(v_kind),
      case when new.source is null then 'النظام' else public._source_name(new.source) end,
      case when v_value is null then '' else ': ' || v_value end,
      v_device);
    v_key := 'fault:' || coalesce(new.source, '-') || ':' || coalesce(v_kind, new.type);
    v_params := jsonb_build_object('event', new.type, 'source', new.source, 'kind', v_kind, 'value', v_value);
  elsif new.type = 'connection_lost' then
    v_type := 'connection_lost';
    v_title := 'انقطاع الاتصال بالبورد';
    v_body := format('لم تصل بيانات من جهاز «%s» منذ أكثر من 30 ثانية.', v_device);
    v_key := 'connection';
    v_params := jsonb_build_object('event', 'connection_lost');
  elsif new.type in ('transfer_failed', 'interlock_fault') then
    v_type := 'transfer_failed'; v_critical := true;
    v_title := case when new.type = 'interlock_fault' then 'فشل التحويل: عطل القفل المتبادل' else 'فشل عملية التحويل' end;
    v_body := case when new.type = 'interlock_fault'
      then format('عدم تطابق بين أمر الكونتاكتور وحالته الفعلية في «%s». تم قفل النظام.', v_device)
      else format('تعذر الانتقال إلى %s في «%s».', public._source_name(new.to_source), v_device) end;
    v_key := 'transfer_failed:' || new.type || ':' || coalesce(new.to_source, '-');
    v_params := jsonb_build_object('event', new.type, 'to', new.to_source, 'reason', new.data ->> 'reason');
  else
    return new;
  end if;

  v_params := v_params || jsonb_build_object('device', v_device);

  insert into public.notifications (user_id, device_id, event_id, type, critical, title, body, dedupe_key, params)
  select m.user_id, new.device_id, new.id, v_type, v_critical, v_title, v_body, v_key, v_params
  from public.device_members m
  left join public.notification_preferences p on p.user_id = m.user_id
  where m.device_id = new.device_id
    and case v_type
          when 'source_outage' then coalesce(p.source_outage, true)
          when 'transfer' then coalesce(p.transfer, true)
          when 'electrical_fault' then coalesce(p.electrical_fault, true)
          when 'connection_lost' then coalesce(p.connection_lost, true)
          when 'transfer_failed' then coalesce(p.transfer_failed, true)
          else true end
    and not exists (
      select 1 from public.notifications n
      where n.user_id = m.user_id and n.device_id = new.device_id
        and n.dedupe_key = v_key and n.created_at > now() - v_window);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Device ingestion: per-event isolation, boot-scoped dedupe, clock guard
-- ---------------------------------------------------------------------
drop function if exists public._insert_device_event(text, jsonb, timestamptz);

-- Returns true when the event was stored (or was a replay), false when it
-- was skipped as invalid. Never raises.
create or replace function public._insert_device_event(
  p_device_id text, p_boot_id text, p_event jsonb, p_now timestamptz, p_offset interval)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_sources constant text[] := array['grid', 'solar', 'generator'];
  v_type text := public._one_of(p_event ->> 'type', array[
    'source_lost', 'source_restored', 'transfer_started', 'transfer_completed', 'transfer_failed',
    'no_source_started', 'no_source_ended', 'electrical_fault', 'electrical_fault_cleared',
    'interlock_fault', 'transfer_lockout', 'protection_override', 'mode_changed',
    'controller_restarted', 'settings_applied', 'settings_rejected', 'runtime_reset',
    'lockout_cleared']);
  v_ts timestamptz;
begin
  if jsonb_typeof(p_event) <> 'object' or v_type is null then return false; end if;
  v_ts := coalesce(public._safe_ts(p_event ->> 'ts') + p_offset, p_now);
  if v_ts > p_now + interval '5 minutes' or v_ts < p_now - interval '30 days' then v_ts := p_now; end if;
  insert into public.events (device_id, boot_id, seq, occurred_at, origin, type, severity,
                             source, from_source, to_source, data)
  values (
    p_device_id, p_boot_id,
    public._safe_int(p_event ->> 'seq', 0, null),
    v_ts, 'device', v_type,
    coalesce(public._one_of(p_event ->> 'severity', array['info', 'warning', 'critical']), 'info'),
    public._one_of(p_event ->> 'source', v_sources),
    public._one_of(p_event ->> 'from', v_sources),
    public._one_of(p_event ->> 'to', v_sources),
    coalesce(public._json_object(p_event -> 'data'), '{}'::jsonb))
  on conflict (device_id, boot_id, seq) where seq is not null do nothing;
  return true;
exception when others then
  return false;
end $$;

create or replace function public.device_ingest(p_device_id text, p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_sources constant text[] := array['grid', 'solar', 'generator'];
  v_now timestamptz := now();
  v_board_ts timestamptz;
  v_clock_ok boolean;
  v_offset interval := interval '0';
  v_ts timestamptz;
  v_prev public.device_status;
  v_boot text;
  v_new_boot boolean;
  v_newer boolean;
  v_src text;
  v_new double precision;
  v_old double precision;
  v_delta double precision;
  v_event jsonb;
  v_skipped int := 0;
  v_commands jsonb;
  v_settings_version int;
  v_seq bigint;
  v_energy jsonb;
begin
  perform public._device_auth(p_device_id, p_token);
  if jsonb_typeof(p_payload) <> 'object' or public._safe_int(p_payload ->> 'v') is distinct from 1 then
    raise exception 'UNSUPPORTED_PROTOCOL' using errcode = '22023';
  end if;

  v_seq := public._safe_int(p_payload ->> 'seq', 0, null);
  v_boot := coalesce(left(nullif(p_payload ->> 'boot_id', ''), 64), '');

  -- Clock guard: trust the board's clock only within -10 min / +5 min.
  v_board_ts := public._safe_ts(p_payload ->> 'ts');
  v_clock_ok := v_board_ts is not null
    and v_board_ts between v_now - interval '10 minutes' and v_now + interval '5 minutes';
  if v_clock_ok then
    v_ts := v_board_ts;
  else
    v_ts := v_now;
    if v_board_ts is not null then v_offset := v_now - v_board_ts; end if;
  end if;

  insert into public.device_status (device_id) values (p_device_id) on conflict (device_id) do nothing;
  select * into v_prev from public.device_status where device_id = p_device_id for update;
  v_new_boot := v_boot <> coalesce(v_prev.boot_id, '');
  v_newer := v_prev.device_ts is null or v_new_boot or v_ts >= v_prev.device_ts;

  -- Each buffered event is isolated: a bad one is skipped, never fatal.
  if jsonb_typeof(p_payload -> 'events') = 'array' then
    for v_event in select value from jsonb_array_elements(p_payload -> 'events') loop
      if not public._insert_device_event(p_device_id, v_boot, v_event, v_now, v_offset) then
        v_skipped := v_skipped + 1;
      end if;
    end loop;
  end if;

  if not v_prev.online and v_prev.last_seen_at is not null then
    insert into public.events (device_id, occurred_at, origin, type, severity, data)
    values (p_device_id, v_now, 'server', 'connection_restored', 'info',
            jsonb_build_object('offline_since', v_prev.last_seen_at));
  end if;

  v_energy := public._json_object(p_payload -> 'energy_wh');
  if v_newer and v_energy is not null then
    foreach v_src in array v_sources loop
      v_new := public._safe_num(v_energy ->> v_src);
      v_old := public._safe_num(v_prev.energy_wh ->> v_src);
      if v_new is not null and v_new >= 0 and v_old is not null then
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
      boot_id = v_boot,
      clock_invalid = not v_clock_ok,
      skipped_events = skipped_events + v_skipped,
      protocol_version = 1,
      interval_ms = public._safe_int(p_payload ->> 'interval_ms', 200, 60000),
      mode = public._one_of(p_payload ->> 'mode', array['smart', 'manual']),
      mode_since = public._safe_ts(p_payload ->> 'mode_since') + v_offset,
      system_state = public._one_of(p_payload ->> 'state', array['normal', 'transferring', 'no_source', 'lockout']),
      active_source = public._one_of(p_payload ->> 'active', v_sources),
      active_since = public._safe_ts(p_payload ->> 'active_since') + v_offset,
      sources = public._json_object(p_payload -> 'sources'),
      load = public._json_object(p_payload -> 'load'),
      contactors = public._json_object(p_payload -> 'contactors'),
      alarms = case when jsonb_typeof(p_payload -> 'alarms') = 'array' then p_payload -> 'alarms' else '[]'::jsonb end,
      override = public._json_object(p_payload -> 'override'),
      config_version = public._safe_int(p_payload ->> 'config_version', 0, 2147483647),
      controller = public._json_object(p_payload -> 'controller'),
      rssi = public._safe_int(p_payload ->> 'rssi', -127, 0),
      energy_wh = coalesce(v_energy, energy_wh),
      runtime = coalesce(public._json_object(p_payload -> 'runtime'), runtime),
      updated_at = v_now
    where device_id = p_device_id;

    if p_payload ? 'fw' then
      update public.devices set firmware = left(p_payload ->> 'fw', 40) where id = p_device_id;
    end if;
  else
    update public.device_status
    set online = true, last_seen_at = v_now, skipped_events = skipped_events + v_skipped
    where device_id = p_device_id;
  end if;

  insert into public.telemetry (
    device_id, device_ts, seq, active_source, system_state,
    load_voltage, load_current, load_power_w, load_frequency,
    grid_voltage, grid_frequency, solar_voltage, solar_frequency, generator_voltage, generator_frequency)
  values (
    p_device_id, v_ts, v_seq,
    public._one_of(p_payload ->> 'active', v_sources),
    public._one_of(p_payload ->> 'state', array['normal', 'transferring', 'no_source', 'lockout']),
    public._safe_real(p_payload #>> '{load,v}'),
    public._safe_real(p_payload #>> '{load,a}'),
    public._safe_real(p_payload #>> '{load,w}'),
    public._safe_real(p_payload #>> '{load,f}'),
    public._safe_real(p_payload #>> '{sources,grid,v}'),
    public._safe_real(p_payload #>> '{sources,grid,f}'),
    public._safe_real(p_payload #>> '{sources,solar,v}'),
    public._safe_real(p_payload #>> '{sources,solar,f}'),
    public._safe_real(p_payload #>> '{sources,generator,v}'),
    public._safe_real(p_payload #>> '{sources,generator,f}'));

  if v_seq is not null and v_seq % 500 = 0 then
    delete from public.telemetry where device_id = p_device_id and device_ts < v_now - interval '3 days';
  end if;

  update public.device_commands set status = 'expired', updated_at = v_now
  where device_id = p_device_id and status in ('pending', 'delivered') and expires_at < v_now;

  -- At-least-once delivery: a delivered command is re-sent only when the
  -- board has not acknowledged it for 3 s. The board de-duplicates by id.
  with delivered as (
    update public.device_commands set status = 'delivered', updated_at = v_now
    where device_id = p_device_id and expires_at >= v_now
      and (status = 'pending' or (status = 'delivered' and updated_at < v_now - interval '3 seconds'))
    returning id, type, payload, expires_at, created_at)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'type', type, 'payload', payload, 'expires_at', expires_at) order by created_at), '[]'::jsonb)
  into v_commands from delivered;

  select version into v_settings_version from public.device_settings where device_id = p_device_id;

  return jsonb_build_object(
    'ok', true,
    'server_time', v_now,
    'clock_invalid', not v_clock_ok,
    'skipped_events', v_skipped,
    'settings_version', v_settings_version,
    'commands', v_commands);
end $$;

-- ---------------------------------------------------------------------
-- Commands: stricter payload validation (null-safe)
-- ---------------------------------------------------------------------
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
    if v_payload ->> 'mode' is null or v_payload ->> 'mode' not in ('smart', 'manual') then
      raise exception 'INVALID_PAYLOAD' using errcode = '22023';
    end if;
  elsif p_type = 'set_source' then
    if v_payload ->> 'source' is null or v_payload ->> 'source' not in ('grid', 'solar', 'generator') then
      raise exception 'INVALID_PAYLOAD' using errcode = '22023';
    end if;
  elsif p_type = 'reset_runtime' then
    if jsonb_typeof(v_payload -> 'sources') is distinct from 'array' or jsonb_array_length(v_payload -> 'sources') = 0 then
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

-- ---------------------------------------------------------------------
-- Settings for the board, with the device's current UTC offset so the
-- board can evaluate the solar schedule in local time. The board re-reads
-- settings at boot and every 6 hours (time-zone offset changes).
-- ---------------------------------------------------------------------
create or replace function public.device_get_settings(p_device_id text, p_token text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
begin
  perform public._device_auth(p_device_id, p_token);
  select (to_jsonb(s) - 'updated_by')
         || jsonb_build_object('utc_offset_min',
              round(extract(epoch from (now() at time zone s.timezone) - (now() at time zone 'UTC')) / 60)::int)
  into v_settings
  from public.device_settings s where s.device_id = p_device_id;
  return v_settings;
end $$;

-- ---------------------------------------------------------------------
-- Claim: PIN first, then ownership (no enumeration of claimed boards)
-- ---------------------------------------------------------------------
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
  v_tz text := coalesce(nullif(p_timezone, ''), 'UTC');
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if char_length(v_name) < 2 then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;

  select * into v_device from public.devices where id = v_id for update;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_device.environment <> coalesce(p_environment, 'production') then
    raise exception 'ENVIRONMENT_MISMATCH' using errcode = '22023';
  end if;
  if v_device.owner_id = v_uid then raise exception 'ALREADY_YOURS' using errcode = '23505'; end if;

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
  -- Only someone holding the label learns that the board is taken.
  if v_device.owner_id is not null then raise exception 'CLAIMED_BY_OTHER' using errcode = '42501'; end if;

  update public.devices
  set owner_id = v_uid, claimed_at = now(), name = left(v_name, 60),
      location = nullif(left(trim(coalesce(p_location, '')), 120), '')
  where id = v_id;
  insert into public.device_members (device_id, user_id, role, added_by)
  values (v_id, v_uid, 'admin', v_uid)
  on conflict (device_id, user_id) do update set role = 'admin';
  insert into public.device_settings (device_id, timezone)
  values (v_id, v_tz)
  on conflict (device_id) do update set timezone = excluded.timezone;
  insert into public.device_status (device_id) values (v_id) on conflict (device_id) do nothing;
  insert into public.events (device_id, occurred_at, origin, type, actor_id, data)
  values (v_id, now(), 'app', 'device_claimed', v_uid, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'device_id', v_id);
end $$;

-- ---------------------------------------------------------------------
-- Release: the next owner starts from a clean slate
-- ---------------------------------------------------------------------
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
  delete from public.device_settings where device_id = p_device_id;
  insert into public.device_settings (device_id) values (p_device_id);
  delete from public.device_status where device_id = p_device_id;
  insert into public.device_status (device_id) values (p_device_id);
  update public.devices set owner_id = null, claimed_at = null, name = '', location = null where id = p_device_id;
end $$;

-- ---------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------
create or replace function public.prune_history()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.telemetry where device_ts < now() - interval '3 days';
  delete from public.notifications where created_at < now() - interval '90 days';
  delete from public.device_commands
  where created_at < now() - interval '30 days'
    and status in ('completed', 'rejected', 'failed', 'expired');
  -- Device and audit history is kept for a year; energy buckets are kept.
  delete from public.events where occurred_at < now() - interval '365 days';
end $$;

create or replace function public.prune_telemetry()
returns void language sql security definer
set search_path = public, pg_temp
as $$ select public.prune_history() $$;

-- ---------------------------------------------------------------------
-- Function privileges (Supabase grants new functions to everyone by
-- default, so re-apply the full allow-list)
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
grant execute on function public.list_device_members(text) to authenticated;
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
-- Used by a CHECK constraint on device_settings (evaluated as the updater).
grant execute on function public._valid_solar_schedule(jsonb) to authenticated;
-- register_device, check_device_heartbeats, prune_history and the _helpers
-- stay service-role / SQL-editor only.

-- ---------------------------------------------------------------------
-- Scheduled jobs: watchdog every 10 s (offline detected within 40 s),
-- nightly retention.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%). Enable it, then re-run this block.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job
  where jobname in ('smart_ats_heartbeat', 'smart_ats_prune');
  perform cron.schedule('smart_ats_heartbeat', '10 seconds', 'select public.check_device_heartbeats()');
  perform cron.schedule('smart_ats_prune', '15 3 * * *', 'select public.prune_history()');
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
