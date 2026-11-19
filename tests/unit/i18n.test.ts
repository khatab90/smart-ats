// Interface language: every Arabic string has an English translation with
// the same placeholders, and the app speaks English when asked.
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
// @ts-expect-error plain JS tool without type declarations
import { collectKeys } from "../../tools/i18n/keys.mjs";
import { t, textDir, setLangForTests } from "../../src/i18n";
import { EN } from "../../src/i18n/en";

afterEach(() => setLangForTests("ar"));

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

test("every translatable string has an English version", () => {
  const keys = [...(collectKeys() as Map<string, string>).entries()];
  const missing = keys.filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, []);
});

test("translations keep the same placeholders and contain no Arabic", () => {
  for (const [ar, en] of Object.entries(EN)) {
    assert.equal(placeholders(en), placeholders(ar), ar);
    assert.doesNotMatch(en, /[؀-ۿ]/, ar);
  }
});

test("Arabic is the default; English is used when chosen", () => {
  assert.equal(t("تسجيل الدخول"), "تسجيل الدخول");
  assert.equal(textDir(), "rtl");
  setLangForTests("en");
  assert.equal(t("تسجيل الدخول"), "Sign in");
  assert.equal(
    t("تم التحويل من {0} إلى {1}{2}.", { 0: "Grid", 1: "Solar", 2: "" }),
    "Transferred from Grid to Solar.",
  );
  assert.equal(textDir(), "ltr");
});
