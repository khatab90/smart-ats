import assert from "node:assert/strict";
import { test } from "vitest";
import { cacheClear, cacheGet, cacheSet, cachedWindow } from "../../src/lib/cache";

test("a screen opened again gets the rows it needs from memory", () => {
  cacheClear();
  cacheSet("events:A", { since: 100, rows: [{ t: 100 }, { t: 150 }, { t: 200 }] });
  const time = (r: { t: number }) => r.t;
  assert.deepEqual(cachedWindow("events:A", 150, time), [{ t: 150 }, { t: 200 }]);
  // The cache started later than the wanted window: it cannot answer.
  assert.equal(cachedWindow("events:A", 50, time), undefined);
  assert.equal(cachedWindow("events:B", 150, time), undefined);
});

test("signing out forgets everything", () => {
  cacheSet("members:A", { members: [] });
  cacheClear();
  assert.equal(cacheGet("members:A"), undefined);
});
