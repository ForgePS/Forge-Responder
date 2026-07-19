import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions, getFirestoreDb } from "./firebaseClient.js";

export class IdentityReviewRequiredError extends Error {
  constructor(review) {
    super(
      "A matching Forge person already exists and needs admin review before a new identity can be created."
    );
    this.name = "IdentityReviewRequiredError";
    this.review = review;
  }
}

export function personnelToHubPersonPayload(person = {}, forgeDepartmentId = "") {
  return {
    firstName: String(person.firstName || "").trim(),
    lastName: String(person.lastName || "").trim(),
    email: String(person.email || "").trim().toLowerCase() || undefined,
    femaSid: String(person.femaId || person.femaSid || "").replace(/\D/g, "") || undefined,
    dateOfBirth: String(person.birthDate || person.dateOfBirth || "").trim() || undefined,
    rmsPersonId: String(person.id || person.rmsPersonId || "").trim() || undefined,
    forgePersonId: String(person.forgePersonId || "").trim() || undefined,
    forgeDepartmentId: forgeDepartmentId || undefined,
    employmentStatus: String(person.employmentType || "").trim() || undefined,
    active: String(person.status || "").toLowerCase() !== "inactive",
  };
}

async function loadForgeAcademySettings(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  const snap = await getDoc(doc(db, "departments", departmentId, "settings", "main"));
  if (!snap.exists()) return null;
  return snap.data()?.forgeAcademy || null;
}

async function resolveViaHubHttp(settings, person) {
  const hubBaseUrl = String(settings.hubBaseUrl || "").trim().replace(/\/$/, "");
  if (!hubBaseUrl || settings.hubEnabled === false) {
    return { hubConfigured: false, forgePersonId: null };
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (settings.hubBearerToken) headers.Authorization = `Bearer ${String(settings.hubBearerToken).trim()}`;
  if (settings.hubSecret) headers["X-Integration-Secret"] = String(settings.hubSecret).trim();

  const response = await fetch(`${hubBaseUrl}/api/integrations/v1/identity/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...personnelToHubPersonPayload(person, settings.forgeDepartmentId),
      sourceSystem: "rms",
    }),
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!response.ok && response.status !== 202) {
    throw new Error(json?.error || text.slice(0, 300) || `Hub resolve failed (${response.status})`);
  }
  return { hubConfigured: true, ...json };
}

export async function resolveForgePersonIdForPersonnel(departmentId, person) {
  if (!departmentId) return { hubConfigured: false, forgePersonId: null };

  const settings = await loadForgeAcademySettings(departmentId);
  if (!settings?.hubBaseUrl || settings.hubEnabled === false) {
    return { hubConfigured: false, forgePersonId: null };
  }

  const fns = getFirebaseFunctions();
  let data;
  if (fns) {
    try {
      const callable = httpsCallable(fns, "resolveForgePersonIdentity");
      const result = await callable({
        departmentId,
        person: personnelToHubPersonPayload(person, settings.forgeDepartmentId),
      });
      data = result.data || {};
    } catch (error) {
      const code = error?.code || "";
      if (code === "functions/not-found" || code === "functions/unavailable") {
        data = await resolveViaHubHttp(settings, person);
      } else {
        throw error;
      }
    }
  } else {
    data = await resolveViaHubHttp(settings, person);
  }

  if (data.hubConfigured === false) return { ...data, forgePersonId: null };
  if (data.review) throw new IdentityReviewRequiredError(data.review);

  const forgePersonId = String(
    data.forgePersonId || data.personId || data.identity?.forgePersonId || data.identity?.personId || ""
  ).trim();
  if (!forgePersonId) throw new Error("Hub did not return a forgePersonId.");
  return { ...data, forgePersonId };
}

export async function attachForgePersonIds(departmentId, records = []) {
  const next = [];
  for (const person of records) {
    if (String(person?.forgePersonId || "").trim()) {
      next.push(person);
      continue;
    }
    if (!String(person?.firstName || "").trim() || !String(person?.lastName || "").trim()) {
      next.push(person);
      continue;
    }
    try {
      const resolved = await resolveForgePersonIdForPersonnel(departmentId, person);
      next.push(resolved.forgePersonId ? { ...person, forgePersonId: resolved.forgePersonId } : person);
    } catch (error) {
      if (error instanceof IdentityReviewRequiredError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/not configured|Hub base URL|failed-precondition|hubConfigured|not-found/i.test(message)) {
        next.push(person);
        continue;
      }
      throw error;
    }
  }
  return next;
}
