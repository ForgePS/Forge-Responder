const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const twilio = require("twilio");
const { assertDepartmentAccess, assertDepartmentAccessOrPublicGateway, assertDepartmentManage, assertPlatformSuperAdmin } = require("./lib/access");
const { resolvePersonnelPhones } = require("./lib/personnel");
const { toUsE164 } = require("./lib/phone");
const {
  connectIntegration,
  disconnectIntegration,
  loadIntegration,
  publicStatus,
  syncAlerts,
} = require("./lib/active911Store");
const {
  loadIntegration: loadGoogleApisIntegration,
  publicStatus: googleApisPublicStatus,
  clientConfig: googleApisClientConfig,
  saveIntegration: saveGoogleApisIntegration,
  clearIntegration: clearGoogleApisIntegration,
} = require("./lib/googleApisStore");
const {
  geocodeAddress,
  fetchDirections,
  lookupPlace,
} = require("./lib/googleMapsService");
const { loadPublicAlertDashboard } = require("./lib/alertDashboardPublic");
const {
  buildWebhookUrl,
  ensureSettings,
  loadSettings,
  saveDamageFormSubmission,
  validateWebhookToken,
} = require("./lib/jotformDamageStore");
const { fetchJotformSubmissionPdf, resolveReportId, buildPublicPdfUrls } = require("./lib/jotformDamagePdf");
const { generateDamageFormPdfBuffer } = require("./lib/damageFormPdfGenerator");
const { syncFormSubmissions } = require("./lib/jotformSubmissionApi");
const {
  generateHydrantDamagePdfBuffer,
  sendWithSendGrid,
} = require("./lib/hydrantDamageEmail");
const {
  issueHydrantDamageAckToken,
  viewAckPortal,
  submitAckPortal,
} = require("./lib/hydrantDamageAckPortal");

admin.initializeApp();

const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioFromNumber = defineSecret("TWILIO_FROM_NUMBER");

function buildSmsBody(message = "", record = {}) {
  const custom = String(message || record.message || "").trim();
  const parts = [
    "FORGE Shift Broadcast",
    record.shift ? `${record.shift}` : "",
    record.dateLabel || record.dayId || "",
    record.position && record.position !== "Any" ? `Role: ${record.position}` : "",
    custom,
    "Reply in the employee portal or contact your supervisor.",
  ].filter(Boolean);

  const body = parts.join(" · ");
  return body.length > 480 ? `${body.slice(0, 477)}...` : body;
}

function createTwilioClient(secrets) {
  const accountSid = secrets.TWILIO_ACCOUNT_SID;
  const authToken = secrets.TWILIO_AUTH_TOKEN;
  const fromNumber = secrets.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new HttpsError(
      "failed-precondition",
      "Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER as Firebase function secrets."
    );
  }

  return {
    client: twilio(accountSid, authToken),
    fromNumber,
  };
}

exports.sendShiftBroadcastSms = onCall(
  {
    secrets: [twilioAccountSid, twilioAuthToken, twilioFromNumber],
    region: "us-central1",
  },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      broadcastId = "",
      personnelIds = [],
      message = "",
      record = {},
    } = request.data || {};

    await assertDepartmentAccess(db, departmentId, request.auth);

    const secrets = {
      TWILIO_ACCOUNT_SID: twilioAccountSid.value(),
      TWILIO_AUTH_TOKEN: twilioAuthToken.value(),
      TWILIO_FROM_NUMBER: twilioFromNumber.value(),
    };

    const { client, fromNumber } = createTwilioClient(secrets);
    const targets = await resolvePersonnelPhones(db, departmentId, personnelIds);
    const smsBody = buildSmsBody(message, record);

    const results = {
      broadcastId,
      attempted: 0,
      sent: 0,
      skipped: [],
      failed: [],
      deliveries: [],
    };

    for (const target of targets) {
      results.attempted += 1;

      if (!target.smsOptIn) {
        results.skipped.push({
          personnelId: target.personnelId,
          reason: "SMS opt-out",
        });
        continue;
      }

      const to = toUsE164(target.phone);
      if (!to) {
        results.skipped.push({
          personnelId: target.personnelId,
          reason: "Missing or invalid phone",
        });
        continue;
      }

      try {
        const twilioMessage = await client.messages.create({
          to,
          from: fromNumber,
          body: smsBody,
        });

        results.sent += 1;
        results.deliveries.push({
          personnelId: target.personnelId,
          phone: to,
          sid: twilioMessage.sid,
          status: twilioMessage.status,
        });
      } catch (error) {
        results.failed.push({
          personnelId: target.personnelId,
          phone: to,
          error: error.message || "Twilio send failed",
        });
      }
    }

    return results;
  }
);

