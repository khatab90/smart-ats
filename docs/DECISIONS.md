# Architecture decision records

Short records of decisions that are not obvious from the code.

## ADR-001 — The board decides transfers; the server only records

**Context.** Power must keep switching when the internet is down.
**Decision.** All protection and Smart-mode decisions run on the ESP32. The
server stores what the board reports and queues commands. The app predicts
outcomes only to warn the user (`predictSmartTarget`).
**Consequence.** The emulator is the executable specification of the
firmware; both must pass `protocol/logic-vectors.json`.

## ADR-002 — Numbered, run-once migrations

**Context.** The first schema file was "safe to re-run", which stops working
as soon as a later migration drops or changes something.
**Decision.** Each file in `supabase/migrations/` runs once, in order. Only
the newest file must survive a second paste. New projects use the generated
`supabase/dist/full_install.sql`.

## ADR-003 — Implicit auth flow (not PKCE)

**Context.** Confirmation and invitation links are often opened on another
device or browser than the one that requested them; PKCE requires the same
browser.
**Decision.** Keep `flowType: "implicit"` for the web app. Revisit when the
mobile app uses native Google Sign-In (tokens then never travel in a URL).

## ADR-004 — Non-owner admins may manage other admins

**Decision.** Any admin may change roles of, or remove, other members except
the owner. The owner can never be demoted or removed and is the only one who
can transfer ownership or release the board. This matches small households
and sites where several trusted people administer the same system.

## ADR-005 — No remote unlock of a protection lockout

**Context.** A lockout means the contactor feedback contradicts the command
(e.g. a welded contact). Closing another source could connect two sources
together.
**Decision.** Lockout is latched and cleared only on site (panel button or a
power cycle after repair). The app explains this and shows the alarm.

## ADR-006 — At-least-once commands, de-duplicated on the board

**Decision.** A delivered command is re-sent after 3 s without an ack; the
board de-duplicates by command id and repeats its last ack. Commands expire
after 10 s if never picked up. The app reports success only on `completed`.

## ADR-007 — Server clock wins over a board with a wrong clock

**Decision.** `device_ingest` trusts the board's `ts` only within −10/+5
minutes; otherwise it uses server time (keeping the spacing of buffered
events), flags `clock_invalid`, and returns `server_time` for the board to
adopt. Events are de-duplicated per `boot_id`, so a reboot can restart
sequence numbers.

## ADR-008 — Capacity and max-current settings removed

**Context.** They were editable but no logic used them, and the product spec
removed capacity indicators and overload notifications.
**Decision.** Columns dropped in migration 2. Overload protection, if needed
later, belongs in the firmware with its own setting and event.

## ADR-009 — Every notification type can be muted

**Context.** The product spec asks for all notification types to be
configurable.
**Decision.** All five types honour user preferences; the two critical ones
(source outage, transfer failure) show a clear warning while muted. Muting
never deletes the event from the device history.

## ADR-010 — Rate limiting relies on Supabase's platform limits

**Decision.** Device tokens are 256-bit and PINs lock for 15 minutes after 5
failures, so brute force is impractical. No extra per-call throttling is
implemented at this scale; revisit with many boards per project.

## ADR-011 — All three sources are passive

**Context.** The owner treats the grid, the generator and solar the same
way: the ATS only chooses among sources that already deliver power.
**Decision.** The board never starts or stops the generator (it is started
by hand or by its own controller). A source is selectable when its voltage
and frequency stay inside the limits for `return_delay_s`. Generator start,
warm-up and cool-down settings, the `reset_generator` command and the
`standby` / `failed_to_start` states were removed.

## ADR-012 — Solar schedule is strict in Smart mode

**Context.** With batteries, solar is available around the clock, but the
owner wants it used only at chosen times (e.g. to keep the battery for
later).
**Decision.** `device_settings.solar_schedule` holds periods (days, start,
end; overnight allowed; up to 8). In Smart mode solar is never used outside
them — not even when no other source is available; if the load is on solar
when a period ends, the board moves to the next source or disconnects. The
user can still switch to solar manually at any time. The board evaluates the
schedule locally (UTC + `utc_offset_min`), so it works offline.

