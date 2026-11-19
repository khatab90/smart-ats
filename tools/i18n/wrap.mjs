// One-off codemod: wraps every Arabic user-facing string in src/ with t().
// Usage: node tools/i18n/wrap.mjs [--dry]
import ts from "typescript";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = new URL("../../src/", import.meta.url).pathname;
const AR = /[؀-ۿ]/;
const dry = process.argv.includes("--dry");

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "i18n" ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts") && f !== "database.types.ts" ? [p] : [];
  });
}

const q = (s) => JSON.stringify(s);

/** React's JSX whitespace rule for a text child. */
function jsxRendered(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, " ");
    if (i > 0) l = l.replace(/^\s+/, "");
    if (i < lines.length - 1) l = l.replace(/\s+$/, "");
    if (l) out.push(l);
  });
  return out.join(" ");
}

function isTCall(node) {
  const p = node.parent;
  return p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "t";
}

let total = 0;
for (const file of files(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!AR.test(src)) continue;
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    if (ts.isJsxText(node) && AR.test(node.text)) {
      const r = jsxRendered(node.text);
      const core = r.trim();
      const lead = r.startsWith(" ") ? '{" "}' : "";
      const trail = r.endsWith(" ") ? '{" "}' : "";
      edits.push([node.getStart(), node.getEnd(), `${lead}{t(${q(core)})}${trail}`]);
      return;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      AR.test(node.text)
    ) {
      if (isTCall(node)) return;
      const p = node.parent;
      if (ts.isPropertyAssignment(p) && p.name === node) return; // object key
      if (ts.isJsxAttribute(p)) {
        edits.push([node.getStart(), node.getEnd(), `{t(${q(node.text)})}`]);
      } else {
        edits.push([node.getStart(), node.getEnd(), `t(${q(node.text)})`]);
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => AR.test(p))) {
        let key = node.head.text;
        const vars = [];
        node.templateSpans.forEach((s, i) => {
          key += `{${i}}` + s.literal.text;
          vars.push(`${i}: ${s.expression.getText(sf)}`);
        });
        const call = `t(${q(key)}, { ${vars.join(", ")} })`;
        const inAttr = node.parent && ts.isJsxExpression(node.parent);
        edits.push([node.getStart(), node.getEnd(), inAttr ? call : call]);
        return; // expressions inside are kept verbatim (nested Arabic is rare)
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, text] of edits) out = out.slice(0, s) + text + out.slice(e);
  const rel = relative(dirname(file), join(ROOT, "i18n")).replace(/\\/g, "/");
  const spec = rel.startsWith(".") ? rel : `./${rel}`;
  if (!/import \{[^}]*\bt\b[^}]*\} from "[^"]*i18n"/.test(out)) {
    // after the last import
    const imports = [...out.matchAll(/^import [\s\S]*?;\n/gm)];
    const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
    out = out.slice(0, at) + `import { t } from "${spec}";\n` + out.slice(at);
  }
  total += edits.length;
  console.log(`${relative(ROOT, file)}: ${edits.length}`);
  if (!dry) writeFileSync(file, out);
}
console.log("total", total);
