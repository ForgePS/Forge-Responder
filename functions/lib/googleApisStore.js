const KEY_FIELDS = [
  "mapsJsApiKey",
  "geocodingApiKey",
  "placesApiKey",
  "youtubeDataApiKey",
];

function integrationRef(db, departmentId) {
  return db.doc(`departments/${departmentId}/integrations/googleApis`);
}

function maskKey(value = "") {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `••••••••${key.slice(-4)}`;
}

async function loadIntegration(db, departmentId) {
  const snap = await integrationRef(db, departmentId).get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

function publicStatus(integration = {}) {
  const keys = {};
  KEY_FIELDS.forEach((field) => {
    const value = integration[field];
    keys[field] = {
      configured: Boolean(value),
      hint: maskKey(value),
    };
  });

  return {
    configured: KEY_FIELDS.some((field) => Boolean(integration[field])),
    keys,
    defaultMapCenter: integration.defaultMapCenter || "",
    defaultMapZoom: integration.defaultMapZoom ?? 12,
    updatedAt: integration.updatedAt || "",
    updatedBy: integration.updatedByHint || "",
  };
}

function clientConfig(integration = {}) {
  return {
    mapsJsApiKey: integration.mapsJsApiKey || "",
    defaultMapCenter: integration.defaultMapCenter || "",
    defaultMapZoom: integration.defaultMapZoom ?? 12,
    hasGeocoding: Boolean(integration.geocodingApiKey),
    hasPlaces: Boolean(integration.placesApiKey),
    hasYoutubeData: Boolean(integration.youtubeDataApiKey),
  };
}

async function saveIntegration(db, departmentId, payload = {}) {
  const existing = (await loadIntegration(db, departmentId)) || {};
  const next = {
    ...existing,
    updatedAt: new Date().toISOString(),
    updatedBy: payload.updatedBy || existing.updatedBy || "",
    updatedByHint: payload.updatedByHint || existing.updatedByHint || "",
  };

  KEY_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = String(payload[field] || "").trim();
      if (value) next[field] = value;
    }
  });

  (payload.removeKeys || []).forEach((field) => {
    if (KEY_FIELDS.includes(field)) delete next[field];
  });

  // null/blank means "not sent" (callables turn undefined into null).
  if (payload.defaultMapCenter !== undefined && payload.defaultMapCenter !== null) {
    next.defaultMapCenter = String(payload.defaultMapCenter || "").trim();
  }
  if (payload.defaultMapZoom !== undefined && payload.defaultMapZoom !== null && payload.defaultMapZoom !== "") {
    const zoom = Number(payload.defaultMapZoom);
    if (Number.isFinite(zoom)) next.defaultMapZoom = Math.min(Math.max(zoom, 3), 20);
  }

  await integrationRef(db, departmentId).set(next, { merge: true });
  return loadIntegration(db, departmentId);
}

async function clearIntegration(db, departmentId) {
  await integrationRef(db, departmentId).delete();
  return { configured: false };
}

module.exports = {
  KEY_FIELDS,
  loadIntegration,
  publicStatus,
  clientConfig,
  saveIntegration,
  clearIntegration,
  maskKey,
};
