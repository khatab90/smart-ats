import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Pure logic, database and emulator tests run in Node; component tests
    // opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx,mjs}", "tools/**/*.test.{ts,mjs}"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
