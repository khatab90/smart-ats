#!/usr/bin/env node
// Builds a single-file emulator (dist-emulator/ats-emulator.mjs) that runs
// with plain `node ats-emulator.mjs` on any machine — no npm install needed.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const out = new URL("../../dist-emulator/", import.meta.url);
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [new URL("./cli.mjs", import.meta.url).pathname],
  outfile: new URL("ats-emulator.mjs", out).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "// Smart ATS device emulator — bundled. Configure with emulator.config.json next to this file." },
});
copyFileSync(new URL("./emulator.config.example.json", import.meta.url), new URL("emulator.config.example.json", out));
console.log("dist-emulator/ats-emulator.mjs");
