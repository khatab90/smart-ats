// App preferences: theme resolution, Arabic-Indic digits, power-flow speed.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { flowSeconds } from "../../src/components/PowerFlow";
import { localizeDigits, setDigitStyle, toArabicDigits } from "../../src/lib/digits";
import { fmtDuration, fmtMs, fmtNum, num } from "../../src/lib/format";
import { resolveTheme } from "../../src/lib/prefs";
import { formatTick } from "../../src/lib/series";

afterEach(() => setDigitStyle("latn"));

test("theme: automatic follows the phone; a choice overrides it", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

describe("digits", () => {
  test("conversion keeps separators readable", () => {
    assert.equal(toArabicDigits("230"), "٢٣٠");
    assert.equal(toArabicDigits("49.98 Hz"), "٤٩٫٩٨ Hz");
    assert.equal(toArabicDigits("1,250"), "١٬٢٥٠");
    assert.equal(toArabicDigits("12:05 م"), "١٢:٠٥ م");
    assert.equal(toArabicDigits("قبل 3 د."), "قبل ٣ د.");
  });

  test("Western by default; every formatter follows the chosen style", () => {
    assert.equal(fmtNum(230.5, 1), "230.5");
    setDigitStyle("arab");
    assert.equal(fmtNum(230.5, 1), "٢٣٠٫٥");
    assert.equal(fmtMs(1000), "١٫٠ s");
    assert.equal(fmtDuration(18_000), "١٨ ث");
    assert.equal(num(7), "٧");
    assert.equal(formatTick(0.25, 0.25), "٠٫٢٥");
    assert.equal(localizeDigits("ATS"), "ATS");
  });
});

test("dots move faster when the house draws more power", () => {
  assert.equal(flowSeconds(null), 2.6);
  assert.equal(flowSeconds(500), 2.6);
  assert.ok(flowSeconds(2000) < flowSeconds(1000));
  assert.equal(flowSeconds(9000), 1.2);
});

test("numbers inside identifiers stay Western", () => {
  assert.equal(toArabicDigits("ATS-TEST01"), "ATS-TEST01");
  assert.equal(toArabicDigits("ESP32 • -58 dBm"), "ESP32 • -٥٨ dBm");
  assert.equal(toArabicDigits("emulator-2.1"), "emulator-2.1");
  assert.equal(toArabicDigits("user123@gmail.com"), "user123@gmail.com");
  assert.equal(toArabicDigits("قيد التأهيل 5/12 ث"), "قيد التأهيل ٥/١٢ ث");
  assert.equal(toArabicDigits("48.0–52.0 Hz"), "٤٨٫٠–٥٢٫٠ Hz");
});
