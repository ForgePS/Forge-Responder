import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  addDaysIso,
  DEFAULT_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  todayIso,
} from "../data/platformSubscriptions.js";
import { writeAuditLog } from "./auditService.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { slugifyDepartmentId } from "./departmentProvisioning.js";
import { listPlatformDepartments, loadDepartmentSettings } from "./platformService.js";
import { notifyDepartmentsChanged } from "./departmentProvisioning.js";
import { DEFAULT_DEPARTMENT_ID, isPlatformScope } from "./tenantPaths.js";
import { normalizeSubscription } from "./subscriptionUtils.js";

/**
 * @typedef {Object} SubscriptionPlan
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {number} monthlyPriceCents
 * @property {number} annualPriceCents
 * @property {number} maxPersonnel
 * @property {number} maxPortalUsers
 * @property {number} maxStations
 * @property {boolean} isActive
 * @property {number} sortOrder
 * @property {string} [highlight]
 */

/**
 * @typedef {Object} CustomerSubscription
 * @property {string} id
 * @property {string} departmentId
 * @property {string} departmentName
 * @property {string} planId
 * @property {import('../data/platformSubscriptions.js').SubscriptionStatus} status
 * @property {import('../data/platformSubscriptions.js').BillingCycle} billingCycle
 * @property {string} currency
 * @property {number} amountCents
 * @property {string} trialEndsAt
 * @property {string} currentPeriodStart
 * @property {string} currentPeriodEnd
 * @property {string} renewalDate
 * @property {string} billingContactName
 * @property {string} billingContactEmail
 * @property {string} billingContactPhone
 * @property {import('../data/platformSubscriptions.js').PaymentMethod} paymentMethod
 * @property {string} externalCustomerId
 * @property {string} notes
 * @property {boolean} autoRenew
 * @property {string} updatedBy
 */

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

function plansCollection(db) {
  return collection(db, "platformSubscriptionPlans");
}

function subscriptionsCollection(db) {
  return collection(db, "platformSubscriptions");
}

/** @param {string} id @param {Record<string, unknown>} data */
function mapPlan(id, data) {
  if (!data || typeof data !== "object") return null;
  return {
    id,
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    monthlyPriceCents: Number(data.monthlyPriceCents ?? 0),
    annualPriceCents: Number(data.annualPriceCents ?? 0),
    maxPersonnel: Number(data.maxPersonnel ?? data.maxStudents ?? 0),
    maxPortalUsers: Number(data.maxPortalUsers ?? 0),
    maxStations: Number(data.maxStations ?? data.maxAcademyTenants ?? 0),
    isActive: data.isActive !== false,
    sortOrder: Number(data.sortOrder ?? 0),
    highlight: String(data.highlight ?? ""),
  };
}

/** @param {string} id @param {Record<string, unknown>} data */
function mapSubscription(id, data) {
  if (!data || typeof data !== "object") return null;
  const departmentId = String(data.departmentId ?? data.academyId ?? id);
  return {
    id,
    departmentId,
    departmentName: String(data.departmentName ?? data.academyName ?? ""),
    planId: String(data.planId ?? "pilot"),
    status: /** @type {import('../data/platformSubscriptions.js').SubscriptionStatus} */ (
      data.status ?? SUBSCRIPTION_STATUSES.TRIAL
    ),
    billingCycle: /** @type {import('../data/platformSubscriptions.js').BillingCycle} */ (
      data.billingCycle ?? "monthly"
    ),
    currency: String(data.currency ?? "USD"),
    amountCents: Number(data.amountCents ?? 0),
    trialEndsAt: String(data.trialEndsAt ?? ""),
    currentPeriodStart: String(data.currentPeriodStart ?? ""),
    currentPeriodEnd: String(data.currentPeriodEnd ?? ""),
    renewalDate: String(data.renewalDate ?? ""),
    billingContactName: String(data.billingContactName ?? ""),
    billingContactEmail: String(data.billingContactEmail ?? ""),
    billingContactPhone: String(data.billingContactPhone ?? ""),
    paymentMethod: /** @type {import('../data/platformSubscriptions.js').PaymentMethod} */ (
      data.paymentMethod ?? "manual"
    ),
    externalCustomerId: String(data.externalCustomerId ?? ""),
    notes: String(data.notes ?? ""),
    autoRenew: data.autoRenew !== false,
    updatedBy: String(data.updatedBy ?? ""),
  };
}

