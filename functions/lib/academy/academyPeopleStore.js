/**
 * Person academy links + cache (department-scoped).
 * people/{personId}/academyLinks/{linkId}
 * people/{personId}/academyCache/{connectionId}
 */

const { newLinkId } = require("./types");
const { writeAcademyAudit } = require("./academyAudit");

function linksCol(db, departmentId, personId) {
  return db.collection(`departments/${departmentId}/people/${personId}/academyLinks`);
}

function cacheRef(db, departmentId, personId, connectionId) {
  return db.doc(`departments/${departmentId}/people/${personId}/academyCache/${connectionId}`);
}

async function listAcademyLinks(db, departmentId, personId) {
  if (!personId) return [];
  const snap = await linksCol(db, departmentId, personId).get();
  return snap.docs.map((d) => ({ linkId: d.id, ...d.data() }));
}

async function getLinkForConnection(db, departmentId, personId, connectionId) {
  const links = await listAcademyLinks(db, departmentId, personId);
  return links.find((l) => l.connectionId === connectionId && l.status !== "unlinked") || null;
}

async function linkAcademyPerson(db, departmentId, input = {}, actor = {}) {
  const personId = String(input.personId || "").trim();
  const connectionId = String(input.connectionId || "").trim();
  if (!personId || !connectionId) {
    throw new Error("personId and connectionId are required.");
  }

  const existing = await getLinkForConnection(db, departmentId, personId, connectionId);
  if (existing && existing.status === "linked") {
    throw new Error("An active academy link already exists for this person and connection.");
  }

  const linkId = existing?.linkId || newLinkId();
  const now = new Date().toISOString();
  const doc = {
    linkId,
    personId,
    connectionId,
    departmentId,
    academyOrganizationId: String(input.academyOrganizationId || "").trim(),
    providerType: String(input.providerType || "").trim(),
    externalStudentId: String(input.externalStudentId || "").trim() || null,
    femaSid: input.femaSid ? String(input.femaSid).replace(/\D/g, "") : null,
    status: "linked",
    verificationStatus: input.verificationStatus || "unverified",
    matchedBy: input.matchedBy || "manual",
    linkedAt: now,
    linkedBy: actor.uid || "system",
    lastSyncedAt: null,
    source: input.source || "manual",
  };

  await linksCol(db, departmentId, personId).doc(linkId).set(doc, { merge: true });
  await writeAcademyAudit(db, departmentId, {
    connectionId,
    academyOrganizationId: doc.academyOrganizationId,
    personId,
    actor: actor.uid || null,
    actorType: actor.uid ? "user" : "system",
    action: "person.link",
    result: "ok",
    after: doc,
  });

  return doc;
}

async function unlinkAcademyPerson(db, departmentId, { personId, linkId }, actor = {}) {
  const ref = linksCol(db, departmentId, personId).doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Academy link not found.");
  const before = snap.data();
  const after = {
    ...before,
    status: "unlinked",
    unlinkedAt: new Date().toISOString(),
    unlinkedBy: actor.uid || "system",
  };
  await ref.set(after, { merge: true });
  await writeAcademyAudit(db, departmentId, {
    connectionId: before.connectionId,
    academyOrganizationId: before.academyOrganizationId,
    personId,
    actor: actor.uid || null,
    actorType: "user",
    action: "person.unlink",
    result: "ok",
    before,
    after,
  });
  return after;
}

async function resolveAcademyMatchConflict(db, departmentId, input = {}, actor = {}) {
  // Scaffolding: record decision and optionally create link.
  const decision = String(input.decision || "manual_review").trim();
  await writeAcademyAudit(db, departmentId, {
    connectionId: input.connectionId || null,
    personId: input.personId || null,
    actor: actor.uid || null,
    actorType: "user",
    action: "person.resolve_conflict",
    result: "ok",
    meta: {
      decision,
      reviewId: input.reviewId || null,
      message: "Conflict resolution scaffolding.",
    },
  });

  if (decision === "link" && input.personId && input.connectionId) {
    return linkAcademyPerson(db, departmentId, input, actor);
  }

  return { status: "recorded", decision };
}

async function upsertAcademyCache(db, departmentId, personId, connectionId, patch = {}) {
  const ref = cacheRef(db, departmentId, personId, connectionId);
  const now = new Date().toISOString();
  const payload = {
    connectionId,
    personId,
    academyOrganizationId: patch.academyOrganizationId || null,
    activeEnrollments: Number(patch.activeEnrollments || 0),
    completedCourses: Number(patch.completedCourses || 0),
    certificateCount: Number(patch.certificateCount || 0),
    latestCompletionDate: patch.latestCompletionDate || null,
    lastSyncedAt: patch.lastSyncedAt || now,
    syncStatus: patch.syncStatus || "current",
    readOnly: patch.readOnly !== false,
    updatedAt: now,
  };
  await ref.set(payload, { merge: true });
  return payload;
}

async function getAcademyCache(db, departmentId, personId) {
  if (!personId) return [];
  const snap = await db.collection(`departments/${departmentId}/people/${personId}/academyCache`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  listAcademyLinks,
  getLinkForConnection,
  linkAcademyPerson,
  unlinkAcademyPerson,
  resolveAcademyMatchConflict,
  upsertAcademyCache,
  getAcademyCache,
};
