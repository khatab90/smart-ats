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
  // Relative base so the same build works on any host path and inside a
  // Capacitor WebView (file / capacitor:// origins).
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  // Public web build (`--mode web`) and the Android app (`--mode native`):
  // no source maps.
  build: { sourcemap: mode !== "web" && mode !== "native", target: "es2020" },
}));
