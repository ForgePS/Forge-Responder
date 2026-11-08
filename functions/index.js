const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const twilio = require("twilio");
const { assertDepartmentAccess, assertDepartmentAccessOrPublicGateway, assertMemberPermission, assertPlatformSuperAdmin, isPlatformCreator } = require("./lib/access");
const { DEMO_OUTBOUND_MESSAGE, isDemoDepartment, logDemoOutbound } = require("./lib/demoGuard");
const { safeAppOrigin } = require("./lib/invites");
const { linkMyPersonnelRecord, resolvePersonnelPhones } = require("./lib/personnel");
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
  saveSetup: saveJotformDamageSetupRecord,
  validateWebhookToken,
} = require("./lib/jotformDamageStore");
const { fetchJotformSubmissionPdf, resolveReportId, buildPublicPdfUrls } = require("./lib/jotformDamagePdf");
const { generateDamageFormPdfBuffer } = require("./lib/damageFormPdfGenerator");
const { syncFormSubmissions } = require("./lib/jotformSubmissionApi");
const {
  generateHydrantDamagePdfBuffer,
  sendHydrantDamageEmail,
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

// Email (Resend). Set with: firebase functions:secrets:set RESEND_API_KEY
// Every function that sends email must list it in `secrets`.
const resendApiKey = defineSecret("RESEND_API_KEY");
const EMAIL_SECRETS = [resendApiKey];

function buildSmsBody(message = "", record = {}) {
  const custom = String(message || record.message || "").trim();
  const parts = [
    "FORGE Shift Broadcast",
    record.shift ? `${record.shift}` : "",
    record.dateLabel || record.dayId || "",
    record.position && record.position !== "Any" ? `Role: ${record.position}` : "",
    custom,
    "Accept or decline in the FORGE Employee Portal (Open Vacancies), or call your supervisor.",
  ].filter(Boolean);

  const body = parts.join(" · ");
  return body.length > 480 ? `${body.slice(0, 477)}...` : body;
}

function createTwilioClient(secrets) {
  // Staging (functions/.env.forge-rms-staging): log instead of texting anyone.
  if (process.env.SMS_DELIVERY === "log") {
    return {
      client: {
        messages: {
          create: async ({ to, body }) => {
            console.log("[text not sent: SMS_DELIVERY=log]", JSON.stringify({ to, body }));
            return { sid: "logged", status: "logged" };
          },
        },
      },
      fromNumber: "logged",
    };
  }
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

const SMS_BROADCAST_MAX_RECIPIENTS = 200;
const SMS_BROADCAST_MAX_CHARS = 640;

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

    // Same people who can manage call shifts in the app; one broadcast is capped.
    await assertMemberPermission(db, departmentId, request.auth, ["editSchedule", "manageSystemSettings"],
      "Only schedulers can send shift texts.");
    if (!Array.isArray(personnelIds) || personnelIds.length > SMS_BROADCAST_MAX_RECIPIENTS) {
      throw new HttpsError("invalid-argument", `A shift text can go to at most ${SMS_BROADCAST_MAX_RECIPIENTS} people.`);
    }
    if (String(message || "").length > SMS_BROADCAST_MAX_CHARS) {
      throw new HttpsError("invalid-argument", `Keep the message under ${SMS_BROADCAST_MAX_CHARS} characters.`);
    }

    if (isDemoDepartment(departmentId)) {
      logDemoOutbound("shift text", { broadcastId, recipients: personnelIds.length });
      return {
        broadcastId,
        attempted: personnelIds.length,
        sent: 0,
        skipped: personnelIds.map((personnelId) => ({ personnelId, reason: DEMO_OUTBOUND_MESSAGE })),
        failed: [],
        deliveries: [],
        demo: true,
      };
    }

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
    const { gatewaySlug = "", displayKey = "" } = request.data || {};
    if (!String(gatewaySlug || "").trim()) {
      throw new HttpsError("invalid-argument", "gatewaySlug is required.");
    }
    try {
      return await loadPublicAlertDashboard(db, gatewaySlug, { sync: true, displayKey });
    } catch (error) {
      if (error.code === "permission-denied") throw new HttpsError("permission-denied", error.message);
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
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug, request.data?.displayKey);
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
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug, request.data?.displayKey);
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
    await assertDepartmentAccessOrPublicGateway(db, departmentId, request.auth, gatewaySlug, request.data?.displayKey);
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

    return jotformSetupResponse(departmentId, await ensureSettings(db, departmentId));
  }
);