async function getPlatformDepartmentRecord(departmentId) {
  const db = requireDb();
  const [registrySnap, profileSnap] = await Promise.all([
    getDoc(doc(db, "platformDepartments", departmentId)),
    getDoc(doc(db, "departments", departmentId, "profile", "main")),
  ]);
  if (!registrySnap.exists() && !profileSnap.exists()) return null;
  const registry = registrySnap.exists() ? registrySnap.data() : {};
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  return {
    id: departmentId,
    name: String(profile.name || registry.name || departmentId),
    shortName: String(profile.shortName || registry.shortName || ""),
    status: String(profile.status || registry.status || "active"),
    contactEmail: String(profile.contactEmail || registry.contactEmail || ""),
    subscription: normalizeSubscription(registry.subscription || profile.subscription || {}),
  };
}

async function syncLegacyTermDates(departmentId, subscription) {
  const db = requireDb();
  if (!departmentId || isPlatformScope(departmentId)) return;
  const startDate = String(subscription.currentPeriodStart || "").slice(0, 10);
  const expirationDate = String(subscription.renewalDate || subscription.currentPeriodEnd || "").slice(0, 10);
  if (!expirationDate) return;
  const normalized = normalizeSubscription({
    startDate: startDate || todayIso(),
    expirationDate,
  });
  const now = new Date().toISOString();
  await Promise.all([
    setDoc(doc(db, "departments", departmentId, "settings", "main"), {
      departmentId,
      subscription: normalized,
      updatedAt: now,
    }, { merge: true }),
    setDoc(doc(db, "platformDepartments", departmentId), {
      subscription: normalized,
      updatedAt: now,
    }, { merge: true }),
  ]);
}

