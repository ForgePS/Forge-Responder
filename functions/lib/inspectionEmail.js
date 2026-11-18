/**
 * Email a completed inspection to the occupancy: a short note plus the full
 * report as a PDF.
 *
 * The report is built on the server from the stored inspection and its
 * violations; the caller only chooses the inspection, the recipients and an
 * optional note. Membership and an inspections permission are checked here,
 * and every send is recorded on the inspection and in the audit events.
 */
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const PDFDocument = require("pdfkit");
const { assertMemberPermission } = require("./access");
const { DEMO_OUTBOUND_MESSAGE, isDemoDepartment, logDemoOutbound } = require("./demoGuard");
const { sendTextEmail } = require("./mailer");
const { safeTimeZone } = require("./heatZone/time");

const MAX_RECIPIENTS = 5;
const MAX_COPY_TO = 3;
const MAX_NOTE_CHARS = 2000;
const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
const PERMISSIONS = ["editInspections", "conductInspections", "approveInspections"];
const NEGATIVE = new Set(["no", "fail", "failed", "noncompliant", "non compliant", "not compliant", "unsatisfactory", "deficient"]);

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanId(value, label) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

/** Valid, de-duplicated recipient addresses, or an error message. */
function cleanRecipients(list) {
  const raw = (Array.isArray(list) ? list : String(list || "").split(/[,;\s]+/))
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(raw)];
  const bad = unique.filter((e) => e.length > 254 || !EMAIL_PATTERN.test(e));
  if (bad.length) return { error: `Check this email address: ${bad[0]}` };
  if (!unique.length) return { error: "Add at least one email address." };
  if (unique.length > MAX_RECIPIENTS) return { error: `Send to ${MAX_RECIPIENTS} addresses or fewer.` };
  return { recipients: unique };
}

