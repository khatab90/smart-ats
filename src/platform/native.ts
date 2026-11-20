import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

/**
 * The only module that talks to the native shell (Capacitor). Outside the
 * app (unit tests, the development preview) everything here is a no-op.
 */

export const isNative = () => Capacitor.isNativePlatform();

type Unsubscribe = () => void;

function listener(add: () => Promise<{ remove: () => Promise<void> }>): Unsubscribe {
  let removed = false;
  let handle: { remove: () => Promise<void> } | null = null;
  void add().then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}

/** Android back button. */
export function onHardwareBack(fn: () => void): Unsubscribe {
  if (!isNative()) return () => {};
  return listener(() => App.addListener("backButton", () => fn()));
}

/** Leaves the app running in the background, like the home screen would. */
export function moveToBackground() {
  if (isNative()) void App.minimizeApp();
}

// Each link is handled once, even if both the launch URL and the event report
// it, or a component subscribes twice (React StrictMode).
const handledLinks = new Set<string>();

/** Links that open the app (smartats://app…), including the one it was launched with. */
export function onAppLink(fn: (url: string) => void): Unsubscribe {
  if (!isNative()) return () => {};
  let active = true;
  const handle = (url: string | undefined) => {
    if (!active || !url || handledLinks.has(url)) return;
    handledLinks.add(url);
    fn(url);
  };
  void App.getLaunchUrl().then((r) => handle(r?.url));
  const off = listener(() => App.addListener("appUrlOpen", (e) => handle(e.url)));
  return () => {
    active = false;
    off();
  };
}

/** The app came back to the foreground. */
export function onAppResume(fn: () => void): Unsubscribe {
  const onVisibility = () => {
    if (document.visibilityState === "visible") fn();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}

/**
 * Opens a page in the phone's browser over the app (Google sign-in: Google
 * refuses sign-in inside an app's web view).
 */
export async function openInBrowser(url: string) {
  await Browser.open({ url, presentationStyle: "popover" });
}

/** Closes the browser opened by openInBrowser (after the app link came back). */
export function closeBrowser() {
  if (isNative()) void Browser.close().catch(() => {});
}
