/**
 * Integration Hub Person Identity client (server-side).
 * Academy and RMS must resolve forgePersonId via Hub before creating people.
 */

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} departmentId
 */
async function loadHubSettings(db, departmentId) {
  const [deptSnap, platformSnap] = await Promise.all([
    departmentId
      ? db.doc(`departments/${departmentId}/settings/main`).get()
      : Promise.resolve({ exists: false }),
    db.doc("platformConfig/main").get().catch(() => ({ exists: false })),
  ]);

  const dept = deptSnap.exists ? deptSnap.data()?.forgeAcademy || {} : {};
  const platform = platformSnap.exists ? platformSnap.data()?.forgeAcademy || {} : {};
  const merged = { ...platform, ...dept };

  return {
    hubEnabled: merged.hubEnabled !== false,
    hubBaseUrl: normalize(merged.hubBaseUrl).replace(/\/$/, ""),
    hubBearerToken: normalize(merged.hubBearerToken),
    hubSecret: normalize(merged.hubSecret),
    forgeDepartmentId: normalize(merged.forgeDepartmentId),
  };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} departmentId
 * @param {Record<string, unknown>} person
 */
async function resolvePersonIdentityViaHub(db, departmentId, person = {}) {
  const settings = await loadHubSettings(db, departmentId);
  if (!settings.hubBaseUrl || settings.hubEnabled === false) {
    return { hubConfigured: false, ok: false };
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (settings.hubBearerToken) {
    headers.Authorization = `Bearer ${settings.hubBearerToken}`;
  }
  if (settings.hubSecret) {
    headers["X-Integration-Secret"] = settings.hubSecret;
  }

  const body = {
    ...person,
    sourceSystem: "rms",
    forgeDepartmentId: person.forgeDepartmentId || settings.forgeDepartmentId || null,
    femaSid: person.femaSid || person.femaId || undefined,
    rmsPersonId: person.rmsPersonId || person.id || undefined,
    dateOfBirth: person.dateOfBirth || person.birthDate || undefined,
    email: person.email ? normalizeEmail(person.email) : undefined,
  };

  const response = await fetch(`${settings.hubBaseUrl}/api/integrations/v1/identity/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok && response.status !== 202) {
    const message = json?.error || text.slice(0, 300) || response.statusText;
    throw new Error(`Hub identity resolve failed (${response.status}): ${message}`);
  }

  return { hubConfigured: true, ...json };
}

module.exports = {
  loadHubSettings,
  resolvePersonIdentityViaHub,
};