exports.pingTwilioConfig = onCall(
  {
    secrets: [twilioAccountSid, twilioAuthToken, twilioFromNumber],
    region: "us-central1",
  },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);

    const secrets = {
      TWILIO_ACCOUNT_SID: twilioAccountSid.value(),
      TWILIO_AUTH_TOKEN: twilioAuthToken.value(),
      TWILIO_FROM_NUMBER: twilioFromNumber.value(),
    };

    createTwilioClient(secrets);

    return {
      configured: true,
      fromNumber: secrets.TWILIO_FROM_NUMBER,
    };
  }
);

exports.active911Connect = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      email = "",
      password = "",
      refreshToken = "",
    } = request.data || {};

    await assertPlatformSuperAdmin(db, departmentId, request.auth);

    if (!refreshToken && (!email || !password)) {
      throw new HttpsError(
        "invalid-argument",
        "Provide Active911 email and password, or paste an existing refresh token."
      );
    }

    try {
      const integration = await connectIntegration(db, departmentId, {
        email,
        password,
        refreshToken,
        connectedBy: request.auth.uid,
      });
      return publicStatus(integration);
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message || "Active911 connection failed.");
    }
  }
);

exports.active911Disconnect = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertPlatformSuperAdmin(db, departmentId, request.auth);
    return disconnectIntegration(db, departmentId);
  }
);

exports.active911GetStatus = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);
    const integration = await loadIntegration(db, departmentId);
    return publicStatus(integration);
  }
);

exports.active911SyncAlerts = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      alertDays = 10,
      alertMinutes = null,
    } = request.data || {};

    await assertDepartmentAccess(db, departmentId, request.auth);

    try {
      const result = await syncAlerts(db, departmentId, {
        alertDays,
        alertMinutes,
        userId: request.auth.uid,
      });
      return {
        ...result,
        status: publicStatus(await loadIntegration(db, departmentId)),
      };
    } catch (error) {
      const integration = await loadIntegration(db, departmentId);
      if (integration?.connected) {
        await db.doc(`departments/${departmentId}/integrations/active911`).set({
          lastError: error.message || "Sync failed",
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      throw new HttpsError("failed-precondition", error.message || "Active911 sync failed.");
    }
  }
);

exports.googleApisGetStatus = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertPlatformSuperAdmin(db, departmentId, request.auth);
    const integration = await loadGoogleApisIntegration(db, departmentId);
    return googleApisPublicStatus(integration || {});
  }
);

exports.googleApisGetClientConfig = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);
    const integration = await loadGoogleApisIntegration(db, departmentId);
    return googleApisClientConfig(integration || {});
  }
);

exports.googleApisSave = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      mapsJsApiKey,
      geocodingApiKey,
      placesApiKey,
      youtubeDataApiKey,
      defaultMapCenter = "",
      defaultMapZoom,
      removeKeys = [],
    } = request.data || {};

    await assertPlatformSuperAdmin(db, departmentId, request.auth);

    const email = String(request.auth.token?.email || "").trim();
    const integration = await saveGoogleApisIntegration(db, departmentId, {
      mapsJsApiKey,
      geocodingApiKey,
      placesApiKey,
      youtubeDataApiKey,
      defaultMapCenter,
      defaultMapZoom,
      removeKeys: Array.isArray(removeKeys) ? removeKeys : [],
      updatedBy: request.auth.uid,
      updatedByHint: email ? email.replace(/(.{1}).*(@.*)/, "$1***$2") : "",
    });

    return googleApisPublicStatus(integration || {});
  }
);

exports.googleApisClear = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertPlatformSuperAdmin(db, departmentId, request.auth);
    return clearGoogleApisIntegration(db, departmentId);
  }
);

exports.alertDashboardPublicView = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => {
    const db = admin.firestore();
    const { gatewaySlug = "" } = request.data || {};
    if (!String(gatewaySlug || "").trim()) {
      throw new HttpsError("invalid-argument", "gatewaySlug is required.");
    }
    try {
      return await loadPublicAlertDashboard(db, gatewaySlug, { sync: true });
    } catch (error) {
      console.error("alertDashboardPublicView failed", error);
      throw new HttpsError("not-found", error.message || "Alert dashboard is unavailable.");
    }
  }
);

