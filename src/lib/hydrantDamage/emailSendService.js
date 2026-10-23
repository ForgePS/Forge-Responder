import { httpsCallable } from "firebase/functions";
import { firebaseEnabled, getFirebaseFunctions } from "../firebaseClient.js";
import { createRecord, getRecord, updateRecord } from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import { normalizeDamageReport } from "./damageReportService.js";
import { buildHydrantDamageEmailPreview } from "./damageReportPrint.js";
import {
  HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION,
  HYDRANT_DAMAGE_REPORTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * Send a hydrant damage report through the server-side callable.
 * Never marks Sent unless the email provider accepts the request.
 *
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{ actorUid?: string, actorName?: string, departmentName?: string }} [options]
 */
export async function sendHydrantDamageReport(departmentId, reportId, options = {}) {
  if (!departmentId || !reportId) {
    throw new Error("departmentId and reportId are required.");
  }

  const existing = await getRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId);
  if (!existing) throw new Error("Damage report not found.");
  const report = normalizeDamageReport(existing, departmentId);

  if (report.status === "ownership_review_required") {
    throw new Error("Confirm water company ownership before sending.");
  }
  if (!report.description?.trim()) {
    throw new Error("Add a damage description before sending.");
  }
  const recipients = (report.recipientSnapshot || []).map((row) => row.email).filter(Boolean);
  if (!recipients.length) {
    throw new Error("At least one recipient email is required.");
  }

  const idempotencyKey = `${report.id}:${report.recordVersion}:send`;
  const attemptId = `HEA-${Date.now().toString(36).toUpperCase()}`;

  await createRecord(departmentId, HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION, attemptId, {
    reportId: report.id,
    reportNumber: report.reportNumber,
    idempotencyKey,
    status: "queued",
    recipients,
    createdAt: nowIso(),
    createdBy: options.actorUid || "system",
  });

  await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, {
    emailStatus: "queued",
    updatedAt: nowIso(),
    updatedBy: options.actorUid || "system",
  });

  const functions = firebaseEnabled ? getFirebaseFunctions() : null;
  if (!functions) {
    await updateRecord(departmentId, HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION, attemptId, {
      status: "failed",
      error: "Firebase Functions is not configured in this environment.",
      failedAt: nowIso(),
    });
    await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, {
      emailStatus: "failed",
      updatedAt: nowIso(),
    });
    throw new Error("Firebase Functions is not configured for email delivery.");
  }

  const preview = buildHydrantDamageEmailPreview(report);
  try {
    const callable = httpsCallable(functions, "sendHydrantDamageReport");
    const result = await callable({
      departmentId,
      reportId,
      attemptId,
      idempotencyKey,
      departmentName: options.departmentName || "",
      subject: preview.subject,
      bodyText: preview.body,
      origin: typeof window !== "undefined" ? window.location.origin : "",
    });
    const data = result.data || {};

    if (!data.accepted) {
      await updateRecord(departmentId, HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION, attemptId, {
        status: "failed",
        error: data.error || "Provider did not accept the message.",
        providerStatus: data.providerStatus || "",
        failedAt: nowIso(),
      });
      await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, {
        emailStatus: "failed",
        updatedAt: nowIso(),
      });
      await writeHydrantDamageAudit(departmentId, {
        action: "damage_report.email_failed",
        entityType: "hydrantDamageReport",
        entityId: reportId,
        actorUid: options.actorUid,
        actorName: options.actorName,
        providerMessageId: data.providerMessageId || "",
        reason: data.error || "Provider did not accept the message.",
      });
      throw new Error(data.error || "Email provider did not accept the message.");
    }

    const next = normalizeDamageReport({
      ...report,
      status: "awaiting_acknowledgment",
      emailStatus: data.emailStatus || "accepted",
      sentAt: nowIso(),
      sentBy: options.actorUid || "system",
      providerMessageId: data.providerMessageId || "",
      recordVersion: report.recordVersion + 1,
      updatedAt: nowIso(),
      updatedBy: options.actorUid || "system",
    }, departmentId);

    await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, next);
    await updateRecord(departmentId, HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION, attemptId, {
      status: "accepted",
      providerMessageId: data.providerMessageId || "",
      providerStatus: data.providerStatus || "202",
      acceptedAt: nowIso(),
    });
    await writeHydrantDamageAudit(departmentId, {
      action: "damage_report.email_sent",
      entityType: "hydrantDamageReport",
      entityId: reportId,
      actorUid: options.actorUid,
      actorName: options.actorName,
      providerMessageId: data.providerMessageId || "",
      after: next,
    });
    return next;
  } catch (error) {
    const message = error?.message || "Email send failed.";
    const alreadyRecorded = /provider did not accept/i.test(message);
    if (!alreadyRecorded) {
      await updateRecord(departmentId, HYDRANT_DAMAGE_EMAIL_ATTEMPTS_COLLECTION, attemptId, {
        status: "failed",
        error: message,
        failedAt: nowIso(),
      }).catch(() => null);
      await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, {
        emailStatus: "failed",
        updatedAt: nowIso(),
      }).catch(() => null);
      await writeHydrantDamageAudit(departmentId, {
        action: "damage_report.email_failed",
        entityType: "hydrantDamageReport",
        entityId: reportId,
        actorUid: options.actorUid,
        actorName: options.actorName,
        reason: message,
      }).catch(() => null);
    }
    throw error;
  }
}