function formatDate(value, timeZone) {
  if (!value) return "";
  // A date ("2026-12-01") or local date-time without an offset is already local: don't shift it.
  const wallClock = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(String(value));
  const date = wallClock ? new Date(String(value).length === 10 ? `${value}T12:00:00Z` : `${value}Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: wallClock ? "UTC" : safeTimeZone(timeZone) });
}

/** How one stored answer reads in the report ("" = unanswered). */
function formatAnswer(field = {}, value, timeZone) {
  if (value == null || value === "") return "";
  if (field.type === "checkbox") return value === true ? "Yes" : "No";
  if (field.type === "photo") return Array.isArray(value) && value.length ? `${value.length} photo${value.length === 1 ? "" : "s"}` : "";
  if (field.type === "signature") {
    if (!value || typeof value !== "object") return text(value);
    return value.name ? `Signed by ${text(value.name, 120)}${value.signedAt ? ` on ${formatDate(value.signedAt, timeZone)}` : ""}` : "";
  }
  if (Array.isArray(value)) return value.map((v) => text(v, 200)).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  return String(value).trim().slice(0, 4000);
}

function isNegative(value) {
  return NEGATIVE.has(String(value ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim());
}

/**
 * The report's content, independent of PDF layout (also used for tests).
 * @returns {{ title, facts: [label, value][], sections: { title, items: { label, answer, remarks, flagged, heading }[] }[], violations: object[], summary }}
 */
function buildReport(inspection = {}, violations = [], { departmentName = "", timeZone = "" } = {}) {
  const type = inspection.inspectionTypeSnapshot || {};
  const occupancy = inspection.occupancySnapshot || {};
  const inspectors = (inspection.assignedInspectorNames || []).filter(Boolean).join(", ") || text(inspection.completedBy, 120);
  const addressLine = [occupancy.address || inspection.address, occupancy.city, [occupancy.state, occupancy.zip].filter(Boolean).join(" ")]
    .map((v) => text(v, 200)).filter(Boolean).join(", ");

  const facts = [
    ["Inspection", text(inspection.inspectionNumber, 60)],
    ["Type", text(type.label || type.name, 120)],
    ["Occupancy", text(inspection.occupancyName || occupancy.name, 200)],
    ["Address", addressLine],
    ["Date", formatDate(inspection.completedAt || inspection.updatedAt, timeZone)],
    ["Inspector", inspectors],
    ["Result", text(inspection.result, 60)],
  ].filter(([, value]) => value);

  const answers = inspection.answers || {};
  const sections = [];
  for (const section of inspection.templateSnapshot?.sections || []) {
    const items = [];
    for (const field of section?.fields || []) {
      if (!field) continue;
      if (field.type === "heading") { items.push({ heading: true, label: text(field.label, 300) }); continue; }
      if (field.type === "instruction" || !field.key) continue;
      const answer = formatAnswer(field, answers[field.key], timeZone);
      const remarks = String(answers[`${field.key}__remarks`] || "").trim().slice(0, 4000);
      const photos = Array.isArray(answers[`${field.key}__photos`]) ? answers[`${field.key}__photos`].length : 0;
      items.push({
        label: text(field.label, 300),
        answer: answer || "Not answered",
        remarks,
        photos,
        flagged: isNegative(answers[field.key]),
      });
    }
    if (items.length) sections.push({ title: text(section.title, 200), items });
  }

  const cited = violations.map((v) => ({
    title: text(v.name || v.sectionTitle || v.category || "Violation", 300),
    citation: text(v.codeCitation || [v.sectionNumber, v.sectionTitle].filter(Boolean).join(" "), 300),
    description: String(v.publicDescription || v.description || "").trim().slice(0, 4000),
    correctiveAction: String(v.correctiveAction || "").trim().slice(0, 4000),
    location: text(v.locationOnProperty, 300),
    dueAt: formatDate(v.dueAt, timeZone),
    status: text(v.status, 40),
    photos: (Array.isArray(v.evidence) ? v.evidence : []).filter((e) => e?.type === "photo").length,
  }));

  return {
    title: `${departmentName ? `${departmentName} — ` : ""}Inspection Report`,
    facts,
    sections,
    violations: cited,
    summary: String(inspection.summary || "").trim().slice(0, 8000),
    reinspection: inspection.reinspectionRequired ? formatDate(inspection.nextReinspectionAt, timeZone) || "Required" : "",
  };
}

function renderPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER", info: { Title: report.title } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 108;

    doc.font("Helvetica-Bold").fontSize(16).text(report.title);
    doc.moveDown(0.5);
    for (const [label, value] of report.facts) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${label}: `, { continued: true }).font("Helvetica").text(value);
    }
    if (report.reinspection) {
      doc.font("Helvetica-Bold").text("Reinspection: ", { continued: true }).font("Helvetica").text(report.reinspection);
    }

    for (const section of report.sections) {
      doc.moveDown(0.8);
      if (section.title) doc.font("Helvetica-Bold").fontSize(12).text(section.title);
      doc.moveTo(54, doc.y + 2).lineTo(54 + width, doc.y + 2).strokeColor("#999999").stroke();
      doc.moveDown(0.4);
      for (const item of section.items) {
        if (item.heading) { doc.moveDown(0.3).font("Helvetica-Bold").fontSize(10).text(item.label); continue; }
        doc.font("Helvetica").fontSize(10).fillColor("#000000").text(item.label, { width });
        doc.font("Helvetica-Bold").fillColor(item.flagged ? "#B00020" : "#000000").text(item.answer, { indent: 14, width: width - 14 });
        doc.fillColor("#000000");
        if (item.remarks) doc.font("Helvetica-Oblique").text(`Remarks: ${item.remarks}`, { indent: 14, width: width - 14 });
        if (item.photos) doc.font("Helvetica").fillColor("#555555").text(`${item.photos} photo${item.photos === 1 ? "" : "s"} on file`, { indent: 14 }).fillColor("#000000");
        doc.moveDown(0.3);
      }
    }

    if (report.violations.length) {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).text(`Violations (${report.violations.length})`);
      doc.moveDown(0.3);
      report.violations.forEach((v, index) => {
        doc.font("Helvetica-Bold").fontSize(10).text(`${index + 1}. ${v.title}`, { width });
        const lines = [
          v.citation && `Code: ${v.citation}`,
          v.location && `Location: ${v.location}`,
          v.description,
          v.correctiveAction && `Correction required: ${v.correctiveAction}`,
          v.dueAt && `Correct by: ${v.dueAt}`,
          v.photos && `${v.photos} photo${v.photos === 1 ? "" : "s"} on file`,
        ].filter(Boolean);
        for (const line of lines) doc.font("Helvetica").text(line, { indent: 14, width: width - 14 });
        doc.moveDown(0.3);
      });
    }

    if (report.summary) {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).text("Summary");
      doc.font("Helvetica").fontSize(10).text(report.summary, { width });
    }
    doc.end();
  });
}

/**
 * The department's report email settings (inspectionSettings/main.reportEmail,
 * set in Configuration Studio), re-checked here: bad addresses are dropped.
 */
