/**
 * Digit style for everything the app formats: Western (230.5) or
 * Arabic-Indic (٢٣٠٫٥). A user preference, applied by the format helpers.
 * Identifiers (device IDs, emails, PIN) and input fields always stay Western.
 */
export type DigitStyle = "latn" | "arab";

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
let style: DigitStyle = "latn";

export function setDigitStyle(next: DigitStyle) {
  style = next;
}

export const digitStyle = () => style;

/**
 * Numbers inside identifiers stay Western: digits touching Latin letters or
 * "@", "_" (ESP32, ATS-TEST01, emulator-2.1, emails) are left alone.
 */
const NUMBER = /(?<![A-Za-z0-9@_.,]|[A-Za-z0-9]-)\d+(?:[.,]\d+)*(?![A-Za-z@_\d])/g;

/** Converts standalone Western numbers (and their separators) to Arabic-Indic. */
export function toArabicDigits(s: string): string {
  return s.replace(NUMBER, (n) =>
    n
      .replace(/\./g, "٫")
      .replace(/,/g, "٬")
      .replace(/\d/g, (d) => ARABIC[Number(d)]!),
  );
}

/** Applies the current digit style to formatted text. */
export function localizeDigits(s: string): string {
  return style === "arab" ? toArabicDigits(s) : s;
}
