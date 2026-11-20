// Pure pieces of the Android app: app links, the back-button dispatcher and
// the pending invitation (outside the app, i.e. on the web).
import assert from "node:assert/strict";
import { test } from "vitest";
import { isAppLink, parseAuthLink } from "../../src/lib/authLink";
import { dispatchBack, pushBackHandler } from "../../src/lib/backStack";

const BASE = "smartats://app";

test("an app link carries the session, the type and the invitation", () => {
  const link = parseAuthLink(
    "smartats://app?invite=abc123#access_token=AT&refresh_token=RT&expires_in=3600&type=signup",
  );
  assert.deepEqual(link.tokens, { access_token: "AT", refresh_token: "RT" });
  assert.equal(link.invite, "abc123");
  assert.equal(link.type, "signup");
  assert.equal(
    parseAuthLink("smartats://app#access_token=A&refresh_token=R&type=recovery").type,
    "recovery",
  );
});

test("an expired or cancelled app link gives a message and no session", () => {
  const expired = parseAuthLink(
    "smartats://app#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  assert.equal(expired.tokens, null);
  assert.ok(expired.error);
  assert.equal(parseAuthLink("smartats://app#access_token=A").tokens, null);
});

test("isAppLink accepts only this app's address", () => {
  assert.equal(isAppLink("smartats://app?invite=1", BASE), true);
  assert.equal(isAppLink("smartats://app#access_token=a", BASE), true);
  assert.equal(isAppLink("smartats://app", BASE), true);
  assert.equal(isAppLink("smartats://application", BASE), false);
  assert.equal(isAppLink("https://evil.example/smartats://app", BASE), false);
});

test("back: the newest handler wins; a declined press falls through; nothing left → false", () => {
  const calls: string[] = [];
  const offScreen = pushBackHandler(() => (calls.push("screen"), true));
  const offSheet = pushBackHandler(() => (calls.push("sheet"), true));
  const offGuard = pushBackHandler(() => (calls.push("guard"), false));
  assert.equal(dispatchBack(), true);
  assert.deepEqual(calls, ["guard", "sheet"]);
  offSheet();
  offGuard();
  assert.equal(dispatchBack(), true);
  assert.deepEqual(calls.at(-1), "screen");
  offScreen();
  assert.equal(dispatchBack(), false);
});
