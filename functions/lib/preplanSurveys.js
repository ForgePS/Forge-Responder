/**
 * Notifications for preplan field surveys (departments/{id}/preplanSurveys).
 *
 *   assigned  → the people named on it, or the station/shift's members who may survey
 *   submitted → whoever assigned it (if they still work preplans), else preplan approvers
 *   returned  → the surveyor(s)
 *   a new inspection referral → inspection schedulers (assignInspections, else editInspections)
 *
 * Notification ids are deterministic and written with create(), so a redelivered
 * event notifies nobody twice. Only notifications are written; nothing watches them.
 */
const crypto = require("node:crypto");

const MAX_RECIPIENTS = 25;
const SURVEY_KEYS = ["conductPreplanSurveys"];
const PREPLAN_WORK_KEYS = ["editPreplans", "createPreplans", "approvePreplans", "managePreplanConfig", "editInspections"];
const LEAD_KEYS = ["approvePreplans", "managePreplanConfig"];
const REFERRAL_KEYS = [["assignInspections"], ["editInspections"]];
const URGENCY_LABELS = { routine: "Routine", soon: "Soon", urgent: "Urgent" };

function text(value) {
  return String(value ?? "").trim();
}

function shortHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function grantsRef(db, departmentId) {
  return db.collection(`departments/${departmentId}/memberGrants`);
}

async function holdingAny(db, departmentId, uids, keys) {
  const checked = await Promise.all([...new Set(uids.filter(Boolean))].map(async (uid) => {
    const snap = await grantsRef(db, departmentId).doc(uid).get();
    return snap.exists && keys.some((key) => snap.data()?.permissions?.[key] === true) ? uid : "";
  }));
  return checked.filter(Boolean);
}

async function membersWithAny(db, departmentId, keys) {
  const snaps = await Promise.all(keys.map((key) => grantsRef(db, departmentId).where(`permissions.${key}`, "==", true).get()));
  return [...new Set(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id)))].sort();
}

/** People a newly assigned survey is for. */
async function assigneesOf(db, departmentId, survey) {
  const named = (survey.assignedUserIds || []).map(text).filter(Boolean);
  if (named.length) return named;
  const station = text(survey.assignedStation);
  if (!station) return [];
  const members = await db.collection(`departments/${departmentId}/users`).where("assignedStation", "==", station).get();
  const shift = text(survey.assignedShift);
  const onShift = members.docs
    .filter((doc) => text(doc.data().status || "active") === "active")
    .filter((doc) => !shift || text(doc.data().assignedShift) === shift)
    .map((doc) => doc.id);
  return holdingAny(db, departmentId, onShift, SURVEY_KEYS);
}

async function notify(db, departmentId, recipients, build) {
  const now = new Date().toISOString();
  let notified = 0;
  for (const uid of recipients.slice(0, MAX_RECIPIENTS)) {
    const { key, ...body } = build(uid);
    const id = `NTF-PSV-${shortHash([key, uid])}`;
    try {
      await db.doc(`departments/${departmentId}/notifications/${id}`).create({
        id,
        userId: uid,
        module: "Preplans",
        openPage: "Field Surveys",
        status: "unread",
        created_at: now,
        ...body,
      });
      notified += 1;
    } catch (error) {
      if (!(error?.code === 6 || /already exists/i.test(String(error?.message)))) throw error;
    }
  }
  return notified;
}

function labelOf(survey) {
  return [text(survey.preplanNumber), text(survey.facilityName)].filter(Boolean).join(" · ") || text(survey.preplanId);
}

async function handleSurveyWritten(db, event) {
  const { departmentId, surveyId } = event.params;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return { notified: 0 };
  const status = text(after.status);
  const was = before ? text(before.status) : "";
  const common = { recordId: text(after.preplanId), surveyId };
  let notified = 0;

  if (!before && status === "assigned") {
    const uids = (await assigneesOf(db, departmentId, after)).filter((uid) => uid !== text(after.assignedBy));
    const due = text(after.dueDate);
    notified += await notify(db, departmentId, uids, () => ({
      key: [surveyId, "assigned"],
      ...common,
      title: "Preplan field survey assigned",
      message: `${labelOf(after)}${text(after.address) ? `, ${text(after.address)}` : ""}.${due ? ` Due ${due}.` : ""}`,
    }));
  }

  if (status === "submitted" && was !== "submitted") {
    const submitter = text(after.submittedBy);
    let uids = (await holdingAny(db, departmentId, [text(after.assignedBy)], PREPLAN_WORK_KEYS)).filter((uid) => uid !== submitter);
    if (!uids.length) uids = (await membersWithAny(db, departmentId, LEAD_KEYS)).filter((uid) => uid !== submitter);
    notified += await notify(db, departmentId, uids, () => ({
      key: [surveyId, "submitted", text(after.submittedAt)],
      ...common,
      title: "Preplan field survey ready for review",
      message: `${labelOf(after)}. Sent by ${text(after.submittedByName) || "the surveyor"}.`,
    }));
  }

  if (status === "returned" && was !== "returned") {
    const uids = [...new Set([text(after.submittedBy), ...(after.assignedUserIds || []).map(text)].filter(Boolean))]
      .filter((uid) => uid !== text(after.reviewedBy));
    notified += await notify(db, departmentId, uids, () => ({
      key: [surveyId, "returned", text(after.reviewedAt)],
      ...common,
      title: "Preplan field survey returned",
      message: `${labelOf(after)}. ${text(after.reviewNotes).slice(0, 240)}`,
    }));
  }

  // New inspection referrals go to whoever schedules inspections.
  const known = new Set((before?.referrals || []).map((row) => text(row?.id)));
  const added = (after.referrals || []).filter((row) => text(row?.id) && !known.has(text(row.id)));
  if (added.length) {
    let uids = [];
    for (const keys of REFERRAL_KEYS) {
      uids = await membersWithAny(db, departmentId, keys);
      if (uids.length) break;
    }
    for (const referral of added) {
      const from = text(referral.createdBy);
      notified += await notify(db, departmentId, uids.filter((uid) => uid !== from), () => ({
        key: [surveyId, "referral", text(referral.id)],
        ...common,
        occupancyId: text(after.occupancyId),
        title: `Inspection referral (${URGENCY_LABELS[text(referral.urgency)] || "Routine"}) from a preplan survey`,
        message: `${labelOf(after)}. ${text(referral.reason).slice(0, 240)}${text(referral.createdByName) ? ` (${text(referral.createdByName)})` : ""}`,
      }));
    }
  }
  return { notified };
}

module.exports = { handleSurveyWritten };
