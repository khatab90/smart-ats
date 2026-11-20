-- Migration 4 — two boards reporting with the same device ID.
--
-- A copied token, or an old board left powered after a replacement, makes
-- two boards send as one: the app's status flips between them, commands may
-- reach the wrong one and energy is counted twice.
--
-- Detection (per message, server side): a board's boot_id changes on every
-- start. A message whose boot_id was already seen, while the previous
-- message came from another boot, is a "return" to an older boot. A normal
-- reboot never returns (A A B B), a boot loop only brings new ids, and one
-- delayed message from before a reboot makes at most two returns. Three
-- returns within 90 s mean two boards are alternating.
--
-- While a conflict lasts only the boot that started first (among the boots
-- active in the last 90 s) is accepted. The other gets ok: false with
-- reason "duplicate_board": it keeps its buffered events and gets no
-- commands. The owner is notified (critical, "board connection" type) and
-- device_status.duplicate_since drives a warning in the app. The conflict
-- clears 2 minutes after the last return.

create table if not exists public.device_boots (
  device_id text not null references public.devices (id) on delete cascade,
  boot_id text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (device_id, boot_id)
);
-- Server bookkeeping only: no policies, no grants.
alter table public.device_boots enable row level security;
revoke all on public.device_boots from anon, authenticated;

alter table public.device_status
  add column if not exists duplicate_since timestamptz,
  add column if not exists duplicate_hits int not null default 0,
  add column if not exists duplicate_seen_at timestamptz,
  add column if not exists duplicate_boot_id text;

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
  'connection_lost', 'connection_restored', 'duplicate_board', 'duplicate_board_cleared',
  'command_sent', 'command_result',
  'settings_changed',
  'device_claimed', 'device_released',
  'member_added', 'member_removed', 'role_changed', 'ownership_transferred',
  'invitation_sent', 'invitation_revoked'
));

-- Records the boot and decides whether this message is accepted.
create or replace function public._duplicate_guard(p_device_id text, p_boot text, p_now timestamptz)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_active constant interval := interval '90 seconds';
  v_clear constant interval := interval '2 minutes';
  v_prev_boot text;
  v_seen_before boolean;
  v_st public.device_status;
  v_hits int;
  v_first text;
  v_other text;
begin
  insert into public.device_status (device_id) values (p_device_id) on conflict (device_id) do nothing;
  select * into v_st from public.device_status where device_id = p_device_id for update;

  select boot_id into v_prev_boot from public.device_boots
  where device_id = p_device_id order by last_seen_at desc limit 1;
  v_seen_before := exists (select 1 from public.device_boots where device_id = p_device_id and boot_id = p_boot);

  if v_seen_before then
    update public.device_boots set last_seen_at = p_now where device_id = p_device_id and boot_id = p_boot;
  else
    insert into public.device_boots (device_id, boot_id, first_seen_at, last_seen_at)
    values (p_device_id, p_boot, p_now, p_now);
    delete from public.device_boots where device_id = p_device_id and last_seen_at < p_now - interval '1 day';
  end if;

  -- A return to an older boot while another one was talking.
  if v_seen_before and v_prev_boot is not null and v_prev_boot <> p_boot then
    v_hits := case when v_st.duplicate_seen_at > p_now - v_active then v_st.duplicate_hits + 1 else 1 end;
    update public.device_status set duplicate_hits = v_hits, duplicate_seen_at = p_now
    where device_id = p_device_id;
    if v_hits >= 3 and v_st.duplicate_since is null then
      update public.device_status set duplicate_since = p_now where device_id = p_device_id;
      v_st.duplicate_since := p_now;
      insert into public.events (device_id, occurred_at, origin, type, severity, data)
      values (p_device_id, p_now, 'server', 'duplicate_board', 'critical',
              jsonb_build_object('boots', jsonb_build_array(v_prev_boot, p_boot)));
    end if;
  elsif v_st.duplicate_since is not null and v_st.duplicate_seen_at < p_now - v_clear then
    update public.device_status
    set duplicate_since = null, duplicate_hits = 0, duplicate_boot_id = null
    where device_id = p_device_id;
    insert into public.events (device_id, occurred_at, origin, type, severity, data)
    values (p_device_id, p_now, 'server', 'duplicate_board_cleared', 'info',
            jsonb_build_object('since', v_st.duplicate_since));
    return true;
  end if;

  if v_st.duplicate_since is null then
    return true;
  end if;

  -- Conflict: the boot that started first among the active ones is accepted.
  select boot_id into v_first from public.device_boots
  where device_id = p_device_id and last_seen_at > p_now - v_active
  order by first_seen_at, boot_id limit 1;
  select boot_id into v_other from public.device_boots
  where device_id = p_device_id and last_seen_at > p_now - v_active and boot_id <> v_first
  order by first_seen_at desc limit 1;
  update public.device_status set duplicate_boot_id = v_other where device_id = p_device_id;
  return p_boot = coalesce(v_first, p_boot);
end $$;

revoke all on function public._duplicate_guard(text, text, timestamptz) from public, anon, authenticated;

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

  -- Two boards with this ID: only the one that started first is accepted.
  -- The other keeps its events (ok: false) and gets no commands.
  if not public._duplicate_guard(p_device_id, v_boot, now()) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_board',
                              'server_time', now(), 'retry_after_s', 30);
  end if;

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
  elsif new.type = 'duplicate_board' then
    v_type := 'connection_lost'; v_critical := true;
    v_title := 'جهازان يرسلان بنفس المعرّف';
    v_body := format('تصل بيانات من جهازين مختلفين باسم «%s». يُعرض البورد الذي بدأ أولاً وأوقفنا الآخر. افصل الجهاز الزائد؛ وإذا لم تعرفه فقد يكون رمزه السري منسوخاً.', v_device);
    v_key := 'duplicate';
    v_window := interval '1 hour';
    v_params := jsonb_build_object('event', 'duplicate_board');
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
