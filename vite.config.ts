import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig(({ mode }) => ({
  // The app's screens, bundled into the Android app by Capacitor
  // (capacitor.config.ts → webDir "dist"). Relative paths for its local origin.
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  // The Android app (`--mode native`) ships without source maps.
  build: { sourcemap: mode !== "native", target: "es2020" },
}));
