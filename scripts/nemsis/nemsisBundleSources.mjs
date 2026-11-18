// Inputs of the Cloud Functions NEMSIS bundle, and a hash over them (shared by the bundler and its staleness test).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENTRY = path.join(ROOT, "scripts", "nemsis", "functions-entry.js");
export const OUT_FILE = path.join(ROOT, "functions", "lib", "nemsis", "generated", "nemsisCore.cjs");
const SOURCE_DIRS = [path.join(ROOT, "src", "lib", "nemsis"), path.join(ROOT, "src", "data", "nemsis", "3.5.1")];
/** Single files bundled from outside those folders. */
const SOURCE_FILES = [path.join(ROOT, "src", "lib", "pcr", "pcrLifecycle.js")];

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
}

/** sha256 over the entry and every source file (path + contents, line endings normalised). */
export async function nemsisBundleSourceHash() {
  const files = [ENTRY, ...SOURCE_FILES, ...(await Promise.all(SOURCE_DIRS.map(listFiles))).flat()]
    .filter((f) => /\.(js|json)$/.test(f))
    .sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(ROOT, file).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update((await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}
