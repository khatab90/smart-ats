# Architecture decision records

Short records of decisions that are not obvious from the code.

## ADR-001 — The board decides transfers; the server only records

**Context.** Power must keep switching when the internet is down.
**Decision.** All protection and Smart-mode decisions run on the ESP32. The
server stores what the board reports and queues commands. The app predicts
outcomes only to warn the user (`predictSmartTarget`).
**Consequence.** The reference board (in the separate `smart-ats-simulator`
project) is the executable specification of the firmware; both must pass
`protocol/logic-vectors.json`, which this project owns with
`docs/ESP32_PROTOCOL.md`.

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

## ADR-013 — Arabic source texts with an English catalog

**Decision.** UI texts stay written in Arabic in the code and go through
`t()`; `src/i18n/en.ts` maps each Arabic text to English. Changing the
language reloads the app.

**Why.** Arabic is the primary language, so the code reads like the screen.
Keys that are the text itself cannot drift from what users see, and the
`npm run i18n` check catches a missing or stale translation. A reload keeps
module-level texts and layout direction simple and correct.

## ADR-014 — Western digits only

**Decision.** Numbers are shown with Western digits (12355) in both
languages. The Arabic-Indic digits option of 2.3.0 was removed.

**Why.** The owner found Arabic-Indic digits hard to read in readings and
times; one digit system also keeps readings, IDs and inputs consistent.

## ADR-015 — One responsive code base for phone, tablet and laptop

**Decision.** The same screens adapt with breakpoints (bottom bar → side
rail → sidebar; one column → two columns) instead of separate phone and
desktop apps.

**Why.** One code base to test and maintain; the Android app later wraps the
same build.

## ADR-016 — Simulation lives in its own project

**Decision.** Everything that stands in for the board — the reference board
logic, the PC emulator and the phone simulator — lives in
`smart-ats-simulator`. This project keeps the contract only: the protocol
document and its test vectors. Its end-to-end test replays a recorded board
session (`tests/system/board-session.json`) instead of running a board.

**Why.** The app project contains only what ships to users; test tools have
their own releases and can change without touching the app.

## ADR-017 — Android app from the same code (Capacitor)

**Decision.** The Android app is the web build inside a Capacitor shell, not
a separate native app. Google sign-in runs in the system browser and returns
through the `smartats://app` link (also used by email links). The APK is
built by GitHub Actions and published as a release, debug-signed for now.

**Why.** One code base for phone, tablet, laptop and the Android app. Google
blocks OAuth inside web views, so the system browser is required; a custom
link needs no Android OAuth client and no verified domain.

