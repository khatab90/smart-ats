/**
 * Browser storage that never throws. Storage can be unavailable (private
 * mode, sandboxed iframes, full quota); the app then simply forgets
 * conveniences such as the last selected device instead of crashing.
 */
type Area = "local" | "session";

function area(kind: Area): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string, kind: Area = "local"): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string, kind: Area = "local") {
  try {
    area(kind)?.setItem(key, value);
  } catch {
    /* storage unavailable: keep working without it */
  }
}

export function removeStorage(key: string, kind: Area = "local") {
  try {
    area(kind)?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
