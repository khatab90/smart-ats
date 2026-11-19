// List Arabic string literals in src that are not the first argument of t()/tr().
import ts from "typescript";
import fs from "fs";
import path from "path";
// The language picker shows each language in its own script.
const ALLOW = new Set(["العربية"]);
const AR = /[؀-ۿ]/;
const out = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (!p.includes("i18n")) walk(p);
    } else if (/\.tsx?$/.test(f)) check(p);
  }
}
function check(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  (function v(n) {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) &&
      AR.test(n.text ?? n.getText())
    ) {
      const p = n.parent;
      const ok =
        ts.isCallExpression(p) &&
        ["t", "tr"].includes(p.expression.getText()) &&
        p.arguments[0] === n;
      if (!ok && !ALLOW.has(n.text))
        out.push(
          `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${n.getText().slice(0, 60)}`,
        );
    }
    ts.forEachChild(n, v);
  })(sf);
}
walk("src");
if (out.length) {
  console.error("Arabic text not wrapped in t():\n" + out.join("\n"));
  process.exit(1);
}
console.log("i18n: every Arabic string goes through t()");
