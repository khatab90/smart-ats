// App preferences: theme resolution and power-flow speed.
import assert from "node:assert/strict";
import { test } from "vitest";
import { flowSeconds } from "../../src/components/PowerFlow";
import { resolveTheme } from "../../src/lib/prefs";

test("theme: automatic follows the phone; a choice overrides it", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("dots move faster when the house draws more power", () => {
  assert.equal(flowSeconds(null), 2.6);
  assert.equal(flowSeconds(500), 2.6);
  assert.ok(flowSeconds(2000) < flowSeconds(1000));
  assert.equal(flowSeconds(9000), 1.2);
});