function reportEmailSettings(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const list = (value) => (Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/))
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => e.length <= 254 && EMAIL_PATTERN.test(e));
  const replyTo = String(data.replyTo || "").trim().toLowerCase();
  return {
    senderName: String(data.senderName || "").replace(/["<>\\\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
    replyTo: replyTo.length <= 254 && EMAIL_PATTERN.test(replyTo) ? replyTo : "",
    copyTo: [...new Set(list(data.copyTo))].slice(0, MAX_COPY_TO),
    signature: String(data.signature || "").replace(/\r\n/g, "\n").trim().slice(0, 1000),
  };
}

function buildEmailText(report, { note = "", departmentName = "", senderName = "", signature = "", replyNote = "Reply to this email with any questions." } = {}) {
  const fact = (label) => report.facts.find(([l]) => l === label)?.[1] || "";
  const lines = [];
  if (note) lines.push(note, "");
  lines.push(
    `Attached is the report for the ${fact("Type") || "fire"} inspection of ${fact("Occupancy") || "your property"}${fact("Date") ? ` on ${fact("Date")}` : ""}.`,
    "",
  );
  if (fact("Result")) lines.push(`Result: ${fact("Result")}`);
  if (report.violations.length) {
    lines.push(`Violations: ${report.violations.length}`);
    report.violations.forEach((v, i) => lines.push(`  ${i + 1}. ${v.title}${v.dueAt ? ` (correct by ${v.dueAt})` : ""}`));
  }
  if (report.reinspection) lines.push(`Reinspection: ${report.reinspection}`);
  lines.push("", replyNote, "", signature ? [senderName, signature].filter(Boolean).join("\n") : [senderName, departmentName].filter(Boolean).join("\n"));
  return lines.join("\n").trim();
}

function pdfFileName(inspection) {
  const base = text(inspection.inspectionNumber || "inspection", 60).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${base}-report.pdf`;
}

/** Callable: { departmentId, inspectionId, to: string[], note? } → { status, recipients } */
async function emailInspectionReport(db, request) {
  const departmentId = text(request.data?.departmentId, 200);
  if (!departmentId || departmentId.includes("/")) throw new HttpsError("invalid-argument", "departmentId is required.");
  await assertMemberPermission(db, departmentId, request.auth, PERMISSIONS,
    "You don't have permission to email inspection reports.");
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes("inspections")) {
    throw new HttpsError("permission-denied", "Inspections aren't included in your department's plan.");
  }

  const inspectionId = cleanId(request.data?.inspectionId, "inspectionId");
  const { recipients, error } = cleanRecipients(request.data?.to);
  if (error) throw new HttpsError("invalid-argument", error);
  const note = String(request.data?.note || "").trim().slice(0, MAX_NOTE_CHARS);

  const ref = db.doc(`departments/${departmentId}/inspections/${inspectionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inspection not found.");
  const inspection = { id: snap.id, ...snap.data() };
  if (inspection.status !== "completed") {
    throw new HttpsError("failed-precondition", "Only completed inspections can be emailed.");
  }

  const [violationsSnap, departmentSnap, settingsSnap] = await Promise.all([
    db.collection(`departments/${departmentId}/violations`).where("inspectionId", "==", inspectionId).get(),
    db.doc(`departments/${departmentId}/profile/main`).get(),
    db.doc(`departments/${departmentId}/inspectionSettings/main`).get(),
  ]);
  const settings = reportEmailSettings(settingsSnap.data()?.reportEmail);
  const violations = violationsSnap.docs.map((d) => d.data() || {}).filter((v) => v.status !== "voided" && v.status !== "void");
  const profile = departmentSnap.data() || {};
  const departmentName = text(profile.name, 200);
  const timeZone = profile.timezone;
  const senderName = text(request.auth.token?.name, 120);
  const inspectorEmail = EMAIL_PATTERN.test(String(request.auth.token?.email || "")) ? request.auth.token.email : "";
  const replyTo = settings.replyTo || inspectorEmail;

  const report = buildReport(inspection, violations, { departmentName, timeZone });
  const pdf = await renderPdf(report);
  const email = {
    to: recipients,
    replyTo,
    cc: settings.copyTo.filter((e) => !recipients.includes(e)),
    fromName: settings.senderName || departmentName,
    subject: `Inspection report ${inspection.inspectionNumber || ""} — ${text(inspection.occupancyName, 120)}`.replace(/\s+/g, " ").trim(),
    text: buildEmailText(report, { note, departmentName, senderName, signature: settings.signature }),
    attachments: [{ filename: pdfFileName(inspection), content: pdf, type: "application/pdf" }],
  };
  // The demo department's sign-in is public, so its email is logged, never sent.
  const demo = isDemoDepartment(departmentId);
  if (demo) logDemoOutbound("inspection report email", { to: recipients, subject: email.subject, pdfBytes: pdf.length });
  const status = demo ? "logged" : await sendTextEmail(email);

  const stamp = new Date().toISOString();
  const actorName = senderName || text(request.auth.token?.email, 200) || "User";
  const entry = { to: recipients, status, sentAt: stamp, sentBy: actorName, sentByUid: request.auth.uid };
  await Promise.all([
    ref.update({ emailDeliveries: FieldValue.arrayUnion(entry), ...(status === "sent" || status === "logged" ? { lastEmailedAt: stamp } : {}) }),
    db.collection(`departments/${departmentId}/inspectionAuditEvents`).add({
      action: "email_report",
      recordType: "inspection",
      recordId: inspectionId,
      summary: `Emailed inspection ${inspection.inspectionNumber || inspectionId} report to ${recipients.join(", ")} (${status})`,
      actorUid: request.auth.uid,
      actorName,
      before: null,
      after: null,
      created_at: stamp,
    }),
  ]).catch((logError) => console.error("Inspection email log failed", logError));

  if (status === "not_configured") {
    throw new HttpsError("failed-precondition", "Email isn't set up for Forge yet. Contact support.");
  }
  if (status === "failed") throw new HttpsError("unavailable", "The email couldn't be sent. Try again in a few minutes.");
  return { status, recipients, sentAt: stamp, ...(demo ? { message: DEMO_OUTBOUND_MESSAGE } : {}) };
}

module.exports = { MAX_RECIPIENTS, buildEmailText, buildReport, cleanRecipients, emailInspectionReport, formatAnswer, renderPdf, reportEmailSettings };
