const { readListItems } = require("./listStore");

const PERSONNEL_LIST_KEYS = [
  "hlfd-rms-personnel",
  "personnel",
];

async function loadPersonnelItems(db, departmentId) {
  for (const listKey of PERSONNEL_LIST_KEYS) {
    const items = await readListItems(db, departmentId, listKey);
    if (items.length) return items;
  }
  return [];
}

async function resolvePersonnelPhones(db, departmentId, personnelIds = []) {
  const targets = new Set(
    (Array.isArray(personnelIds) ? personnelIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );

  if (!targets.size) return [];

  const items = await loadPersonnelItems(db, departmentId);
  return items
    .filter((person) => targets.has(String(person.id || "").trim()))
    .map((person) => ({
      personnelId: person.id,
      name: person.name || person.id,
      phone: person.phone || "",
      smsOptIn: person.smsOptIn !== false,
    }));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Link the caller's membership to their personnel record, matched by their
 * verified sign-in email (exact match only). Members can't set personnelId
 * themselves (firestore.rules), so this is the only self-service way to link.
 * Never relinks, and never links a record another member already holds.
 */
async function linkMyPersonnelRecord(db, request) {
  const { HttpsError } = require("firebase-functions/v2/https");
  const uid = request?.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  const departmentId = String(request.data?.departmentId || "").trim();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");

  const memberRef = db.doc(`departments/${departmentId}/users/${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) throw new HttpsError("permission-denied", "You are not a member of this department.");
  const member = memberSnap.data() || {};
  if (member.personnelId) return { linked: true, personnelId: member.personnelId, alreadyLinked: true };

  const email = normalizeEmail(request.auth.token?.email);
  if (!email || request.auth.token?.email_verified !== true) {
    return { linked: false, reason: "unverified_email" };
  }

  const items = await loadPersonnelItems(db, departmentId);
  const matches = items.filter((person) => person?.id && normalizeEmail(person.email) === email);
  if (matches.length !== 1) {
    return { linked: false, reason: matches.length ? "multiple_matches" : "no_match" };
  }
  const personnelId = String(matches[0].id);

  const taken = await db.collection(`departments/${departmentId}/users`)
    .where("personnelId", "==", personnelId).limit(2).get();
  if (taken.docs.some((doc) => doc.id !== uid)) {
    return { linked: false, reason: "already_linked_to_another_member" };
  }

  await memberRef.set({ personnelId, updatedAt: new Date().toISOString() }, { merge: true });
  return { linked: true, personnelId };
}

module.exports = {
  resolvePersonnelPhones,
  loadPersonnelItems,
  linkMyPersonnelRecord,
};
