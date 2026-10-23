import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve("src/styles.css");
let content = readFileSync(cssPath, "utf8");

for (let size = 8; size <= 13; size += 1) {
  content = content.replace(new RegExp(`font-size:\\s*${size}px`, "g"), "font-size: 14px");
}

if (!content.includes("html { font-size: 14px")) {
  content = content.replace(
    ":root {",
    "html { font-size: 14px; }\n:root {"
  );
  content = content.replace(
    "body { margin: 0;",
    "body { margin: 0; font-size: 14px;"
  );
}

writeFileSync(cssPath, content);
const count = (content.match(/font-size: 14px/g) || []).length;
console.log(`Updated styles.css (${count} rules at 14px)`);
