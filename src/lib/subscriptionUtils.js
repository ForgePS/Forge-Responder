export const SUBSCRIPTION_WARNING_DAYS = 60;

export function defaultSubscriptionDates(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  const end = new Date(referenceDate);
  end.setFullYear(end.getFullYear() + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    expirationDate: end.toISOString().slice(0, 10),
  };
}

export function normalizeSubscription(subscription = {}) {
  return {
    startDate: String(subscription.startDate || "").slice(0, 10),
    expirationDate: String(subscription.expirationDate || "").slice(0, 10),
    saasStatus: String(subscription.saasStatus || subscription.status || ""),
    planId: String(subscription.planId || ""),
  };
}

export function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSubscriptionDate(value) {
  const date = parseIsoDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function daysUntilExpiration(expirationDate, referenceDate = new Date()) {
  const expiration = parseIsoDate(expirationDate);
  if (!expiration) return null;
  const reference = new Date(referenceDate);
  reference.setHours(12, 0, 0, 0);
  expiration.setHours(12, 0, 0, 0);
  const diffMs = expiration.getTime() - reference.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getSubscriptionStatus(subscription = {}, options = {}) {
  const { warningDays = SUBSCRIPTION_WARNING_DAYS, referenceDate = new Date() } = options;
  const normalized = normalizeSubscription(subscription);
  const saasStatus = normalized.saasStatus.toLowerCase();

  if (saasStatus === "suspended" || saasStatus === "cancelled") {
    return {
      ...normalized,
      level: "critical",
      daysRemaining: null,
      title: saasStatus === "suspended" ? "Subscription suspended" : "Subscription cancelled",
      message: saasStatus === "suspended"
        ? "This department branch subscription is suspended. Contact FORGE to restore access."
        : "This department branch subscription is cancelled. Contact FORGE to renew access.",
      show: true,
    };
  }

  if (saasStatus === "past_due") {
    return {
      ...normalized,
      level: "critical",
      daysRemaining: daysUntilExpiration(normalized.expirationDate, referenceDate),
      title: "Subscription past due",
      message: "Billing for this department branch is past due. Contact FORGE to update payment.",
      show: true,
    };
  }

  if (!normalized.expirationDate) return null;

  const daysRemaining = daysUntilExpiration(normalized.expirationDate, referenceDate);
  if (daysRemaining === null) return null;

  if (daysRemaining < 0) {
    return {
      ...normalized,
      level: "critical",
      daysRemaining,
      title: "Subscription expired",
      message: `This department branch subscription expired ${Math.abs(daysRemaining)} day(s) ago on ${formatSubscriptionDate(normalized.expirationDate)}. Contact FORGE to renew access.`,
      show: true,
    };
  }

  if (daysRemaining <= warningDays) {
    return {
      ...normalized,
      level: daysRemaining <= 14 ? "critical" : "warning",
      daysRemaining,
      title: saasStatus === "trial" ? "Trial ending soon" : "Subscription expiring soon",
      message: saasStatus === "trial"
        ? `This department trial ends in ${daysRemaining} day(s) on ${formatSubscriptionDate(normalized.expirationDate)}.`
        : `This department branch subscription expires in ${daysRemaining} day(s) on ${formatSubscriptionDate(normalized.expirationDate)}.`,
      show: true,
    };
  }

  return {
    ...normalized,
    level: "active",
    daysRemaining,
    title: saasStatus === "trial" ? "Trial active" : "Subscription active",
    message: "",
    show: false,
  };
}
