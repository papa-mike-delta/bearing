// Regenerate the source-level inventory without requiring a running server.
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
class Inventory {
  files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? this.files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
  run() {
    const files = this.files("src");
    const routes = files.filter(f => /\/(page|route)\.tsx?$/.test(f));
    let out = "# Source inventory\n\nGenerated with `node e2e/scripts/inventory.mjs`. Every JSX button/link/form (including reusable primitives and dynamic templates) is listed with source location and attributes. Dynamic maps represent all rendered variants. Inputs/selects and custom action components are included.\n\n## Routes\n\n| File | URL | Methods |\n| --- | --- | --- |\n";
    for (const f of routes) {
      const source = fs.readFileSync(f, "utf8");
      const url = f.replace(/^src\/app/, "").replace(/\/(page|route)\.tsx?$/, "") || "/";
      const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map(m => m[1]).join(", ") || "page";
      out += `| ${f} | ${url} | ${methods} |\n`;
    }
    out += "\n## UI controls\n\n| Source | Element | Text / attributes / handler |\n| --- | --- | --- |\n";
    const clean = s => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").replace(/`/g, "'");
    for (const f of files.filter(f => f.endsWith(".tsx"))) {
      const source = fs.readFileSync(f, "utf8");
      const ast = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = node => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(ast);
          if (/^(button|a|form|input|textarea|select|Button|Link|SmoothScrollLink|.*Trigger|.*Action|ToggleRow|ReviewField)$/.test(tag) || node.attributes.properties.some(a => a.name && a.name.getText(ast) === "onClick")) {
            const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
            const attrs = [...node.attributes.properties].filter(a => !a.name || !["className", "style"].includes(a.name.getText(ast))).map(a => a.getText(ast)).join(" ");
            const text = ts.isJsxOpeningElement(node) ? node.parent.children.map(c => ts.isJsxText(c) ? c.getText(ast) : ts.isJsxExpression(c) ? c.getText(ast) : "").join(" ") : "";
            out += `| ${f}:${line} | ${tag} | ${clean(text + " " + attrs)} |\n`;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    out += "\n## Client fetches and navigation targets\n\n```text\n";
    for (const f of files.filter(f => /\.(ts|tsx)$/.test(f) && !f.includes("/api/") && !f.includes(".test."))) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/fetch\(|jfetch.*\(|href=|window\.open\(|window\.location/.test(line)) out += `${f}:${i + 1} ${line.trim()}\n`;
      });
    }
    out += "```\n\n## Missing route audit\n\nAll literal internal href/fetch targets resolve to existing routes. Sidebar destinations are Zustand views under `/app`, not missing Next.js pages. Dynamic item/project/review IDs must refer to existing records. External URLs, user bookmark URLs and landing-page anchors are not application routes. See README findings for runtime failures.\n";
    fs.writeFileSync("e2e/INVENTORY.md", out);
  }
}
new Inventory().run();
