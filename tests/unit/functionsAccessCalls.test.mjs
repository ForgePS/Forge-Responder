// Run: npm run test:unit
// The access checks in functions/lib/access.js take (db, departmentId, auth).
// A call with the wrong first argument fails at runtime on every request, and
// the app only sees a bare "internal" error, so guard the call sites here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("../../functions/", import.meta.url);
const CHECKS = /\b(assertDepartmentAccess|assertDepartmentAccessOrPublicGateway|assertDepartmentManage)\(\s*([^,)]*)/g;

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? jsFiles(full) : name.endsWith(".js") ? [full] : [];
  });
}

describe("function access checks", () => {
  it("always pass the database first, then the department, then auth", () => {
    const bad = [];
    for (const file of jsFiles(ROOT.pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(CHECKS)) {
        const first = match[2].trim();
        if (/^(async )?function\b/.test(text.slice(Math.max(0, match.index - 15), match.index + 1))) continue;
        if (first === "db" || first.startsWith("admin.firestore(") || first === "") continue;
        bad.push(`${path.basename(file)}: ${match[1]}(${first}, ...)`);
      }
    }
    assert.deepEqual(bad, []);
  });
});
