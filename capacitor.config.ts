import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell (Android). The web build in dist/ is copied into the app by
 * `npm run android:sync`; see docs/ANDROID_BUILD.md.
 */
const config: CapacitorConfig = {
  appId: "iq.smartats.app",
  appName: "Smart ATS",
  webDir: "dist",
  android: {
    // Same colour as the app canvas, so no flash while the WebView loads.
    backgroundColor: "#f3f6fb",
  },
  plugins: {
    // Core plugin (Capacitor 8): draws edge to edge and exposes the system
    // bar sizes to CSS through env(safe-area-inset-*). DEFAULT follows the
    // phone's light / dark setting for the bar icons.
    SystemBars: {
      insetsHandling: "css",
      style: "DEFAULT",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
