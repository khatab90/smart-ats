// Runs the shared protocol test vectors (protocol/logic-vectors.json)
// against the JS reference logic. The ESP32 firmware runs the same file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { classify, mayTransfer, smartTarget, stepQualification } from "./logic.mjs";

const V = JSON.parse(
  readFileSync(new URL("../../protocol/logic-vectors.json", import.meta.url), "utf8"),
);
const S = V.settings;
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

describe("classify", () => {
  for (const c of V.classify) {
    test(c.name, () => {
      const r = classify(c.reading, S);
      assert.deepEqual(pick(r, Object.keys(c.expect)), c.expect);
    });
  }
});

describe("stepQualification", () => {
  for (const c of V.qualification) {
    test(c.name, () => {
      let q = { qualified: c.start.qualified, badSince: null, goodSince: null, kind: null };
      for (const step of c.steps) {
        const r = stepQualification(q, step.reading, S, step.t, c.isActive);
        q = r.q;
        const got = { qualified: r.q.qualified, tripped: r.tripped, kind: r.kind };
        assert.deepEqual(pick(got, Object.keys(step.expect)), step.expect, `t=${step.t}`);
      }
    });
  }
});

describe("smartTarget", () => {
  for (const c of V.smartTarget) {
    test(c.name, () => {
      const qual = Object.fromEntries(
        Object.entries(c.qualified).map(([k, v]) => [k, { qualified: v }]),
      );
      assert.equal(smartTarget(c.priority, qual), c.expect);
    });
  }
});

describe("mayTransfer", () => {
  for (const c of V.mayTransfer) {
    test(c.name, () => {
      const now = 10_000_000;
      const i = c.input;
      const r = mayTransfer({
        active: i.active,
        activeQualified: i.activeQualified,
        target: i.target,
        activeSince: now - i.activeSinceAgoMs,
        now,
        settings: S,
        recentTransfers: i.recentTransfersAgoMs.map((ago) => now - ago),
      });
      assert.deepEqual(pick(r, Object.keys(c.expect)), c.expect);
    });
  }
});
