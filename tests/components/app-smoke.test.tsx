// @vitest-environment jsdom
// Boots the whole app without a session: providers, lazy screens and the
// auth flow must render without throwing.
import { cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import App from "../../src/App";

afterEach(cleanup);

test("the app boots to the sign-in screen", async () => {
  render(<App />);
  assert.ok(await screen.findByRole("heading", { name: "تسجيل الدخول" }, { timeout: 5000 }));
});
