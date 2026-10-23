/**
 * Daily billing lifecycle for manual/check billing (see billingPlan.js for the
 * policy). Applies the planned actions, emails reminders, and logs every
 * action to platformBillingEvents for the Creator Console.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { planBillingActions } = require("./billingPlan");
const { sendTextEmail } = require("./mailer");
const { isPlatformCreator } = require("./access");

const OWNER_EMAIL = String(process.env.BILLING_NOTIFY_EMAIL || "admin@forgepublicsafety.com").trim();
const TIME_ZONE = "America/Chicago";

/** Today's date (YYYY-MM-DD) in the platform's time zone. */
function todayInZone(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${m}/${d}/${y}` : String(iso);
}

function emailFor(action, sub) {
  const name = sub.departmentName || action.departmentId;
  const due = formatDate(action.dueDate);
  const isTrial = sub.status === "trial";
  if (action.kind === "remind") {
    return {
      subject: `${name}: FORGE Responder ${isTrial ? "trial ends" : "renewal due"} ${due}`,
      text: [
        `Hello,`,
        ``,
        isTrial
          ? `${name}'s FORGE Responder trial ends on ${due} (${action.daysLeft} days from now).`
          : `${name}'s FORGE Responder subscription renews on ${due} (${action.daysLeft} days from now).`,
        `To continue without interruption, please send payment by check or contact us to arrange billing.`,
        ``,
        `Questions: ${OWNER_EMAIL}`,
        ``,
        `FORGE Public Safety`,
      ].join("\n"),
    };
  }
  return {
    subject: `${name}: FORGE Responder payment past due`,
    text: [
      `Hello,`,
      ``,
      `${name}'s FORGE Responder ${isTrial ? "trial ended" : "subscription renewal was due"} on ${due}, and we haven't recorded a payment yet.`,
      `Your department still has access. Please send payment by check or contact us to keep service uninterrupted.`,
      ``,
      `Questions: ${OWNER_EMAIL}`,
      ``,
      `FORGE Public Safety`,
    ].join("\n"),
  };
}

/** Mirror term dates/status onto the registry + settings copies the app reads. */
function legacyTerm(sub) {
  return {
    startDate: String(sub.currentPeriodStart || "").slice(0, 10),
    expirationDate: String(sub.renewalDate || sub.currentPeriodEnd || "").slice(0, 10),
    saasStatus: String(sub.status || ""),
    planId: String(sub.planId || ""),
  };
}

/**
 * Run the lifecycle. With dryRun, returns the plan without writing or emailing.
 * @returns {Promise<{today: string, actions: object[]}>}
 */
async function runBillingLifecycle(db, { today = todayInZone(), dryRun = false } = {}) {
  const snap = await db.collection("platformSubscriptions").get();
  const subs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  const actions = planBillingActions(subs, today);
  if (dryRun) return { today, actions };

  const nowIso = new Date().toISOString();
  for (const action of actions) {
    const sub = subs[action.departmentId] || {};
    const ref = db.doc(`platformSubscriptions/${action.departmentId}`);
    const update = { ...(action.update || {}), updatedAt: nowIso, updatedBy: "billing-lifecycle" };

    let emailStatus = "none";
    if (action.notify) {
      const { subject, text } = emailFor(action, sub);
      const contact = String(sub.billingContactEmail || "").trim();
      emailStatus = await sendTextEmail({ to: contact ? [contact] : [OWNER_EMAIL], cc: contact ? [OWNER_EMAIL] : [], subject, text });
      update[`remindersSent.${action.key}`] = nowIso;
    }

    await ref.update(update);
    if (action.update) {
      const merged = { ...sub, ...action.update };
      const term = legacyTerm(merged);
      await Promise.all([
        db.doc(`platformDepartments/${action.departmentId}`).set({ subscription: term, updatedAt: nowIso }, { merge: true }),
        db.doc(`departments/${action.departmentId}/settings/main`).set({ subscription: term, updatedAt: nowIso }, { merge: true }),
      ]);
    }
    await db.collection("platformBillingEvents").add({
      departmentId: action.departmentId,
      departmentName: sub.departmentName || action.departmentId,
      kind: action.kind,
      dueDate: action.dueDate || "",
      daysLeft: action.daysLeft ?? null,
      emailStatus,
      runDate: today,
      createdAt: nowIso,
    });
  }
  return { today, actions };
}

/** Creator-only: show what today's run would do (no writes, no email). */
async function previewBillingLifecycle(db, request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Platform creator access is required.");
  }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(request.data?.today || "")) ? request.data.today : todayInZone();
  return runBillingLifecycle(db, { today, dryRun: true });
}

module.exports = { emailFor, previewBillingLifecycle, runBillingLifecycle, todayInZone, TIME_ZONE };
