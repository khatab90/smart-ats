/**
 * One place that decides what the Android back button does.
 *
 * Whatever is on top handles it first: an open dialog or sheet closes, then
 * a pushed screen closes, then the app returns to the home tab. When nothing
 * handles it, the platform layer sends the app to the background.
 *
 * A handler returns true when it consumed the press.
 */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Runs handlers from the most recent one; returns whether one consumed the press. */
export function dispatchBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!()) return true;
  }
  return false;
}
