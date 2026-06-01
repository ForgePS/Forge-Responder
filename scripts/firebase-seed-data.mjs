import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const root = process.cwd();
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service account JSON before running this script.");
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, "utf8"));
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`;
initializeApp({ credential: cert(serviceAccount), storageBucket });

const db = getFirestore();
const bucket = getStorage().bucket();

const datasets = [
  ["emsProtocolsFull", "src/data/emsProtocolsFull.json"],
  ["fireSogsFull", "src/data/fireSogsFull.json"],
  ["fireSogDetails", "src/data/fireSogDetails.json"],
  ["fireCodesFull", "src/data/fireCodesFull.json"],
  ["fireCodeIndexFull", "src/data/fireCodeIndexFull.json"],
  ["fireCodePdfSections", "src/data/fireCodePdfSections.json"],
  ["fireCodeDocxSections", "src/data/fireCodeDocxSections.json"],
  ["hoseInventory", "src/data/hoseInventory.json"]
];

for (const [key, relativeFile] of datasets) {
  const file = path.join(root, relativeFile);
  try {
    const items = JSON.parse(await fs.readFile(file, "utf8"));
    const hydratedItems = await hydrateSourceDocuments(key, items);
    await seedCollection(key, hydratedItems);
    await db.collection("appData").doc(key).set({
      collection: key,
      count: Array.isArray(hydratedItems) ? hydratedItems.length : 1,
      updatedAt: new Date().toISOString()
    });
    console.log(`Seeded ${key}: ${Array.isArray(hydratedItems) ? hydratedItems.length : 1} item(s)`);
  } catch (error) {
    console.warn(`Skipped ${key}: ${error.message}`);
  }
}

async function seedCollection(collectionName, items) {
  if (!Array.isArray(items)) return;
  const batchLimit = 450;
  for (let index = 0; index < items.length; index += batchLimit) {
    const batch = db.batch();
    items.slice(index, index + batchLimit).forEach((item, offset) => {
      const sortOrder = index + offset;
      const id = documentIdFor(item, sortOrder);
      batch.set(db.collection(collectionName).doc(id), { ...item, sortOrder });
    });
    await batch.commit();
  }
  await db.collection("appData").doc(collectionName).set({ staleItemsRemovedAt: FieldValue.serverTimestamp() }, { merge: true });
}

function documentIdFor(item, index) {
  const raw = item.id || item.code || item.section || item.label || String(index);
  return String(raw)
    .replaceAll("/", "-")
    .replaceAll("\\", "-")
    .replaceAll("#", "-")
    .trim()
    .slice(0, 120) || String(index);
}

async function hydrateSourceDocuments(key, items) {
  if (!Array.isArray(items)) return items;
  if (key === "fireSogDetails") return hydrateSourceFiles(items, "public/documents/sogs", "source/sogs");
  if (key === "fireCodePdfSections") return hydrateSourceFiles(items, "public/documents/codes", "source/fire-codes");
  return items;
}

async function hydrateSourceFiles(items, localFolder, storageFolder) {
  const urlCache = new Map();
  const hydrated = [];

  for (const item of items) {
    if (!item.sourceFile) {
      hydrated.push(item);
      continue;
    }

    const localPath = path.join(root, localFolder, item.sourceFile);
    const cacheKey = `${storageFolder}/${item.sourceFile}`;
    try {
      if (!urlCache.has(cacheKey)) {
        urlCache.set(cacheKey, await uploadSourceFile(localPath, cacheKey));
      }
      const uploaded = urlCache.get(cacheKey);
      hydrated.push({ ...item, sourceUrl: uploaded.downloadUrl, storagePath: uploaded.storagePath });
    } catch (error) {
      console.warn(`Kept local source for ${item.sourceFile}: ${error.message}`);
      hydrated.push(item);
    }
  }

  return hydrated;
}

async function uploadSourceFile(localPath, storagePath) {
  const token = crypto.randomUUID();
  const destination = storagePath.replaceAll("\\", "/");
  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType: contentTypeFor(localPath),
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const encodedPath = encodeURIComponent(destination);
  return {
    storagePath: destination,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`
  };
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}
