import { describe, expect, test } from "vitest";
import { needsFirstPassword, signInProblem } from "../../src/domain/account";

describe("signInProblem", () => {
  test("tells each refused sign-in apart", () => {
    expect(signInProblem({ status: "none" })).toBe("no_account");
    expect(signInProblem({ status: "unconfirmed", password: true, google: false })).toBe(
      "unconfirmed",
    );
    expect(signInProblem({ status: "ready", password: true, google: true })).toBe("wrong_password");
    expect(signInProblem({ status: "ready", password: false, google: true })).toBe("google");
    expect(signInProblem({ status: "ready", password: false, google: false })).toBe("no_password");
  });
});

describe("needsFirstPassword", () => {
  test("only a confirmed account opened by an email link", () => {
    expect(needsFirstPassword({ status: "ready", password: false, google: false })).toBe(true);
    expect(needsFirstPassword({ status: "ready", password: false, google: true })).toBe(false);
    expect(needsFirstPassword({ status: "ready", password: true, google: false })).toBe(false);
    expect(needsFirstPassword({ status: "unconfirmed", password: false, google: false })).toBe(
      false,
    );
    expect(needsFirstPassword({ status: "none" })).toBe(false);
    expect(needsFirstPassword(null)).toBe(false);
  });
});
