import assert from "node:assert/strict";
import { test } from "vitest";
import { parseHash, toHash } from "../../src/store/nav";

test("navigation state round-trips through the URL hash", () => {
  const s = {
    tab: "more" as const,
    view: undefined,
    stack: ["devices" as const, "addDevice" as const],
  };
  assert.equal(toHash(s), "#/more/devices/addDevice");
  assert.deepEqual(parseHash(toHash(s)), s);
  assert.deepEqual(parseHash("#/logs:runtime"), { tab: "logs", view: "runtime", stack: [] });
});

test("foreign hashes (Supabase auth callbacks) are ignored", () => {
  assert.equal(parseHash("#access_token=abc&type=recovery"), null);
  assert.equal(parseHash("#/nowhere"), null);
  assert.deepEqual(parseHash("#/home/bogus/profile")?.stack, ["profile"]);
});

test("settings and profile sections and the transfer log have their own addresses", () => {
  assert.deepEqual(parseHash("#/more/settings/settings.voltage")?.stack, [
    "settings",
    "settings.voltage",
  ]);
  assert.deepEqual(parseHash("#/more/profile/profile.password")?.stack, [
    "profile",
    "profile.password",
  ]);
  assert.deepEqual(parseHash("#/logs/transfers")?.stack, ["transfers"]);
  assert.deepEqual(parseHash("#/more/settings/settings.bogus")?.stack, ["settings"]);
});
