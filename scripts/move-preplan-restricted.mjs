/**
 * Move restricted preplan answers (gate codes, gas / electric shutoffs, hazmat,
 * and any field a template marks sensitive) out of
 * departments/{id}/preplanRevisions/{revisionId}.sectionAnswers (readable by
 * every member) into departments/{id}/preplanRestricted/{revisionId}
 * (officers / editors only). Narrative fields on the revision that contain a
 * restricted value are rebuilt from the other answers.
 *
 * Prints counts only, never values.
 * Default: dry run, changes nothing. --apply makes the move.
 * Safe to run more than once: values already in preplanRestricted are kept.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-preplan-restricted.mjs *> move-preplan-restricted.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-preplan-restricted.mjs --apply *> move-preplan-restricted.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  PREPLAN_NARRATIVE_FIELDS,
  PREPLAN_RESTRICTED_COLLECTION,
  preplanSensitiveKeys,
  splitPreplanAnswers,
  syncPreplanNarrative,
} from "../src/lib/inspections/preplanRestricted.js";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const totals = { departments: 0, revisions: 0, keys: 0, narratives: 0, preplanDocsWithAnswers: 0 };

  for (const dept of await db.collection("departments").listDocuments()) {
    const revisions = await dept.collection("preplanRevisions").get();
    let deptRevisions = 0;
    let deptKeys = 0;
    let deptNarratives = 0;

    for (const snap of revisions.docs) {
      const data = snap.data() || {};
      const answers = data.sectionAnswers && typeof data.sectionAnswers === "object" ? data.sectionAnswers : {};
      const keys = preplanSensitiveKeys(data.templateSnapshot);
      const { publicAnswers, restrictedAnswers: inline } = splitPreplanAnswers(answers, keys);
      const inlineKeys = Object.keys(inline);

      const restrictedRef = dept.collection(PREPLAN_RESTRICTED_COLLECTION).doc(snap.id);
      const existing = inlineKeys.length || PREPLAN_NARRATIVE_FIELDS.some((f) => data[f])
        ? ((await restrictedRef.get()).data()?.answers || {})
        : {};
      // Scrub narratives against everything restricted we know for this revision.
      const knownRestricted = { ...inline, ...existing };
      const synced = syncPreplanNarrative({ ...data, sectionAnswers: publicAnswers }, keys, knownRestricted);
      const narrativeUpdates = {};
      for (const field of PREPLAN_NARRATIVE_FIELDS) {
        if (String(data[field] || "") && synced[field] !== String(data[field] || "")) narrativeUpdates[field] = synced[field];
      }
      const narrativeCount = Object.keys(narrativeUpdates).length;
      if (!inlineKeys.length && !narrativeCount) continue;

      deptRevisions += 1;
      deptKeys += inlineKeys.length;
      deptNarratives += narrativeCount;
      if (!APPLY) continue;

      if (inlineKeys.length) {
        // Keep anything already in preplanRestricted (the app wrote it later).
        const moving = {};
        for (const key of inlineKeys) {
          if (!(key in existing) || String(existing[key] ?? "").trim() === "") moving[key] = inline[key] ?? "";
        }
        await restrictedRef.set({
          preplanId: String(data.preplanId || ""),
          revisionId: snap.id,
          answers: moving,
          updatedAt: new Date().toISOString(),
          updatedBy: "move-preplan-restricted",
        }, { merge: true });
      }
      await snap.ref.set({
        ...narrativeUpdates,
        sectionAnswers: Object.fromEntries(inlineKeys.map((key) => [key, FieldValue.delete()])),
      }, { merge: true });
    }

    // Preplan docs themselves shouldn't carry answers; count any that do so they can be checked.
    const preplans = await dept.collection("preplans").get();
    const withAnswers = preplans.docs.filter((doc) => {
      const d = doc.data() || {};
      return (d.sectionAnswers && typeof d.sectionAnswers === "object") || PREPLAN_NARRATIVE_FIELDS.some((f) => d[f]);
    }).length;
    totals.preplanDocsWithAnswers += withAnswers;

    if (!deptRevisions && !withAnswers) continue;
    totals.departments += 1;
    totals.revisions += deptRevisions;
    totals.keys += deptKeys;
    totals.narratives += deptNarratives;
    console.log(
      `${dept.id}: ${deptRevisions} revision(s), ${deptKeys} restricted answer(s), ${deptNarratives} narrative field(s) rebuilt`
      + (withAnswers ? `; ${withAnswers} preplan doc(s) carry answer/narrative fields (not changed; check by hand)` : ""),
    );
  }

  console.log(
    `\n${APPLY ? "Moved" : "Would move"} ${totals.keys} restricted answer(s) from ${totals.revisions} revision(s)`
    + ` in ${totals.departments} department(s); ${totals.narratives} narrative field(s) ${APPLY ? "rebuilt" : "to rebuild"}.`,
  );
  if (totals.preplanDocsWithAnswers) {
    console.log(`${totals.preplanDocsWithAnswers} preplan doc(s) carry answer/narrative fields — not touched by this script.`);
  }
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