exports.googleGeocode = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "", address = "", gatewaySlug = "" } = request.data || {};
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug);
    try {
      return await geocodeAddress(db, departmentId, address);
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message || "Geocoding failed.");
    }
  }
);

exports.googleDirections = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "", origin = "", destination = "", lat, lng, originLat, originLng, gatewaySlug = "" } = request.data || {};
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug);
    try {
      return await fetchDirections(db, departmentId, {
        origin, destination, lat, lng, originLat, originLng,
      });
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message || "Directions failed.");
    }
  }
);

exports.googlePlacesLookup = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "", latitude, longitude, address = "", gatewaySlug = "" } = request.data || {};
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug);
    try {
      return await lookupPlace(db, departmentId, { latitude, longitude, address });
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message || "Places lookup failed.");
    }
  }
);

function normalizeWebhookBody(req) {
  let body = req.body;

  if (Buffer.isBuffer(body)) {
    body = body.toString("utf8");
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fall through to urlencoded parsing.
      }
    }
    if (trimmed.includes("=")) {
      const parsed = {};
      new URLSearchParams(trimmed).forEach((value, key) => {
        parsed[key] = value;
      });
      return parsed;
    }
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { ...body };
  }

  const rawBody = req.rawBody;
  if (Buffer.isBuffer(rawBody)) {
    return normalizeWebhookBody({ body: rawBody.toString("utf8") });
  }
  if (typeof rawBody === "string" && rawBody.trim()) {
    return normalizeWebhookBody({ body: rawBody });
  }

  return {};
}

exports.jotformDamageWebhook = onRequest(
  { region: "us-central1", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const departmentId = String(req.query.departmentId || "").trim();
    const token = String(req.query.token || "").trim();
    if (!departmentId) {
      res.status(400).send("departmentId is required");
      return;
    }

    const db = admin.firestore();
    const allowed = await validateWebhookToken(db, departmentId, token);
    if (!allowed) {
      res.status(403).send("Invalid webhook token");
      return;
    }

    try {
      const saved = await saveDamageFormSubmission(db, departmentId, normalizeWebhookBody(req));
      res.status(200).json({ ok: true, id: saved.id });
    } catch (error) {
      console.error("jotformDamageWebhook failed", error);
      res.status(400).send(error.message || "Could not save JotForm submission.");
    }
  }
);

exports.getJotformDamageSetup = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "" } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);

    const settings = await ensureSettings(db, departmentId);
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
    return {
      formUrl: settings.formUrl || "",
      formId: settings.formId || "",
      formTitle: settings.formTitle || "Damage Form",
      apiKeyConfigured: Boolean(settings.apiKey),
      webhookUrl: buildWebhookUrl(projectId, departmentId, settings.webhookToken),
    };
  }
);

exports.getJotformDamagePdf = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      recordId = "",
      submissionId = "",
      formId = "",
    } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);

    const settings = await loadSettings(db, departmentId);
    const apiKey = settings?.apiKey;

    let record = null;
    if (recordId) {
      const recordSnap = await db.doc(`departments/${departmentId}/damageForms/${recordId}`).get();
      if (recordSnap.exists) {
        record = { id: recordSnap.id, ...recordSnap.data() };
      }
    }

    const resolvedFormId = String(formId || record?.formId || settings?.formId || "").trim();
    const resolvedSubmissionId = String(submissionId || record?.submissionId || "").trim();
    const pdfLinks = buildPublicPdfUrls(resolvedFormId, resolvedSubmissionId);

    if (record?.source === "jotform") {
      if (!apiKey || !resolvedFormId || !resolvedSubmissionId) {
        throw new HttpsError(
          "failed-precondition",
          "JotForm PDF download requires a saved API key and a real submission."
        );
      }

      try {
        const { buffer, reportId } = await fetchJotformSubmissionPdf(
          resolvedFormId,
          resolvedSubmissionId,
          apiKey,
          settings?.reportId || ""
        );
        if (reportId && reportId !== settings?.reportId) {
          await db.doc(`departments/${departmentId}/settings/damageFormJotform`).set(
            { reportId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
        }
        return {
          pdfBase64: buffer.toString("base64"),
          filename: `damage-form-${resolvedSubmissionId}.pdf`,
          source: "jotform",
          viewerUrl: pdfLinks.viewerUrl || pdfLinks.publicPdfUrl,
          formTitle: record?.formTitle || settings?.formTitle || "Damage Form",
        };
      } catch (error) {
        throw new HttpsError(
          "failed-precondition",
          error.message || "Could not download the JotForm PDF."
        );
      }
    }

    if (!record) {
      throw new HttpsError("not-found", "Damage form record not found.");
    }

    const pdfBuffer = await generateDamageFormPdfBuffer(record);
    return {
      pdfBase64: pdfBuffer.toString("base64"),
      filename: `damage-form-${recordId || "report"}.pdf`,
      source: "generated",
      viewerUrl: "",
      formTitle: record?.formTitle || settings?.formTitle || "Damage Form",
    };
  }
);

