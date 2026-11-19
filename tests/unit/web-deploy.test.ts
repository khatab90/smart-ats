// Public web build: response headers and recovery from a newer deploy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test, vi } from "vitest";
import { SUPABASE_URL } from "../../src/config/supabase";
import { isStaleBuildError, reloadForNewVersion } from "../../src/lib/staleBuild";

function headerRules() {
  const text = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
  const rules: Record<string, Record<string, string>> = {};
  let path = "";
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      rules[path] = {};
    } else {
      const i = line.indexOf(":");
      rules[path]![line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

function cspSources(directive: string): string[] {
  const csp = headerRules()["/*"]!["content-security-policy"]!;
  const part = csp.split(";").find((p) => p.trim().startsWith(`${directive} `));
  return part ? part.trim().split(/\s+/).slice(1) : [];
}

/** CSP host-source match, enough for scheme://host and scheme://*.domain. */
function allows(sources: string[], url: string) {
  const u = new URL(url);
  return sources.some((s) => {
    const m = /^(\w+):\/\/(\*\.)?([^/]+)$/.exec(s);
    if (!m) return false;
    const [, scheme, wildcard, host] = m;
    if (`${scheme}:` !== u.protocol) return false;
    return wildcard ? u.host.endsWith(`.${host}`) : u.host === host;
  });
}

describe("_headers", () => {
  test("the app's Supabase project is reachable over HTTPS and realtime", () => {
    const connect = cspSources("connect-src");
    assert.ok(allows(connect, SUPABASE_URL), `connect-src misses ${SUPABASE_URL}`);
    assert.ok(allows(connect, SUPABASE_URL.replace(/^https:/, "wss:")), "realtime (wss) blocked");
  });

  test("no inline or third-party scripts, no framing", () => {
    assert.deepEqual(cspSources("script-src"), ["'self'"]);
    assert.deepEqual(cspSources("frame-ancestors"), ["'none'"]);
    assert.deepEqual(cspSources("object-src"), ["'none'"]);
  });

  test("hashed assets are cached for good; the page itself is not", () => {
    const rules = headerRules();
    assert.match(rules["/assets/*"]!["cache-control"]!, /immutable/);
    assert.equal(rules["/*"]!["cache-control"], undefined);
  });
});

describe("stale build", () => {
  test("recognises a missing screen file in every major browser", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://x/assets/Logs-1.js",
      "error loading dynamically imported module: https://x/assets/Logs-1.js",
      "Importing a module script failed.",
      "Unable to preload CSS for /assets/Logs-1.css",
    ]) {
      assert.equal(isStaleBuildError(new Error(message)), true, message);
    }
    assert.equal(isStaleBuildError(new Error("Cannot read properties of undefined")), false);
    assert.equal(isStaleBuildError(null), false);
  });

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });

  test("reloads once, never in a loop", () => {
    const reload = vi.fn();
    assert.equal(reloadForNewVersion(1_000_000, reload), true);
    assert.equal(reloadForNewVersion(1_010_000, reload), false); // 10 s later: real outage
    assert.equal(reload.mock.calls.length, 1);
    assert.equal(reloadForNewVersion(1_040_000, reload), true); // a later deploy
    assert.equal(reload.mock.calls.length, 2);
  });
});
