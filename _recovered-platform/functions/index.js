const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const twilio = require("twilio");
const { assertDepartmentAccess } = require("./lib/access");
const { resolvePersonnelPhones } = require("./lib/personnel");
const { toUsE164 } = require("./lib/phone");

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
