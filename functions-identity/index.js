const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { assertDepartmentAccess } = require("./lib/access");
const { resolvePersonIdentityViaHub } = require("./lib/forgeHubIdentity");

admin.initializeApp();

exports.resolveForgePersonIdentity = onCall(async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertDepartmentAccess(db, departmentId, request.auth);
  try {
    return await resolvePersonIdentityViaHub(db, departmentId, request.data?.person || {});
  } catch (error) {
    throw new HttpsError("internal", error instanceof Error ? error.message : "Identity resolve failed.");
  }
});
