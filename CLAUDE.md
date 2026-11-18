# Working on Smart ATS

Read docs/ARCHITECTURE.md first. Rules that keep the code base healthy:

- Only `src/api/**` talks to Supabase. Add a typed function there; screens, stores and hooks call it.
- Never edit an applied migration. Add `supabase/migrations/<timestamp>_<name>.sql`, then `npm run gen:types && npm run db:bundle`, and add a test in `tests/db/`.
- Business rules live in `src/domain/` (pure, unit-tested), not in components.
- Settings limits live in `src/domain/settings.ts`; `tests/db/settings-schema.test.ts` must stay green.
- Board behaviour changes go to `tools/device-emulator/` first, with a vector in `protocol/logic-vectors.json` and a note in `docs/ESP32_PROTOCOL.md`.
- UI text is Arabic; code, comments and commit messages are English.
- `npm run check` must pass before every commit.
