// Lists every t("…") key in src/ (and reports keys missing from the English
// catalog). Usage: node tools/i18n/keys.mjs [--missing] [--json]
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../src/", import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts") ? [p] : [];
  });
}

export function collectKeys() {
  const keys = new Map(); // key -> first file
  for (const file of files(ROOT)) {
    const src = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        ["t", "tr"].includes(n.expression.text)
      ) {
        const a = n.arguments[0];
        if (
          a &&
          (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) &&
          /[؀-ۿ]/.test(a.text)
        ) {
          if (!keys.has(a.text)) keys.set(a.text, file.slice(ROOT.length));
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = collectKeys();
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        [...keys].map(([k, f]) => ({ k, f })),
        null,
        1,
      ),
    );
  } else {
    const { EN } = await import("../../src/i18n/en.ts").catch(() => ({ EN: {} }));
    const missing = [...keys.keys()].filter((k) => !(k in EN));
    console.log(`${keys.size} keys, ${missing.length} missing in en.ts`);
    if (process.argv.includes("--missing")) missing.forEach((k) => console.log(JSON.stringify(k)));
  }
}
