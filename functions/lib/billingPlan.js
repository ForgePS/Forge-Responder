/**
 * Pure billing-lifecycle decisions (no I/O), so they can be unit-tested.
 *
 * Policy (decided 2026-10-21, manual/check billing):
 *  - Paid or trial subscriptions: remind the billing contact (cc the platform
 *    owner) 30 and 7 days before the due date; when the due date passes, mark
 *    the subscription past_due (access continues) and send a past-due notice.
 *    Suspension is always a manual decision in the Creator Console.
 *  - Complimentary subscriptions renew themselves for another year.
 *  - past_due / suspended / cancelled subscriptions are left alone.
 */

const REMINDER_DAYS = [30, 7];
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

/** Whole days from `from` to `to` (both YYYY-MM-DD, compared at noon UTC). */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The date payment is due: trial end for trials, renewal date otherwise. */
function dueDateOf(sub = {}) {
  if (sub.status === "trial") return isoDate(sub.trialEndsAt) || isoDate(sub.renewalDate) || isoDate(sub.currentPeriodEnd);
  return isoDate(sub.renewalDate) || isoDate(sub.currentPeriodEnd);
}

/**
 * Decide what to do for one subscription today.
 * @returns {Array<{kind: string, departmentId: string, dueDate?: string, daysLeft?: number, key?: string, update?: object}>}
 */
function planForSubscription(departmentId, sub = {}, today) {
  const actions = [];
  const status = String(sub.status || "");
  const sent = sub.remindersSent || {};

  if (sub.billingCycle === "complimentary") {
    const end = dueDateOf(sub);
    if (status === "active" && end && daysBetween(end, today) >= 0) {
      const nextEnd = addDays(end, 365);
      actions.push({
        kind: "renew_complimentary",
        departmentId,
        dueDate: end,
        update: { currentPeriodStart: end, currentPeriodEnd: nextEnd, renewalDate: nextEnd },
      });
    }
    return actions;
  }

  if (!["trial", "active"].includes(status)) return actions;
  const due = dueDateOf(sub);
  if (!due) return actions;
  const daysLeft = daysBetween(today, due);

  if (daysLeft < 0) {
    const key = `${due}:past_due`;
    actions.push({
      kind: "mark_past_due",
      departmentId,
      dueDate: due,
      daysLeft,
      key,
      update: { status: "past_due", pastDueSince: today },
      notify: !sent[key],
    });
    return actions;
  }

  // Smallest reminder window we're inside that hasn't been sent for this due date.
  // (Robust to missed days: on day 25 the 30-day reminder still goes out.)
  const windows = REMINDER_DAYS.filter((d) => daysLeft <= d).sort((a, b) => a - b);
  const window = windows[0];
  if (window !== undefined) {
    const key = `${due}:${window}`;
    const alreadySentCloser = REMINDER_DAYS.some((d) => d <= window && sent[`${due}:${d}`]);
    if (!sent[key] && !alreadySentCloser) {
      actions.push({ kind: "remind", departmentId, dueDate: due, daysLeft, key, window, notify: true });
    }
  }
  return actions;
}

/** Plan actions for all subscriptions ({ [departmentId]: sub }). */
function planBillingActions(subscriptionsById = {}, today) {
  const day = isoDate(today);
  if (!day) throw new Error("planBillingActions: today must be YYYY-MM-DD");
  return Object.entries(subscriptionsById).flatMap(([id, sub]) => planForSubscription(id, sub, day));
}

module.exports = { REMINDER_DAYS, addDays, daysBetween, dueDateOf, planBillingActions, planForSubscription };
