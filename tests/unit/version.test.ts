import assert from "node:assert/strict";
import { test } from "vitest";
import { compareVersions, updateState } from "../../src/domain/version";
import { schemaProblem } from "../../src/lib/errors";

test("versions compare by number, not by text", () => {
  assert.equal(compareVersions("2.10.0", "2.9.0"), 1);
  assert.equal(compareVersions("2.11.0", "2.11.0"), 0);
  assert.equal(compareVersions("2.11", "2.11.1"), -1);
});

test("an installed version below the minimum must update; below the latest may", () => {
  const req = { min_version: "2.11.0", latest_version: "2.12.0", download_url: "https://x" };
  assert.equal(updateState("2.10.1", req), "required");
  assert.equal(updateState("2.11.0", req), "available");
  assert.equal(updateState("2.12.0", req), "none");
  assert.equal(updateState("2.0.0", null), "none"); // no answer: never block
});

test("a removed column means an outdated app, not a missing database", () => {
  assert.equal(
    schemaProblem({ code: "42703", message: "column profiles.phone does not exist" }),
    "outdated",
  );
  assert.equal(
    schemaProblem({ code: "PGRST205", message: "Could not find the table 'public.profiles'" }),
    "missing",
  );
  assert.equal(schemaProblem({ code: "", message: "Failed to fetch" }), null);
});
