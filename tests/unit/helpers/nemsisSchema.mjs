// Loads the generated NEMSIS bundle for Node tests (the browser uses src/lib/nemsis/index.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNemsisSchema } from "../../../src/lib/nemsis/schema.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadNemsisSchema(version = "3.5.1") {
  const dir = path.join(ROOT, "src", "data", "nemsis", version);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  return createNemsisSchema({
    structure: read("structure.json"),
    types: read("types.json"),
    elements: read("elements.json"),
    enumerations: read("enumerations.json"),
    meta: read("meta.json"),
  });
}