exports.syncJotformDamageSubmissions = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "", limit = 25 } = request.data || {};
    await assertDepartmentAccess(db, departmentId, request.auth);

    const settings = await loadSettings(db, departmentId);
    const apiKey = settings?.apiKey;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "Save your JotForm API key in System Admin first.");
    }
    if (!settings?.formId) {
      throw new HttpsError("failed-precondition", "Save your JotForm form URL in System Admin first.");
    }

    try {
      const result = await syncFormSubmissions(db, departmentId, settings, apiKey, limit);
      return {
        count: result.count,
        message: result.count
          ? `Synced ${result.count} submission${result.count === 1 ? "" : "s"} from JotForm.`
          : "No submissions were found in JotForm for this form.",
      };
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message || "Could not sync JotForm submissions.");
    }
  }
);

const { resolvePersonIdentityViaHub } = require("./lib/forgeHubIdentity");
const academyCallables = require("./lib/academy/callables");

/**
 * Resolve or create permanent forgePersonId via Forge Integration Hub.
 * RMS must call this before creating people when Hub is configured.
 */
exports.resolveForgePersonIdentity = onCall(async (request) => {
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertDepartmentAccess(request, departmentId);

  try {
    return await resolvePersonIdentityViaHub(admin.firestore(), departmentId, request.data?.person || {});
  } catch (error) {
    throw new HttpsError(
      "internal",
      error instanceof Error ? error.message : "Identity resolve failed."
    );
  }
});

function wrapAcademy(handler) {
  return onCall(async (request) => {
    try {
      return await handler(admin.firestore(), request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Academy integration error."
      );
    }
  });
}

exports.listAcademyConnections = wrapAcademy(academyCallables.handleListAcademyConnections);
exports.upsertAcademyConnection = wrapAcademy(academyCallables.handleUpsertAcademyConnection);
exports.testAcademyConnection = wrapAcademy(academyCallables.handleTestAcademyConnection);
exports.setPrimaryAcademyConnection = wrapAcademy(academyCallables.handleSetPrimaryAcademyConnection);
exports.disableAcademyConnection = wrapAcademy(academyCallables.handleDisableAcademyConnection);
exports.disconnectAcademyConnection = wrapAcademy(academyCallables.handleDisconnectAcademyConnection);
exports.listAcademyAuditLogs = wrapAcademy(academyCallables.handleListAcademyAuditLogs);
exports.migrateLegacyForgeAcademySettings = wrapAcademy(academyCallables.handleMigrateLegacyForgeAcademySettings);
exports.academyFindStudent = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "findStudent"));
exports.academyGetTranscript = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "getTranscript"));
exports.academyGetCompletions = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "getCourseCompletions"));
exports.academyGetCertificates = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "getCertificates"));
exports.academyGetEnrollments = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "getEnrollments"));
exports.academySubmitEnrollment = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "submitEnrollment"));
exports.academySyncPerson = wrapAcademy((db, req) => academyCallables.handleAcademyPersonAction(db, req, "syncPerson"));
exports.listAcademyLinks = wrapAcademy(academyCallables.handleListAcademyLinks);
exports.linkAcademyPerson = wrapAcademy(academyCallables.handleLinkAcademyPerson);
exports.unlinkAcademyPerson = wrapAcademy(academyCallables.handleUnlinkAcademyPerson);
exports.resolveAcademyMatchConflict = wrapAcademy(academyCallables.handleResolveAcademyMatchConflict);
exports.replayAcademyEvent = wrapAcademy(academyCallables.handleReplayAcademyEvent);
exports.ingestAcademyEvent = wrapAcademy(academyCallables.handleIngestAcademyEvent);
exports.listMyAcademyTraining = wrapAcademy(academyCallables.handleListMyAcademyTraining);