function jotformSetupResponse(departmentId, settings = {}) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
  return {
    formUrl: settings.formUrl || "",
    formId: settings.formId || "",
    formTitle: settings.formTitle || "Damage Form",
    apiKeyConfigured: Boolean(settings.apiKey),
    // The webhook link carries the token, so only admins get it.
    webhookUrl: "",
    lastSubmissionAt: settings.lastSubmissionAt || "",
  };
}

/** Admins only: everything the setup screen needs, including the webhook link. */
exports.saveJotformDamageSetup = onCall(
  { region: "us-central1" },
  async (request) => {
    const db = admin.firestore();
    const { departmentId = "", formUrl, formTitle, apiKey, removeApiKey = false, readOnly = false } = request.data || {};
    await invites.assertDepartmentAdmin(db, departmentId, request.auth);
    let settings;
    try {
      settings = readOnly
        ? await ensureSettings(db, departmentId)
        : await saveJotformDamageSetupRecord(db, departmentId, { formUrl, formTitle, apiKey, removeApiKey });
    } catch (error) {
      if (error.code === "invalid-argument") throw new HttpsError("invalid-argument", error.message);
      throw error;
    }
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
    return {
      ...jotformSetupResponse(departmentId, settings),
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
  await assertDepartmentAccess(admin.firestore(), departmentId, request.auth);

  try {
    return await resolvePersonIdentityViaHub(admin.firestore(), departmentId, request.data?.person || {});
  } catch (error) {
    console.error("resolveForgePersonIdentity failed", {
      departmentId,
      message: error instanceof Error ? error.message : String(error),
      cause: error?.cause?.code || error?.cause?.message || undefined,
    });
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
    const [deptSnap, secretSnap] = await Promise.all([
      db.doc(`departments/${departmentId}/settings/main`).get().catch(() => ({ exists: false })),
      db.doc(`departments/${departmentId}/integrations/forgeAcademyHub`).get().catch(() => ({ exists: false })),
    ]);
    for (const snap of [deptSnap, secretSnap]) {
      if (!snap.exists) continue;
      const fa = snap === deptSnap ? snap.data()?.forgeAcademy || {} : snap.data() || {};
      if (fa.webhookSecret) expectedCandidates.push(String(fa.webhookSecret).trim());
      if (fa.hubSecret) expectedCandidates.push(String(fa.hubSecret).trim());
      if (fa.outboundSecret) expectedCandidates.push(String(fa.outboundSecret).trim());
    }
  }

  const expected = expectedCandidates.filter(Boolean);
  // No secret configured means nobody can post training records (it used to let anyone in).
  if (!expected.length) return false;
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
 * Send a hydrant damage report email with PDF attachment (Resend, same
 * settings as the rest of the platform; see lib/hydrantDamageEmail.js).
 * Never claims success unless the provider accepts the message. In log-only
 * mode (EMAIL_DELIVERY=log) or with no provider configured it reports
 * accepted:false with a plain reason.
 */
exports.sendHydrantDamageReport = onCall(
  {
    region: "us-central1",
    secrets: EMAIL_SECRETS,
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

    const pdfBuffer = await generateHydrantDamagePdfBuffer(report, {
      departmentName: departmentName || "Fire Department",
    });

    if (isDemoDepartment(departmentId)) {
      logDemoOutbound("hydrant damage report", { reportId, to: recipients });
      if (attemptId) {
        await db.doc(`departments/${departmentId}/hydrantDamageEmailAttempts/${attemptId}`).set({
          status: "logged",
          providerStatus: "demo",
          error: DEMO_OUTBOUND_MESSAGE,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { accepted: false, error: DEMO_OUTBOUND_MESSAGE, providerStatus: "demo", providerMessageId: "" };
    }

    // Only our own app addresses: the link goes to a water utility, so it must
    // never point at a site the caller chose.
    const origin = safeAppOrigin(
      request.data?.origin
      || process.env.RMS_APP_ORIGIN
      || "https://app.forgeresponder.com"
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

    const sendResult = await sendHydrantDamageEmail({
      to: recipients,
      // Replies go to the firefighter who sent it, not the no-reply sender.
      replyTo: String(request.auth?.token?.email || "").trim(),
      subject: subject || `Hydrant Damage Report ${report.reportNumber || reportId}`,
      text: bodyWithAck,
      pdfBuffer,
      filename: `${report.reportNumber || reportId}.pdf`,
    });

    if (attemptId) {
      await db.doc(`departments/${departmentId}/hydrantDamageEmailAttempts/${attemptId}`).set({
        status: sendResult.ok ? "accepted" : (sendResult.outcome === "logged" ? "logged" : "failed"),
        providerStatus: sendResult.outcome === "sent" ? String(sendResult.status || "") : sendResult.outcome,
        providerMessageId: sendResult.providerMessageId || "",
        error: sendResult.ok ? "" : (sendResult.errorText || "The email provider rejected the message."),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (!sendResult.ok) {
      return {
        accepted: false,
        error: sendResult.errorText || "The email provider rejected the message.",
        providerStatus: sendResult.outcome === "failed" ? String(sendResult.status || "failed") : sendResult.outcome,
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

exports.createDepartmentInvite = onCall({ secrets: EMAIL_SECRETS }, async (request) =>
  invites.createInvite(admin.firestore(), request));

exports.revokeDepartmentInvite = onCall(async (request) =>
  invites.revokeInvite(admin.firestore(), request));

exports.acceptDepartmentInvite = onCall(async (request) =>
  invites.acceptInvite(admin.firestore(), request));

exports.previewDepartmentInvite = onCall({ invoker: "public" }, async (request) =>
  invites.previewInvite(admin.firestore(), request));

// Members link their own personnel record only through here (matched by verified email).
exports.linkMyPersonnelRecord = onCall(async (request) =>
  linkMyPersonnelRecord(admin.firestore(), request));

// ---------------------------------------------------------------------------
// Department subdomains (<department>.forgeresponder.com) on Firebase Hosting.
// ---------------------------------------------------------------------------
const departmentDomains = require("./lib/departmentDomains");

exports.registerDepartmentDomain = onCall(async (request) =>
  departmentDomains.registerDepartmentDomain(admin.firestore(), request));

exports.departmentDomainStatus = onCall(async (request) =>
  departmentDomains.departmentDomainStatus(admin.firestore(), request));

// ---------------------------------------------------------------------------
// Billing lifecycle (manual/check billing): daily reminders, past-due marking,
// complimentary renewals. Suspension stays a manual Creator Console decision.
// ---------------------------------------------------------------------------
const { onSchedule } = require("firebase-functions/v2/scheduler");
const billingLifecycle = require("./lib/billingLifecycle");

exports.billingLifecycleDaily = onSchedule(
  { schedule: "every day 08:00", timeZone: billingLifecycle.TIME_ZONE, retryCount: 1, secrets: EMAIL_SECRETS },
  async () => {
    const result = await billingLifecycle.runBillingLifecycle(admin.firestore());
    console.log(`Billing lifecycle ${result.today}: ${result.actions.length} action(s)`, result.actions.map((a) => `${a.departmentId}:${a.kind}`));
    // Nightly safety net: re-derive every department's entitlements.
    await entitlements.refreshAll(admin.firestore());
  }
);

exports.previewBillingLifecycle = onCall(async (request) =>
  billingLifecycle.previewBillingLifecycle(admin.firestore(), request));

// Creator-only: send a test email to yourself to confirm email delivery works.
const { sendTestEmail } = require("./lib/emailTest");
exports.sendTestEmail = onCall({ secrets: EMAIL_SECRETS }, async (request) =>
  sendTestEmail(admin.firestore(), request));

// Email-address verification, sent from our own mailer (Forge Public Safety)
// rather than Firebase's default sender.
const emailVerification = require("./lib/emailVerification");
exports.sendAccountVerificationEmail = onCall({ secrets: EMAIL_SECRETS }, async (request) =>
  emailVerification.sendVerificationEmail(admin.firestore(), admin.auth(), request));

// ---------------------------------------------------------------------------
// Creator Console: per-department usage and data export (creator only).
// ---------------------------------------------------------------------------
const platformConsole = require("./lib/platformConsole");

exports.departmentUsage = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) =>
  platformConsole.departmentUsage(admin.firestore(), admin.storage().bucket(), request));

exports.exportDepartmentData = onCall({ memory: "1GiB", timeoutSeconds: 540 }, async (request) =>
  platformConsole.exportDepartmentData(admin.firestore(), admin.storage().bucket(), request));

// ---- Entitlements (plan modules and limits, enforced by firestore.rules) ----
// platformEntitlements/<departmentId> is derived from the subscription, plan,
// department settings (disabledModules) and usage; these keep it current.
const entitlements = require("./lib/entitlements");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

const refreshEntitlementsFor = (departmentId) =>
  entitlements.refreshDepartment(admin.firestore(), departmentId)
    .catch((error) => console.error(`Entitlements refresh failed for ${departmentId}`, error));

exports.entitlementsOnSubscription = onDocumentWritten("platformSubscriptions/{departmentId}", (event) =>
  refreshEntitlementsFor(event.params.departmentId));

exports.entitlementsOnPlan = onDocumentWritten("platformSubscriptionPlans/{planId}", (event) =>
  entitlements.refreshForPlan(admin.firestore(), event.params.planId));

exports.entitlementsOnSettings = onDocumentWritten("departments/{departmentId}/settings/main", (event) => {
  if (!entitlements.modulesChanged(event.data?.before?.data(), event.data?.after?.data())) return null;
  return refreshEntitlementsFor(event.params.departmentId);
});

exports.entitlementsOnProfile = onDocumentWritten("departments/{departmentId}/profile/main", (event) => {
  if (!entitlements.stationsChanged(event.data?.before?.data(), event.data?.after?.data())) return null;
  return refreshEntitlementsFor(event.params.departmentId);
});

exports.entitlementsOnMembers = onDocumentWritten("departments/{departmentId}/users/{uid}", (event) =>
  refreshEntitlementsFor(event.params.departmentId));

// departments/<id>/memberGrants/<uid>: each member's permissions, which the
// Firestore rules check. Kept current when a membership or a role changes.
const memberGrants = require("./lib/memberGrants");

exports.memberGrantsOnMember = onDocumentWritten("departments/{departmentId}/users/{uid}", (event) =>
  memberGrants.refreshMember(admin.firestore(), event.params.departmentId, event.params.uid)
    .catch((error) => console.error(`Member grant refresh failed for ${event.params.departmentId}/${event.params.uid}`, error)));

exports.memberGrantsOnRole = onDocumentWritten("departments/{departmentId}/roles/{roleId}", (event) => {
  if (!memberGrants.rolePermissionsChanged(event.data?.before?.data(), event.data?.after?.data())) return null;
  return memberGrants.refreshDepartment(admin.firestore(), event.params.departmentId)
    .catch((error) => console.error(`Member grant refresh failed for ${event.params.departmentId}`, error));
});

exports.entitlementsOnPersonnel = onDocumentWritten(
  `departments/{departmentId}/lists/${entitlements.PERSONNEL_LIST}/items/{itemId}`,
  (event) => {
    // Only adds and removes change the count.
    if (event.data?.before?.exists && event.data?.after?.exists) return null;
    return refreshEntitlementsFor(event.params.departmentId);
  }
);

/**
 * Creators: clear someone's two-factor setup (lost phone). They sign in with
 * their password next time and set it up again. Your own account: use
 * scripts/two-factor.mjs --reset instead, so you can't lock yourself out here.
 */
exports.resetTwoFactor = onCall(async (request) => {
  const db = admin.firestore();
  if (!(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Only platform creators (signed in with two-factor) can reset two-factor.");
  }
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Enter the person's email address.");
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", "No account uses that email address.");
  }
  if (user.uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Reset your own two-factor with scripts/two-factor.mjs.");
  }
  await admin.auth().updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  await admin.auth().revokeRefreshTokens(user.uid);
  await db.collection("platformAuditLogs").add({
    action: "security.two-factor-reset",
    module: "Creator Console",
    recordId: user.uid,
    summary: `Reset two-factor login for ${email}`,
    actorUid: request.auth.uid,
    actorName: request.auth.token?.email || "",
    created_at: new Date().toISOString(),
  });
  return { email, cleared: true };
});

/** Creators: re-derive every department's entitlements now. */
exports.refreshEntitlements = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth?.uid || !(await isPlatformCreator(admin.firestore(), request.auth))) {
    throw new HttpsError("permission-denied", "Only platform creators can refresh entitlements.");
  }
  const results = await entitlements.refreshAll(admin.firestore());
  return { count: results.length };
});

// ---- AI narrative drafts for NERIS reports (Claude). Set the key with:
// firebase functions:secrets:set ANTHROPIC_API_KEY
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const nerisNarrative = require("./lib/nerisNarrative");

exports.draftNerisNarrative = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const db = admin.firestore();
    const departmentId = String(request.data?.departmentId || "").trim();
    await assertDepartmentAccess(db, departmentId, request.auth);

    const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
    const modules = ent.data()?.modules;
    if (Array.isArray(modules) && !modules.includes("nerisFireReports")) {
      throw new HttpsError("permission-denied", "NERIS reports aren't included in your department's plan.");
    }

    const report = request.data?.report;
    if (!report || typeof report !== "object") {
      throw new HttpsError("invalid-argument", "Open a report first.");
    }
    const style = ["standard", "concise", "detailed"].includes(request.data?.style) ? request.data.style : "standard";
    const key = anthropicApiKey.value();
    if (!key) throw new HttpsError("failed-precondition", "AI narratives aren't set up yet (missing API key).");

    await nerisNarrative.reserveDailyUse(db, departmentId);

    const Anthropic = require("@anthropic-ai/sdk");
    const AnthropicClient = Anthropic.default || Anthropic;
    const client = new AnthropicClient({ apiKey: key, timeout: 90_000, maxRetries: 2 });
    try {
      const result = await nerisNarrative.draftNarrative(client, {
        report,
        notes: String(request.data?.notes || ""),
        style,
        existingNarrative: String(request.data?.existingNarrative || ""),
      });
      await db.collection(`departments/${departmentId}/auditLogs`).add({
        action: "neris.ai-narrative-draft",
        module: "NERIS",
        recordId: String(report.id || ""),
        summary: `AI narrative draft for ${String(report.reportNumber || "report")}`,
        actorUid: request.auth.uid,
        actorName: request.auth.token?.email || "",
        model: result.model,
        created_at: new Date().toISOString(),
      }).catch(() => undefined);
      return result;
    } catch (error) {
      await nerisNarrative.releaseDailyUse(db, departmentId).catch(() => undefined);
      if (error instanceof HttpsError) throw error;
      if (error instanceof AnthropicClient.RateLimitError) {
        throw new HttpsError("resource-exhausted", "The AI service is busy. Try again in a minute.");
      }
      if (error instanceof AnthropicClient.AuthenticationError || error instanceof AnthropicClient.PermissionDeniedError) {
        console.error("draftNerisNarrative: API key rejected", error.status);
        throw new HttpsError("failed-precondition", "AI narratives aren't set up correctly. Contact FORGE Public Safety.");
      }
      if (error instanceof AnthropicClient.APIConnectionError) {
        throw new HttpsError("unavailable", "Couldn't reach the AI service. Try again.");
      }
      if (error instanceof AnthropicClient.APIError && /credit balance/i.test(String(error.message))) {
        console.error("draftNerisNarrative: Anthropic account is out of credits");
        throw new HttpsError("failed-precondition", "AI drafting is paused right now. Write the narrative yourself, and contact FORGE Public Safety if this keeps happening.");
      }
      if (error instanceof AnthropicClient.APIError) {
        console.error("draftNerisNarrative: API error", error.status, error.message);
        throw new HttpsError("internal", "The AI service had a problem. Try again.");
      }
      console.error("draftNerisNarrative failed", error);
      throw new HttpsError("internal", "Couldn't draft the narrative. Try again.");
    }
  }
);

// ---- NERIS API connection. FORGE has one NERIS integration account; each
// department enrolls FORGE's client ID in the NERIS portal, then saves its
// NERIS ID here. Set the credentials with:
//   firebase functions:secrets:set NERIS_CLIENT_ID
//   firebase functions:secrets:set NERIS_CLIENT_SECRET
// NERIS_ENVIRONMENT is "test" (sandbox, default) or "production"; set it in
// functions/.env. (A plain env var, not defineString, so deploys never stop to ask.)
const nerisClientId = defineSecret("NERIS_CLIENT_ID");
const nerisClientSecret = defineSecret("NERIS_CLIENT_SECRET");
const nerisStore = require("./lib/nerisStore");
const { NerisError } = require("./lib/nerisClient");
const NERIS_SECRETS = [nerisClientId, nerisClientSecret];

function nerisCredentials() {
  return {
    clientId: nerisClientId.value(),
    clientSecret: nerisClientSecret.value(),
    environment: process.env.NERIS_ENVIRONMENT || "test",
  };
}

function nerisStatusResponse(connection) {
  const credentials = nerisCredentials();
  return nerisStore.publicStatus(connection, credentials);
}

// The demo department's sign-in is public (and that user is a department admin),
// so only platform creators may change its NERIS connection, and only against
// the NERIS test sandbox.
async function assertNerisDemoGuard(db, departmentId, auth) {
  if (!isDemoDepartment(departmentId)) return;
  if (!(await isPlatformCreator(db, auth))) {
    throw new HttpsError("permission-denied", "Only FORGE Public Safety can change the demo department's NERIS connection.");
  }
  if (nerisCredentials().environment !== "test") {
    throw new HttpsError("failed-precondition", "The demo department can only connect to the NERIS test sandbox.");
  }
}

async function assertNerisAdmin(db, departmentId, auth) {
  await invites.assertDepartmentAdmin(db, departmentId, auth);
  await assertNerisDemoGuard(db, departmentId, auth);
  await assertNerisPlan(db, departmentId);
}

async function assertNerisPlan(db, departmentId) {
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes("nerisFireReports")) {
    throw new HttpsError("permission-denied", "NERIS reports aren't included in your department's plan.");
  }
}

function nerisAudit(db, departmentId, auth, action, summary) {
  return db.collection(`departments/${departmentId}/auditLogs`).add({
    action,
    module: "NERIS",
    recordId: "neris-connection",
    summary,
    actorUid: auth?.uid || "",
    actorName: auth?.token?.email || "",
    created_at: new Date().toISOString(),
  }).catch(() => undefined);
}

function nerisHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof NerisError && error.code === "invalid") return new HttpsError("invalid-argument", error.message);
  if (error instanceof NerisError) return new HttpsError("failed-precondition", error.message);
  console.error("NERIS connection failed", error);
  return new HttpsError("internal", "Couldn't update the NERIS connection. Try again.");
}

/** Any member: connection status plus FORGE's client ID for the enrollment steps. */
exports.nerisGetConnection = onCall({ secrets: NERIS_SECRETS }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertDepartmentAccess(db, departmentId, request.auth);
  return nerisStatusResponse(await nerisStore.loadConnection(db, departmentId));
});

/** Department admins: save the department's NERIS ID and test it right away. */
exports.nerisSaveConnection = onCall({ secrets: NERIS_SECRETS, timeoutSeconds: 60 }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertNerisAdmin(db, departmentId, request.auth);
  try {
    const connection = await nerisStore.saveNerisId(db, departmentId, request.data?.nerisId, {
      savedBy: request.auth.uid,
      credentials: nerisCredentials(),
    });
    await nerisAudit(db, departmentId, request.auth, "neris.connection-saved",
      `Saved NERIS ID ${connection.nerisId} (${connection.status})`);
    return nerisStatusResponse(connection);
  } catch (error) {
    throw nerisHttpsError(error);
  }
});

/** Department admins: re-check that NERIS still accepts FORGE for this department. */
exports.nerisTestConnection = onCall({ secrets: NERIS_SECRETS, timeoutSeconds: 60 }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertNerisAdmin(db, departmentId, request.auth);
  try {
    const connection = await nerisStore.checkConnection(db, departmentId, { credentials: nerisCredentials() });
    return nerisStatusResponse(connection);
  } catch (error) {
    throw nerisHttpsError(error);
  }
});

/** Department admins: forget the NERIS ID. (Removing FORGE's enrollment happens in the NERIS portal.) */
exports.nerisRemoveConnection = onCall({ secrets: NERIS_SECRETS }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await invites.assertDepartmentAdmin(db, departmentId, request.auth);
  if (isDemoDepartment(departmentId) && !(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Only FORGE Public Safety can change the demo department's NERIS connection.");
  }
  const current = await nerisStore.loadConnection(db, departmentId);
  await nerisStore.removeConnection(db, departmentId);
  if (current?.nerisId) {
    await nerisAudit(db, departmentId, request.auth, "neris.connection-removed", `Removed NERIS ID ${current.nerisId}`);
  }
  return nerisStatusResponse(null);
});

// ---- Department, station and unit sync (FORGE → NERIS). Preview first, then send.
const nerisSync = require("./lib/nerisSync");
const { fetchEntity, nerisRequest } = require("./lib/nerisClient");
const { readListItems } = require("./lib/listStore");

async function loadNerisSyncInputs(db, departmentId, unitSettingsOverride = {}) {
  const connection = await nerisStore.loadConnection(db, departmentId);
  if (!connection?.nerisId) {
    throw new HttpsError("failed-precondition", "Save the department's NERIS ID first.");
  }
  const credentials = nerisCredentials();
  const [profileSnap, apparatus, entity] = await Promise.all([
    db.doc(`departments/${departmentId}/profile/main`).get(),
    readListItems(db, departmentId, "hlfd-rms-apparatus"),
    fetchEntity(connection.nerisId, { credentials }).catch((error) => { throw nerisHttpsError(error); }),
  ]);
  const unitSettings = { ...(connection.unitSettings || {}), ...nerisSync.cleanUnitSettings(unitSettingsOverride) };
  const profile = profileSnap.data() || {};
  const plan = nerisSync.buildSyncPlan({
    profile,
    apparatus,
    entity: entity.entity,
    connection: { ...connection, unitSettings },
  });
  return { connection, credentials, profile, plan, unitSettings };
}

/** Department admins: what would change in NERIS. Sends nothing. */
exports.nerisSyncPreview = onCall({ secrets: NERIS_SECRETS, timeoutSeconds: 60 }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertNerisAdmin(db, departmentId, request.auth);
  const { plan } = await loadNerisSyncInputs(db, departmentId, request.data?.unitSettings);
  return { plan, unitTypes: nerisSync.NERIS_UNIT_TYPES };
});

