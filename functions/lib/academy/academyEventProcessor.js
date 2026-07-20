/**
 * Academy event processor scaffolding (Phase 4).
 * Idempotent ingest with retry / DLQ fields — no Pub/Sub deploy in this pass.
 */

const { FORGE_ACADEMY_EVENT_TYPES } = require("./types");
const { writeAcademyAudit } = require("./academyAudit");

function eventsCol(db, departmentId) {
  return db.collection(`departments/${departmentId}/academyEvents`);
}

async function ingestAcademyEvent(db, departmentId, event = {}) {
  const eventId = String(event.eventId || "").trim();
  if (!eventId) throw new Error("eventId is required.");

  const ref = eventsCol(db, departmentId).doc(eventId);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.processingStatus === "processed") {
    return { status: "duplicate", eventId, processingStatus: "processed" };
  }

  const now = new Date().toISOString();
  const doc = {
    eventId,
    eventType: event.eventType || "unknown",
    schemaVersion: event.schemaVersion || "1",
    occurredAt: event.occurredAt || now,
    sourceSystem: event.sourceSystem || "forge_academy",
    connectionId: event.connectionId || null,
    academyOrganizationId: event.academyOrganizationId || null,
    personId: event.personId || null,
    departmentId,
    payload: event.data || event.payload || {},
    processingStatus: "pending",
    attemptCount: existing.exists ? Number(existing.data()?.attemptCount || 0) : 0,
    lastError: null,
    deadLetter: false,
    createdAt: existing.exists ? existing.data()?.createdAt || now : now,
    updatedAt: now,
  };

  await ref.set(doc, { merge: true });
  return { status: "accepted", eventId, processingStatus: "pending" };
}

async function processAcademyEvent(db, departmentId, eventId) {
  const ref = eventsCol(db, departmentId).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Event not found.");
  const event = snap.data();

  if (event.processingStatus === "processed") {
    return { status: "duplicate", eventId };
  }

  const attemptCount = Number(event.attemptCount || 0) + 1;
  try {
    // Scaffolding: mark processed without side effects.
    await ref.set(
      {
        processingStatus: "processed",
        attemptCount,
        processedAt: new Date().toISOString(),
        lastError: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await writeAcademyAudit(db, departmentId, {
      connectionId: event.connectionId,
      academyOrganizationId: event.academyOrganizationId,
      personId: event.personId,
      actor: "system",
      actorType: "system",
      action: "event.processed",
      result: "ok",
      meta: { eventId, eventType: event.eventType },
    });
    return { status: "processed", eventId };
  } catch (error) {
    const deadLetter = attemptCount >= 5;
    await ref.set(
      {
        processingStatus: deadLetter ? "dead_letter" : "failed",
        attemptCount,
        deadLetter,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    throw error;
  }
}

async function replayAcademyEvent(db, departmentId, eventId) {
  const ref = eventsCol(db, departmentId).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Event not found.");
  await ref.set(
    {
      processingStatus: "pending",
      deadLetter: false,
      lastError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return processAcademyEvent(db, departmentId, eventId);
}

module.exports = {
  ingestAcademyEvent,
  processAcademyEvent,
  replayAcademyEvent,
  FORGE_ACADEMY_EVENT_TYPES,
};