const {
  upsertAcademyEnrollment,
  upsertAcademyCompletion,
} = require("./lib/academy/academyTrainingSync");

function readIntegrationSecret(req) {
  return String(req.get("x-integration-secret") || req.get("X-Integration-Secret") || "").trim();
}

async function assertAcademyWebhookSecret(db, secretHeader, body = {}) {
  const expectedCandidates = [];
  const platformSnap = await db.doc("platformConfig/main").get().catch(() => ({ exists: false }));
  if (platformSnap.exists) {
    const fa = platformSnap.data()?.forgeAcademy || {};
    if (fa.webhookSecret) expectedCandidates.push(String(fa.webhookSecret).trim());
    if (fa.hubSecret) expectedCandidates.push(String(fa.hubSecret).trim());
    if (fa.outboundSecret) expectedCandidates.push(String(fa.outboundSecret).trim());
  }

  const departmentId = String(body.departmentId || body.forgeDepartmentId || "").trim();
  if (departmentId && departmentId !== "forge-platform") {
    const deptSnap = await db.doc(`departments/${departmentId}/settings/main`).get().catch(() => ({ exists: false }));
    if (deptSnap.exists) {
      const fa = deptSnap.data()?.forgeAcademy || {};
      if (fa.webhookSecret) expectedCandidates.push(String(fa.webhookSecret).trim());
      if (fa.hubSecret) expectedCandidates.push(String(fa.hubSecret).trim());
      if (fa.outboundSecret) expectedCandidates.push(String(fa.outboundSecret).trim());
    }
  }

  const expected = expectedCandidates.filter(Boolean);
  if (!expected.length) return true;
  return expected.includes(String(secretHeader || "").trim());
}

/** Academy → RMS: student registered in a course (My Training). */
exports.trainingRegisteredWebhook = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const db = admin.firestore();
    const body = normalizeWebhookBody(req);
    const allowed = await assertAcademyWebhookSecret(db, readIntegrationSecret(req), body);
    if (!allowed) {
      res.status(401).json({ error: "Invalid integration secret." });
      return;
    }
    const result = await upsertAcademyEnrollment(db, body);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    console.error("trainingRegisteredWebhook failed", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Enrollment webhook failed.",
    });
  }
});

/** Academy → RMS: course completed / certificate released. */
exports.trainingCompletedWebhook = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const db = admin.firestore();
    const body = normalizeWebhookBody(req);
    const allowed = await assertAcademyWebhookSecret(db, readIntegrationSecret(req), body);
    if (!allowed) {
      res.status(401).json({ error: "Invalid integration secret." });
      return;
    }
    const result = await upsertAcademyCompletion(db, body);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    console.error("trainingCompletedWebhook failed", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Training completed webhook failed.",
    });
  }
});

/**
 * Send a hydrant damage report email with PDF attachment via SendGrid.
 * Never claims success unless the provider accepts (HTTP 202).
 */
