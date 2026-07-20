/** @typedef {'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'} SubscriptionStatus */
/** @typedef {'monthly' | 'annual' | 'complimentary'} BillingCycle */
/** @typedef {'manual' | 'invoice' | 'stripe' | 'purchase_order'} PaymentMethod */

export const SUBSCRIPTION_STATUSES = /** @type {const} */ ({
  TRIAL: "trial",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
});

export const SUBSCRIPTION_STATUS_LABELS = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

export const BILLING_CYCLE_LABELS = {
  monthly: "Monthly",
  annual: "Annual",
  complimentary: "Complimentary",
};

export const PAYMENT_METHOD_LABELS = {
  manual: "Manual / offline",
  invoice: "Invoice",
  stripe: "Stripe",
  purchase_order: "Purchase order",
};

/** Default FORGE RMS SaaS plans (department branch licensing). */
export const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    id: "pilot",
    name: "Pilot",
    description: "Evaluation department with core RMS modules and limited seats.",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    maxPersonnel: 50,
    maxPortalUsers: 25,
    maxStations: 3,
    isActive: true,
    sortOrder: 10,
    highlight: "Pilot programs",
  },
  {
    id: "standard",
    name: "Standard",
    description: "Full RMS operations for a single fire/EMS department branch.",
    monthlyPriceCents: 49900,
    annualPriceCents: 499000,
    maxPersonnel: 250,
    maxPortalUsers: 150,
    maxStations: 12,
    isActive: true,
    sortOrder: 20,
    highlight: "Most customers",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Multi-station deployments, higher limits, and priority onboarding support.",
    monthlyPriceCents: 149900,
    annualPriceCents: 1499000,
    maxPersonnel: 0,
    maxPortalUsers: 0,
    maxStations: 0,
    isActive: true,
    sortOrder: 30,
    highlight: "Unlimited scale",
  },
];

export function formatCurrencyFromCents(cents, currency = "USD") {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatShortDate(value) {
  if (!value) return "—";
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${month}/${day}/${year}`;
}

export function addDaysIso(isoDate, days) {
  const base = isoDate ? new Date(`${isoDate.slice(0, 10)}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
