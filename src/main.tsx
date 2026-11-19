import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./index.css";
import { parseAuthLink } from "./lib/authLink";
import { captureInviteFromUrl } from "./lib/invite";
import { applyStoredPrefs } from "./lib/prefs";
import { reloadForNewVersion } from "./lib/staleBuild";

applyStoredPrefs();
captureInviteFromUrl();

// An email link or Google sign-in that failed comes back with an error in the
// address; show why, and drop it so a refresh does not show it again.
const linkError = parseAuthLink(window.location.href).error;
if (linkError) window.history.replaceState(null, "", window.location.pathname);

// A newer version was published while this tab was open: its old screen
// files are gone, so load the new version instead of failing.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App linkError={linkError} />
  </React.StrictMode>,
);
