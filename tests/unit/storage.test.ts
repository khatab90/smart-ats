// @vitest-environment jsdom
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { readStorage, writeStorage } from "../../src/lib/storage";

afterEach(() => vi.restoreAllMocks());

test("storage failures never crash the app", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  assert.doesNotThrow(() => writeStorage("k", "v"));
  assert.equal(readStorage("k"), null);
});

test("works normally when storage is available", () => {
  writeStorage("k2", "v2");
  assert.equal(readStorage("k2"), "v2");
});
