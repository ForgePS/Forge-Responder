#!/usr/bin/env node
/**
 * Publish parsed IFC JSON to Firestore platform library.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/ifc/publishIfcLibrary.mjs --in scripts/ifc/out/ifc-2024-preview.json
 *
 * Or with gcloud application-default credentials via firebase-admin default init.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

async function main() {
  const input = resolve(ROOT, argValue("--in", "scripts/ifc/out/ifc-2024-preview.json"));
  if (!existsSync(input)) throw new Error(`Missing ${input}. Run parseIfcDocx.mjs first.`);

  const payload = JSON.parse(readFileSync(input, "utf8"));
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "rms-dashboard-7562e",
    });
  }
  const db = admin.firestore();
  const publicationId = payload.publication?.id || "ifc-2024";
  const stamp = new Date().toISOString();

  await db
    .collection("codePublications")
    .doc(publicationId)
    .set(
      {
        ...payload.publication,
        id: publicationId,
        status: "published",
        publishedAt: stamp,
        importedAt: stamp,
        nodeCount: payload.nodes?.length || 0,
        chapterCount: (payload.nodes || []).filter((n) => n.nodeType === "chapter").length,
        updatedAt: stamp,
        createdAt: stamp,
      },
      { merge: true },
    );

  const nodes = payload.nodes || [];
  let written = 0;
  for (let i = 0; i < nodes.length; i += 400) {
    const batch = db.batch();
    for (const node of nodes.slice(i, i + 400)) {
      const id = node.id || `${publicationId}_${node.nodeType}_${node.number}`;
      batch.set(
        db.collection("codeNodes").doc(id),
        { ...node, id, publicationId, updatedAt: stamp, createdAt: node.createdAt || stamp, active: true },
        { merge: true },
      );
      written += 1;
    }
    await batch.commit();
  }

  const batchId = `import-${Date.now().toString(36)}`;
  await db.collection("codeImportBatches").doc(batchId).set({
    id: batchId,
    publicationId,
    sourceFilename: payload.publication?.sourceFilename || "",
    sourceHash: payload.publication?.sourceHash || "",
    status: "published",
    stats: payload.stats || { nodeCount: written },
    errors: payload.errors || [],
    previewSummary: payload.previewSummary || "",
    publishedBy: "scripts/ifc/publishIfcLibrary.mjs",
    createdAt: stamp,
    updatedAt: stamp,
  });

  console.log(JSON.stringify({ ok: true, publicationId, written, batchId }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
