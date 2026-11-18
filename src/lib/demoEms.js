/**
 * Online demo: switch the EMS patient care reports on for the Riverside demo, the same way the offline demo
 * does (data in src/data/demoEms.js). Runs from resetDemoData after the roles are written, so it's signed in as
 * the shared demo account, which is the demo's Fire Chief.
 *
 * Keeps what visitors changed: the form settings and sample reports are only added when missing.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { DEMO_EMS_FORM, DEMO_EMS_SETTINGS, DEMO_PCR_ROLE_GRANTS, buildDemoPcrs } from "../data/demoEms.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

const DEMO_CREW_NAME = "Chief A. Sample";

export async function refreshDemoEms(user) {
  const db = getFirestoreDb();
  if (!db || !user?.uid) return 0;
  const dept = (...segments) => doc(db, "departments", DEMO_DEPARTMENT_ID, ...segments);
  const now = new Date().toISOString();

  // Report permissions on the demo roles. Only on roles that exist, so this never creates a half-empty role.
  await Promise.all(Object.entries(DEMO_PCR_ROLE_GRANTS).map(async ([roleId, keys]) => {
    const ref = dept("roles", roleId);
    if (!(await getDoc(ref)).exists()) return;
    await setDoc(ref, { permissions: Object.fromEntries(keys.map((key) => [key, true])), updatedAt: now }, { merge: true });
  }));

  await setDoc(dept("settings", "ems"), { ...DEMO_EMS_SETTINGS, updatedAt: now, updatedBy: "demo-bootstrap" }, { merge: true });
  const formRef = dept("settings", "emsForm");
  if (!(await getDoc(formRef)).exists()) {
    await setDoc(formRef, { ...DEMO_EMS_FORM, updatedAt: now, updatedBy: "demo-bootstrap" });
  }

  // The NEMSIS schema is large: load it only here (and on the ePCR pages).
  const [{ nemsisSchema }, sampleModule] = await Promise.all([
    import("./nemsis/index.js"),
    import("../data/demoPcrSample.json"),
  ]);
  const reports = buildDemoPcrs(nemsisSchema, {
    sample: sampleModule.default || sampleModule,
    crewUid: user.uid,
    crewName: DEMO_CREW_NAME,
    source: "demo-bootstrap",
  });
  // Posted samples are checked by the server (checkPcrOnPost) when they're written.
  const added = await Promise.all(reports.map(async (report) => {
    const ref = dept("pcrs", report.id);
    if ((await getDoc(ref)).exists()) return 0;
    await setDoc(ref, JSON.parse(JSON.stringify(report)));
    return 1;
  }));
  return added.reduce((sum, count) => sum + count, 0);
}
