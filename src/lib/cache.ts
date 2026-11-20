/**
 * Data already fetched in this session, so a screen opened again shows it at
 * once (and refreshes it quietly) instead of a loading placeholder. Kept in
 * memory only; cleared on sign-out so another account never sees it.
 */
const store = new Map<string, unknown>();

export const cacheGet = <T>(key: string): T | undefined => store.get(key) as T | undefined;

export function cacheSet<T>(key: string, value: T) {
  store.set(key, value);
}

export function cacheClear() {
  store.clear();
}

/**
 * Rows cached from `since` onwards, if the cache covers `wantedSince`
 * (it started at or before it); filtered to the wanted window.
 */
export function cachedWindow<T>(
  key: string,
  wantedSince: number,
  timeOf: (row: T) => number,
): T[] | undefined {
  const hit = cacheGet<{ since: number; rows: T[] }>(key);
  if (!hit || hit.since > wantedSince) return undefined;
  return hit.rows.filter((r) => timeOf(r) >= wantedSince);
}
