/**
 * Move FORGE Academy hub secrets out of departments/{id}/settings/main.forgeAcademy
 * (readable by every member) into departments/{id}/integrations/forgeAcademyHub
 * (server-only). The server reads them from there.
 *
 * Prints only whether each secret is present, never its value.
 * Default: dry run, changes nothing. --apply makes the move.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-hub-secrets.mjs *> move-hub-secrets.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-hub-secrets.mjs --apply *> move-hub-secrets.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const FIELDS = ["hubBearerToken", "hubSecret", "webhookSecret", "outboundSecret"];

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  let moved = 0;
  for (const dept of await db.collection("departments").listDocuments()) {
    const settingsRef = dept.collection("settings").doc("main");
    const snap = await settingsRef.get();
    const fa = snap.exists ? snap.data()?.forgeAcademy || {} : {};
    const present = FIELDS.filter((field) => String(fa[field] || "").trim());
    const blank = FIELDS.filter((field) => field in fa && !String(fa[field] || "").trim());
    if (!present.length && !blank.length) continue;
    console.log(`${dept.id}: secrets present: ${present.join(", ") || "none"}${blank.length ? ` (blank: ${blank.join(", ")})` : ""}`);
    if (!APPLY) continue;
    if (present.length) {
      const secretRef = dept.collection("integrations").doc("forgeAcademyHub");
      const existing = (await secretRef.get()).data() || {};
      const update = { updatedAt: new Date().toISOString() };
      for (const field of present) {
        if (!existing[field]) update[field] = String(fa[field]).trim();
      }
      await secretRef.set(update, { merge: true });
    }
    await settingsRef.update(Object.fromEntries([...present, ...blank].map((field) => [`forgeAcademy.${field}`, FieldValue.delete()])));
    moved += 1;
  }
  console.log(`\n${APPLY ? "Moved" : "Would move"} secrets for ${moved || "every listed"} department(s).`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