/** Department admins: send the ticked department fields, stations and units to NERIS. */
exports.nerisSyncApply = onCall({ secrets: NERIS_SECRETS, timeoutSeconds: 300 }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  await assertNerisAdmin(db, departmentId, request.auth);
  const strings = (value) => (Array.isArray(value) ? value.map((v) => String(v)).slice(0, 500) : []);
  const selection = {
    departmentFields: strings(request.data?.selection?.departmentFields),
    stationIds: strings(request.data?.selection?.stationIds),
    unitIds: strings(request.data?.selection?.unitIds),
  };
  const { connection, credentials, profile, plan, unitSettings } = await loadNerisSyncInputs(db, departmentId, request.data?.unitSettings);

  let outcome;
  try {
    outcome = await nerisSync.applySyncPlan({
      plan,
      profile,
      nerisId: connection.nerisId,
      selection,
      request: (path, { method, body }) => nerisRequest(path, { credentials, method, body }),
    });
  } catch (error) {
    throw nerisHttpsError(error);
  }

  const sent = outcome.results.length;
  const failed = outcome.results.filter((r) => !r.ok).length;
  await nerisStore.saveSyncResult(db, departmentId, {
    stationLinks: outcome.stationLinks,
    unitLinks: outcome.unitLinks,
    unitSettings,
    summary: { sent, failed, by: request.auth.uid },
  });
  if (sent) {
    await nerisAudit(db, departmentId, request.auth, "neris.sync",
      `Sent ${sent} item${sent === 1 ? "" : "s"} to NERIS${failed ? ` (${failed} failed)` : ""}`);
  }

  // Fresh preview so the screen shows NERIS's state after the run.
  const after = await loadNerisSyncInputs(db, departmentId).catch(() => null);
  return { results: outcome.results, plan: after?.plan || plan, unitTypes: nerisSync.NERIS_UNIT_TYPES };
});

