/**
 * Build step for the FORGE Field service worker: writes dist/sw.js with the
 * list of files the field app needs offline (the app entry, the field app's
 * code and their CSS/images), plus a version so phones pick up new deploys.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TEMPLATE = fileURLToPath(new URL("./field-sw-template.js", import.meta.url));
const FIELD_ENTRY = /src[\\/]field[\\/]FieldApp\.jsx$/;
const STATIC_FILES = [
  "/index.html",
  "/field.webmanifest",
  "/field-icon-192.png",
  "/field-icon-512.png",
  "/field-apple-touch-icon.png",
  "/forge-logo.png",
];

export default function fieldServiceWorker() {
  return {
    name: "forge-field-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((file) => file.type === "chunk");
      const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const keep = new Set();

      const visit = (fileName, { followDynamic }) => {
        if (keep.has(fileName)) return;
        const chunk = byFile.get(fileName);
        if (!chunk) return;
        keep.add(fileName);
        chunk.imports.forEach((name) => visit(name, { followDynamic }));
        if (followDynamic) {
          chunk.dynamicImports
            .filter((name) => !/[\\/]src[\\/]pages[\\/]/.test(byFile.get(name)?.facadeModuleId || ""))
            .forEach((name) => visit(name, { followDynamic }));
        }
      };

      const entry = chunks.find((chunk) => chunk.isEntry);
      const field = chunks.find((chunk) => FIELD_ENTRY.test(chunk.facadeModuleId || ""));
      if (!entry || !field) {
        this.warn("FORGE Field: entry or field chunk not found; service worker not written.");
        return;
      }
      visit(entry.fileName, { followDynamic: false });
      visit(field.fileName, { followDynamic: true });

      const files = new Set(STATIC_FILES);
      for (const fileName of keep) {
        files.add(`/${fileName}`);
        const meta = byFile.get(fileName).viteMetadata;
        meta?.importedCss?.forEach((css) => files.add(`/${css}`));
        meta?.importedAssets?.forEach((asset) => files.add(`/${asset}`));
      }

      const urls = [...files].sort();
      const template = readFileSync(TEMPLATE, "utf8");
      const version = createHash("sha256").update(urls.join("\n")).update(template).digest("hex").slice(0, 12);
      const source = template
        .replace("__VERSION__", version)
        .replace("__PRECACHE_URLS__", JSON.stringify(urls, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
