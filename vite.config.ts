import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Relative base so the same build works on any host path and inside a
  // Capacitor WebView (file / capacitor:// origins).
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  // `--mode web` (npm run build:web) is the public build: no source maps.
  build: { sourcemap: mode !== "web", target: "es2020" },
}));