// ---- Incident submission (FORGE report → NERIS incident).
const nerisIncident = require("./lib/nerisIncident");
const NERIS_REPORTS_LIST = "hlfd-rms-neris-fire-reports";
const NERIS_SUBMITTABLE = ["Approved", "Ready for Submission"];

/**
 * Report editors: check an approved report with NERIS ("validate"), or send it
 * ("submit"). The first submit creates the incident; after that the same
 * report updates it (PUT), so corrections never create duplicates.
 * The report is read from Firestore, not from the browser.
 * Returns what the browser should record on the report.
 */
exports.nerisSubmitIncident = onCall({ secrets: NERIS_SECRETS, timeoutSeconds: 60 }, async (request) => {
  const db = admin.firestore();
  const departmentId = String(request.data?.departmentId || "").trim();
  const reportId = String(request.data?.reportId || "").trim();
  const mode = request.data?.mode === "submit" ? "submit" : "validate";
  await assertMemberPermission(db, departmentId, request.auth, ["editNerisReports"],
    "You need permission to edit NERIS reports.");
  await assertNerisDemoGuard(db, departmentId, request.auth);
  await assertNerisPlan(db, departmentId);
  if (!reportId) throw new HttpsError("invalid-argument", "Open a report first.");

  const connection = await nerisStore.loadConnection(db, departmentId);
  if (!connection?.nerisId) {
    throw new HttpsError("failed-precondition", "This department isn't connected to NERIS yet. An administrator can set it up under System Admin → Connected Services.");
  }

  const [reports, profileSnap, apparatus] = await Promise.all([
    readListItems(db, departmentId, NERIS_REPORTS_LIST),
    db.doc(`departments/${departmentId}/profile/main`).get(),
    readListItems(db, departmentId, "hlfd-rms-apparatus"),
  ]);
  const report = reports.find((r) => String(r?.id || "") === reportId);
  if (!report) throw new HttpsError("not-found", "FORGE hasn't saved this report yet. Wait a moment and try again.");
  // The browser autosaves; refuse if it has changes the server hasn't seen.
  const expected = String(request.data?.updatedAt || "");
  if (expected && report.updatedAt && expected !== String(report.updatedAt)) {
    throw new HttpsError("failed-precondition", "Your latest changes are still saving. Wait a moment and try again.");
  }
  if (!NERIS_SUBMITTABLE.includes(report.status)) {
    throw new HttpsError("failed-precondition", "The report must be approved before it goes to NERIS.");
  }

  const { payload, problems, warnings } = nerisIncident.buildIncidentPayload({
    report,
    nerisId: connection.nerisId,
    profile: profileSnap.data() || {},
    apparatus,
    unitLinks: connection.unitLinks || {},
  });
  if (!payload) return { ok: false, stage: "forge", problems, warnings };

  const credentials = nerisCredentials();
  const entityPath = `/incident/${encodeURIComponent(connection.nerisId)}`;
  const call = (path, method, body) => nerisRequest(path, { credentials, method, body })
    .catch((error) => { throw nerisHttpsError(error); });

  const validation = await call(`${entityPath}/validate`, "POST", payload);
  if (!validation.ok) {
    return { ok: false, stage: "neris", problems: nerisIncident.validationMessages(validation), warnings };
  }
  if (mode === "validate") return { ok: true, validated: true, warnings };

  const existing = connection.incidentLinks?.[reportId];
  const at = new Date().toISOString();
  let nerisIncidentId = existing?.nerisIncidentId || "";
  let incidentStatus = existing?.status || "";
  let action;
  if (nerisIncidentId) {
    action = "update";
    const result = await call(`${entityPath}/${encodeURIComponent(nerisIncidentId)}`, "PUT", payload);
    if (!result.ok) return { ok: false, stage: "neris", problems: nerisIncident.validationMessages(result), warnings };
  } else {
    action = "create";
    const result = await call(entityPath, "POST", payload);
    if (!result.ok || !result.data?.neris_id) {
      return { ok: false, stage: "neris", problems: nerisIncident.validationMessages(result), warnings };
    }
    nerisIncidentId = String(result.data.neris_id);
    incidentStatus = String(result.data.incident_status?.status || "");
  }

  const environment = credentials.environment === "production" ? "production" : "test";
  await nerisStore.saveIncidentLink(db, departmentId, reportId, {
    nerisIncidentId,
    reportNumber: String(report.reportNumber || ""),
    status: incidentStatus,
    environment,
    firstSubmittedAt: existing?.firstSubmittedAt || at,
    lastSubmittedAt: at,
    lastAction: action,
    submissions: (existing?.submissions || 0) + 1,
  });
  await nerisAudit(db, departmentId, request.auth, action === "create" ? "neris.incident-created" : "neris.incident-updated",
    `${action === "create" ? "Submitted" : "Sent correction for"} ${report.reportNumber || reportId} to NERIS (${nerisIncidentId})`);

  return {
    ok: true,
    action,
    warnings,
    submission: {
      nerisIncidentId,
      incidentStatus,
      environment,
      submittedAt: at,
      submittedBy: request.auth.token?.email || request.auth.uid,
      action,
    },
  };
});

// Hydrant app: email the daily activity CSV built in the browser.
const { sendDailyActivityEmail } = require("./lib/hydrantActivityEmail");
const { sendTextEmail } = require("./lib/mailer");
exports.sendHydrantDailyActivityEmail = onCall({ secrets: EMAIL_SECRETS }, (request) =>
  sendDailyActivityEmail(admin.firestore(), request, { sendTextEmail }));

// Internal messages carry toAll / recipientUids so the Firestore rules can give
// each message only to its sender, its recipients and message managers.
const messageRecipients = require("./lib/messageRecipients");

exports.internalMessageAudience = onDocumentWritten("departments/{departmentId}/internalEmails/{messageId}", (event) =>
  messageRecipients.handleMessageWritten(admin.firestore(), event)
    .catch((error) => console.error(`Message audience failed for ${event.params.departmentId}/${event.params.messageId}`, error)));
