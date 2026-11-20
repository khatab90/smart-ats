import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Pure logic and database tests run in Node; component tests
    // opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
