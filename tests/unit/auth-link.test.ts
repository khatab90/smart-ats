// Results of email links and Google sign-in read from the page address.
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { linkErrorText, parseAuthLink } from "../../src/lib/authLink";

describe("parseAuthLink", () => {
  test("session and invitation from an app link", () => {
    const link = parseAuthLink(
      "smartats://app?invite=abc123#access_token=AT&refresh_token=RT&expires_in=3600&type=signup",
    );
    assert.deepEqual(link, {
      invite: "abc123",
      tokens: { access_token: "AT", refresh_token: "RT" },
      type: "signup",
      error: null,
    });
  });

  test("recovery link", () => {
    const link = parseAuthLink("smartats://app#access_token=A&refresh_token=R&type=recovery");
    assert.equal(link.type, "recovery");
    assert.ok(link.tokens);
  });

  test("expired link gives an Arabic message and no session", () => {
    const link = parseAuthLink(
      "smartats://app?invite=x#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    assert.equal(link.tokens, null);
    assert.equal(link.invite, "x");
    assert.match(link.error ?? "", /انتهت صلاحية الرابط/);
  });

  test("other errors, also when Supabase puts them in the query", () => {
    const link = parseAuthLink("https://example.com/?error=server_error&error_description=boom");
    assert.match(link.error ?? "", /تعذر فتح الرابط/);
  });

  test("navigation hashes and plain pages are not auth links", () => {
    for (const url of ["http://localhost:5173/#/logs:runtime", "https://localhost/", "not a url"]) {
      assert.deepEqual(parseAuthLink(url), {
        invite: null,
        tokens: null,
        type: null,
        error: null,
      });
    }
  });

  test("a token without its refresh token does not start a session", () => {
    assert.equal(parseAuthLink("smartats://app#access_token=A").tokens, null);
  });
});

test("cancelling the Google screen reads as a cancellation", () => {
  assert.equal(
    linkErrorText("access_denied", "The user denied the request (cancelled)"),
    "أُلغي تسجيل الدخول بـ Google.",
  );
  const link = parseAuthLink(
    "http://localhost:4173/?error=access_denied&error_code=access_denied&error_description=User+cancelled",
  );
  assert.equal(link.error, "أُلغي تسجيل الدخول بـ Google.");
});
