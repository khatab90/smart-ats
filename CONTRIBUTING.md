# Contributing

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. These rules keep the
code base healthy; `npm run check` enforces most of them.

## Code

- Only `src/api/**` talks to Supabase (ESLint enforces it). Add a typed function there; screens, stores and hooks call it.
- Business rules live in `src/domain/` (pure, unit-tested), not in components.
- Settings limits live in `src/domain/settings.ts`; `tests/db/settings-schema.test.ts` proves they match the database.
- Code, comments and commit messages are in English.

## Texts and languages

- The app is written in Arabic; English is a translation. Every UI text is `t("النص العربي")`, with `{0}` for values.
- Add the English line to `src/i18n/en.ts` in the same change. `npm run i18n` fails on a text that is not wrapped, has no English, or an English line no code uses.
- Numbers are always Western digits, in both languages.
- Layout must work in both directions: use logical classes (`ps-`, `pe-`, `start-`, `end-`, `text-start`) and `rtl:` / `ltr:` variants, never `left` / `right`.

## Android

- Only `src/platform/native.ts` imports `@capacitor/*` (ESLint enforces it); everything there must be a no-op in the browser.
- Anything that opens over the screen (a dialog, a sheet, a guarded screen) registers with `pushBackHandler` so the Android back button closes it first.
- Raising `version` in `package.json` publishes a new APK release on the next push to `main`.

## Screens

- One code base for phone, tablet and laptop. Phone first, then `md:` (tablet: side rail, one column) and `lg:` (laptop: sidebar, two columns).
- Anything that changes the board or the app asks first with `ConfirmDialog`.

## Database

- Never edit an applied migration. Add `supabase/migrations/<timestamp>_<name>.sql`, then run `npm run gen:types && npm run db:bundle` and add a test in `tests/db/`.
- CI fails if the generated types or `supabase/dist/full_install.sql` are out of date.

## Board

- This project owns the protocol: a behaviour change starts with `docs/ESP32_PROTOCOL.md` and a vector in `protocol/logic-vectors.json`. The reference board, the PC emulator and the phone simulator live in the separate `smart-ats-simulator` project, which follows them (`npm run sync-protocol` there).
- No simulation code here. If the board's messages change, re-record `tests/system/board-session.json` from the reference board.

## Before every commit

```bash
npm run check   # types, lint, texts, all tests, production build
```

Add a line to [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