/** @returns {Promise<SubscriptionPlan[]>} */
export async function listSubscriptionPlans() {
  const db = requireDb();
  const snap = await getDocs(plansCollection(db));
  const rows = snap.docs.map((item) => mapPlan(item.id, item.data())).filter(Boolean);
  if (!rows.length) {
    await ensureDefaultSubscriptionPlans();
    return listSubscriptionPlans();
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function ensureDefaultSubscriptionPlans() {
  const db = requireDb();
  for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
    const ref = doc(plansCollection(db), plan.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(ref, {
      ...plan,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

function nowIso() {
  return new Date().toISOString();
}

/** @param {Partial<SubscriptionPlan> & { id: string }} input @param {string} userId */
export async function saveSubscriptionPlan(input, userId) {
  const db = requireDb();
  const planId = slugifyDepartmentId(input.id || input.name || "plan");
  const payload = {
    name: input.name?.trim() ?? "",
    description: input.description?.trim() ?? "",
    monthlyPriceCents: Math.max(Number(input.monthlyPriceCents ?? 0), 0),
    annualPriceCents: Math.max(Number(input.annualPriceCents ?? 0), 0),
    maxPersonnel: Math.max(Number(input.maxPersonnel ?? 0), 0),
    maxPortalUsers: Math.max(Number(input.maxPortalUsers ?? 0), 0),
    maxStations: Math.max(Number(input.maxStations ?? 0), 0),
    isActive: input.isActive !== false,
    sortOrder: Number(input.sortOrder ?? 0),
    highlight: input.highlight?.trim() ?? "",
    updatedAt: nowIso(),
    updatedBy: userId,
  };
  await setDoc(doc(plansCollection(db), planId), payload, { merge: true });
  await writeAuditLog(DEFAULT_DEPARTMENT_ID, {
    action: "update",
    module: "Subscriptions",
    recordId: planId,
    summary: `Saved subscription plan ${payload.name || planId}`,
    actorUid: userId,
  });
  return mapPlan(planId, payload);
}

/** @returns {Promise<CustomerSubscription[]>} */
export async function listCustomerSubscriptions() {
  const db = requireDb();
  await ensureDefaultSubscriptionPlans();
  const snap = await getDocs(subscriptionsCollection(db));
  const rows = snap.docs.map((item) => mapSubscription(item.id, item.data())).filter(Boolean);
  return rows.sort((a, b) => a.departmentName.localeCompare(b.departmentName));
}

/** @param {string} departmentId */
export async function getCustomerSubscription(departmentId) {
  if (!departmentId || isPlatformScope(departmentId)) return null;
  const db = requireDb();
  const snap = await getDoc(doc(subscriptionsCollection(db), departmentId));
  if (!snap.exists()) return null;
  return mapSubscription(snap.id, snap.data());
}

/**
 * @param {SubscriptionPlan | null | undefined} plan
 * @param {import('../data/platformSubscriptions.js').BillingCycle} billingCycle
 * @param {number} [overrideCents]
 */
export function resolveSubscriptionAmountCents(plan, billingCycle, overrideCents) {
  if (overrideCents != null && overrideCents >= 0) return overrideCents;
  if (!plan) return 0;
  if (billingCycle === "annual") return plan.annualPriceCents;
  if (billingCycle === "complimentary") return 0;
  return plan.monthlyPriceCents;
}

/**
 * @param {string} departmentId
 * @param {Partial<CustomerSubscription>} input
 * @param {string} userId
 */
export async function saveCustomerSubscription(departmentId, input, userId) {
  const db = requireDb();
  const department = await getPlatformDepartmentRecord(departmentId);
  if (!department) throw new Error("Department branch not found.");

  const [plans, existing] = await Promise.all([
    listSubscriptionPlans(),
    getCustomerSubscription(departmentId),
  ]);
  const plan = plans.find((item) => item.id === (input.planId ?? existing?.planId ?? "pilot")) ?? plans[0];
  const billingCycle = input.billingCycle ?? existing?.billingCycle ?? "monthly";
  const status = input.status ?? existing?.status ?? SUBSCRIPTION_STATUSES.TRIAL;
  const today = todayIso();
  const trialEndsAt = input.trialEndsAt ?? existing?.trialEndsAt ?? addDaysIso(today, 30);
  const currentPeriodStart = input.currentPeriodStart ?? existing?.currentPeriodStart ?? today;
  const currentPeriodEnd =
    input.currentPeriodEnd
    ?? existing?.currentPeriodEnd
    ?? addDaysIso(currentPeriodStart, billingCycle === "annual" ? 365 : 30);
  const renewalDate = input.renewalDate ?? existing?.renewalDate ?? currentPeriodEnd;

  const payload = {
    departmentId,
    departmentName: department.name,
    planId: plan?.id ?? "pilot",
    status,
    billingCycle,
    currency: input.currency ?? existing?.currency ?? "USD",
    amountCents: resolveSubscriptionAmountCents(plan, billingCycle, input.amountCents),
    trialEndsAt,
    currentPeriodStart,
    currentPeriodEnd,
    renewalDate,
    billingContactName: input.billingContactName?.trim() ?? existing?.billingContactName ?? "",
    billingContactEmail:
      input.billingContactEmail?.trim()
      ?? existing?.billingContactEmail
      ?? department.contactEmail
      ?? "",
    billingContactPhone: input.billingContactPhone?.trim() ?? existing?.billingContactPhone ?? "",
    paymentMethod: input.paymentMethod ?? existing?.paymentMethod ?? "manual",
    externalCustomerId: input.externalCustomerId?.trim() ?? existing?.externalCustomerId ?? "",
    notes: input.notes?.trim() ?? existing?.notes ?? "",
    autoRenew: input.autoRenew ?? existing?.autoRenew ?? true,
    updatedAt: nowIso(),
    updatedBy: userId,
  };

  await setDoc(doc(subscriptionsCollection(db), departmentId), payload, { merge: true });
  await syncLegacyTermDates(departmentId, payload);

  // Do not un-archive tenants via subscription edits.
  const registrySnap = await getDoc(doc(db, "platformDepartments", departmentId));
  const currentStatus = registrySnap.exists() ? registrySnap.data()?.status : null;
  if (currentStatus !== "archived") {
    const departmentStatus =
      status === SUBSCRIPTION_STATUSES.SUSPENDED || status === SUBSCRIPTION_STATUSES.CANCELLED
        ? "inactive"
        : "active";
    await Promise.all([
      setDoc(doc(db, "platformDepartments", departmentId), {
        status: departmentStatus,
        updatedAt: nowIso(),
        updatedBy: userId,
      }, { merge: true }),
      setDoc(doc(db, "departments", departmentId, "profile", "main"), {
        status: departmentStatus,
        updatedAt: nowIso(),
      }, { merge: true }),
    ]);
  }

  notifyDepartmentsChanged();

  await writeAuditLog(DEFAULT_DEPARTMENT_ID, {
    action: "update",
    module: "Subscriptions",
    recordId: departmentId,
    summary: `Saved subscription for ${payload.departmentName} (${status} / ${payload.planId})`,
    actorUid: userId,
  });

  return mapSubscription(departmentId, payload);
}

/** @param {string} departmentId @param {string} userId @param {{ planId?: string, billingContactEmail?: string, legacySubscription?: { startDate?: string, expirationDate?: string } }} [options] */
export async function ensureCustomerSubscription(departmentId, userId = "", options = {}) {
  if (!departmentId || isPlatformScope(departmentId)) return null;
  const existing = await getCustomerSubscription(departmentId);
  if (existing) return existing;

  const db = requireDb();
  const department = await getPlatformDepartmentRecord(departmentId);
  const settings = await loadDepartmentSettings(departmentId).catch(() => ({}));
  const legacy = normalizeSubscription(
    options.legacySubscription || settings?.subscription || department?.subscription || {}
  );
  const today = todayIso();
  const isDefault = departmentId === DEFAULT_DEPARTMENT_ID;
  const periodStart = legacy.startDate || today;
  const periodEnd = legacy.expirationDate || addDaysIso(today, isDefault ? 365 : 30);

  const payload = {
    departmentId,
    departmentName: department?.name ?? departmentId,
    planId: options.planId ?? (isDefault ? "enterprise" : "standard"),
    status: isDefault ? SUBSCRIPTION_STATUSES.ACTIVE : SUBSCRIPTION_STATUSES.TRIAL,
    billingCycle: isDefault ? "complimentary" : "monthly",
    currency: "USD",
    amountCents: 0,
    trialEndsAt: isDefault ? "" : addDaysIso(today, 30),
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    renewalDate: periodEnd,
    billingContactEmail: options.billingContactEmail ?? department?.contactEmail ?? "",
    paymentMethod: "manual",
    autoRenew: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    updatedBy: userId,
  };

  await setDoc(doc(subscriptionsCollection(db), departmentId), payload, { merge: true });
  await syncLegacyTermDates(departmentId, payload);
  return mapSubscription(departmentId, payload);
}

/** Ensures every registered department has a subscription record. */
export async function syncCustomerSubscriptions(userId = "") {
  await ensureDefaultSubscriptionPlans();
  const departments = await listPlatformDepartments();
  for (const department of departments) {
    if (isPlatformScope(department.id)) continue;
    await ensureCustomerSubscription(department.id, userId, {
      billingContactEmail: department.contactEmail,
      legacySubscription: department.subscription,
    });
  }
  return listCustomerSubscriptions();
}

/**
 * @param {CustomerSubscription[]} subscriptions
 * @param {SubscriptionPlan[]} plans
 */
export function computeSubscriptionMetrics(subscriptions, plans) {
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  let mrrCents = 0;
  let activeCount = 0;
  let trialCount = 0;
  let pastDueCount = 0;
  let suspendedCount = 0;

  for (const subscription of subscriptions) {
    if (subscription.status === SUBSCRIPTION_STATUSES.ACTIVE) activeCount += 1;
    if (subscription.status === SUBSCRIPTION_STATUSES.TRIAL) trialCount += 1;
    if (subscription.status === SUBSCRIPTION_STATUSES.PAST_DUE) pastDueCount += 1;
    if (subscription.status === SUBSCRIPTION_STATUSES.SUSPENDED) suspendedCount += 1;

    if (
      subscription.status === SUBSCRIPTION_STATUSES.ACTIVE
      || subscription.status === SUBSCRIPTION_STATUSES.PAST_DUE
    ) {
      const amount = subscription.amountCents
        || resolveSubscriptionAmountCents(planMap.get(subscription.planId), subscription.billingCycle);
      mrrCents += subscription.billingCycle === "annual" ? Math.round(amount / 12) : amount;
    }
  }

  return {
    totalCustomers: subscriptions.length,
    activeCount,
    trialCount,
    pastDueCount,
    suspendedCount,
    mrrCents,
    arrCents: mrrCents * 12,
  };
}

/** @param {CustomerSubscription | null | undefined} subscription */
export function isSubscriptionAccessAllowed(subscription) {
  if (!subscription) return true;
  return [
    SUBSCRIPTION_STATUSES.ACTIVE,
    SUBSCRIPTION_STATUSES.TRIAL,
    SUBSCRIPTION_STATUSES.PAST_DUE,
  ].includes(subscription.status);
}

/** @param {string} departmentId @param {import('../data/platformSubscriptions.js').SubscriptionStatus} status @param {string} userId */
export async function updateSubscriptionStatus(departmentId, status, userId) {
  return saveCustomerSubscription(departmentId, { status }, userId);
}

/** @param {string} departmentId @param {number} days @param {string} userId */
export async function extendSubscriptionTrial(departmentId, days, userId) {
  const existing = await getCustomerSubscription(departmentId);
  const base = existing?.trialEndsAt || todayIso();
  return saveCustomerSubscription(
    departmentId,
    {
      status: SUBSCRIPTION_STATUSES.TRIAL,
      trialEndsAt: addDaysIso(base, days),
    },
    userId,
  );
}

/** Map SaaS subscription → legacy { startDate, expirationDate } for banners / branch lists. */
export function customerSubscriptionToLegacyTerm(subscription) {
  if (!subscription) return normalizeSubscription({});
  return normalizeSubscription({
    startDate: subscription.currentPeriodStart,
    expirationDate: subscription.renewalDate || subscription.currentPeriodEnd,
    saasStatus: subscription.status,
    planId: subscription.planId,
  });
}