exports.sendHydrantDamageReport = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const db = admin.firestore();
    const {
      departmentId = "",
      reportId = "",
      attemptId = "",
      idempotencyKey = "",
      departmentName = "",
      subject = "",
      bodyText = "",
    } = request.data || {};

    await assertDepartmentAccess(db, departmentId, request.auth);
    if (!reportId) {
      throw new HttpsError("invalid-argument", "reportId is required.");
    }

    const reportRef = db.doc(`departments/${departmentId}/hydrantDamageReports/${reportId}`);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      throw new HttpsError("not-found", "Damage report not found.");
    }
    const report = { id: reportSnap.id, ...reportSnap.data() };

    if (idempotencyKey && report.lastSendIdempotencyKey === idempotencyKey && report.providerMessageId) {
      return {
        accepted: true,
        emailStatus: report.emailStatus || "accepted",
        providerMessageId: report.providerMessageId,
        providerStatus: "idempotent",
        duplicate: true,
      };
    }

    const recipients = Array.isArray(report.recipientSnapshot)
      ? report.recipientSnapshot.map((row) => String(row.email || "").trim()).filter(Boolean)
      : [];
    if (!recipients.length) {
      throw new HttpsError("failed-precondition", "Report has no recipient emails.");
    }
    if (!String(report.description || "").trim()) {
      throw new HttpsError("failed-precondition", "Report description is required.");
    }

    const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
    const fromEmail = String(
      process.env.SENDGRID_FROM_EMAIL
      || process.env.DAILY_ACTIVITY_FROM_EMAIL
      || ""
    ).trim();

    if (!apiKey || !fromEmail) {
      return {
        accepted: false,
        error: "SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on Cloud Functions.",
        providerStatus: "not_configured",
      };
    }

    const pdfBuffer = await generateHydrantDamagePdfBuffer(report, {
      departmentName: departmentName || "Fire Department",
    });

    const origin = String(
      request.data?.origin
      || process.env.RMS_APP_ORIGIN
      || "https://rms.forgepublicsafety.com"
    ).replace(/\/$/, "");
    const ackToken = await issueHydrantDamageAckToken(db, {
      departmentId,
      reportId,
      origin,
    });
    const bodyWithAck = `${bodyText || "A hydrant damage report PDF is attached."}

Secure acknowledgment link (expires ${ackToken.expiresAt}):
${ackToken.url}

Do not forward this link outside your utility. Internal fire-department notes are never included.`;

    const sendResult = await sendWithSendGrid({
      apiKey,
      fromEmail,
      fromName: departmentName || "FORGE RMS Hydrants",
      to: recipients,
      subject: subject || `Hydrant Damage Report ${report.reportNumber || reportId}`,
      text: bodyWithAck,
      pdfBuffer,
      filename: `${report.reportNumber || reportId}.pdf`,
    });

    if (attemptId) {
      await db.doc(`departments/${departmentId}/hydrantDamageEmailAttempts/${attemptId}`).set({
        status: sendResult.ok ? "accepted" : "failed",
        providerStatus: String(sendResult.status || ""),
        providerMessageId: sendResult.providerMessageId || "",
        error: sendResult.ok ? "" : (sendResult.errorText || "SendGrid rejected the request."),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (!sendResult.ok) {
      return {
        accepted: false,
        error: sendResult.errorText || `SendGrid returned HTTP ${sendResult.status}`,
        providerStatus: String(sendResult.status || ""),
        providerMessageId: sendResult.providerMessageId || "",
      };
    }

    await reportRef.set({
      lastSendIdempotencyKey: idempotencyKey || "",
      providerMessageId: sendResult.providerMessageId || "",
      emailStatus: "accepted",
      acknowledgmentPortalUrl: ackToken.url,
      acknowledgmentTokenExpiresAt: ackToken.expiresAt,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return {
      accepted: true,
      emailStatus: "accepted",
      providerStatus: String(sendResult.status || "202"),
      providerMessageId: sendResult.providerMessageId || "",
      acknowledgmentPortalUrl: ackToken.url,
    };
  }
);

/**
 * Public utility acknowledgment portal — view report snapshot (no internal notes).
 */
exports.hydrantDamageAckPortalView = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  async (request) => {
    const db = admin.firestore();
    try {
      return await viewAckPortal(db, request.data?.token || "");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("hydrantDamageAckPortalView failed", error);
      throw new HttpsError("internal", error?.message || "Unable to open acknowledgment portal.");
    }
  }
);

/**
 * Public utility acknowledgment portal — submit ack / repair update.
 */
exports.hydrantDamageAckPortalSubmit = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  async (request) => {
    const db = admin.firestore();
    try {
      return await submitAckPortal(db, request.data?.token || "", request.data || {});
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("hydrantDamageAckPortalSubmit failed", error);
      throw new HttpsError("internal", error?.message || "Unable to submit acknowledgment.");
    }
  }
);


// ---------------------------------------------------------------------------
// Department user invites (Phase 1). Memberships are created server-side only.
// ---------------------------------------------------------------------------
const invites = require("./lib/invites");

exports.createDepartmentInvite = onCall(async (request) =>
  invites.createInvite(admin.firestore(), request));

exports.revokeDepartmentInvite = onCall(async (request) =>
  invites.revokeInvite(admin.firestore(), request));

exports.acceptDepartmentInvite = onCall(async (request) =>
  invites.acceptInvite(admin.firestore(), request));

exports.previewDepartmentInvite = onCall({ invoker: "public" }, async (request) =>
  invites.previewInvite(admin.firestore(), request));

// ---------------------------------------------------------------------------
// Department subdomains (<department>.forgeresponder.com) on Firebase Hosting.
// ---------------------------------------------------------------------------
const departmentDomains = require("./lib/departmentDomains");

exports.registerDepartmentDomain = onCall(async (request) =>
  departmentDomains.registerDepartmentDomain(admin.firestore(), request));

exports.departmentDomainStatus = onCall(async (request) =>
  departmentDomains.departmentDomainStatus(admin.firestore(), request));
