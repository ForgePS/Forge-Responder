const crypto = require("crypto");
const { buildPublicPdfUrls } = require("./jotformDamagePdf");

const SETTINGS_DOC_ID = "damageFormJotform";

function extractJotformId(formUrl = "") {
  const match = String(formUrl).match(/jotform\.com\/(?:form\/|jsform\/)?(\d+)/i);
  return match ? match[1] : "";
}

function settingsRef(db, departmentId) {
  return db.doc(`departments/${departmentId}/settings/${SETTINGS_DOC_ID}`);
}

async function loadSettings(db, departmentId) {
  const snap = await settingsRef(db, departmentId).get();
  return snap.exists ? snap.data() : null;
}

async function ensureSettings(db, departmentId) {
  const ref = settingsRef(db, departmentId);
  const snap = await ref.get();
  if (snap.exists) return snap.data();

  const payload = {
    formUrl: "",
    formId: "",
    formTitle: "Damage Form",
    webhookToken: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await ref.set(payload, { merge: true });
  return payload;
}

function formatAnswerValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatAnswerValue(item)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    if (value.prettyFormat) return String(value.prettyFormat);
    if (value.text) return String(value.text);
    if (value.full) return String(value.full);
    if (value.datetime) return String(value.datetime);
    if (value.date) return String(value.date);
    if (value.time) return String(value.time);
    if (value.first && value.last) return `${value.first} ${value.last}`.trim();
    if (value.first) return String(value.first);
    if (value.last) return String(value.last);
    if (value.addr_line1 || value.city || value.state) {
      return [value.addr_line1, value.addr_line2, value.city, value.state, value.postal]
        .filter(Boolean)
        .join(", ");
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function humanizeFieldKey(key = "") {
  return String(key)
    .replace(/^q\d+_?/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Answer";
}

function collectRawAnswers(body = {}) {
  const merged = {};

  if (body.rawRequest) {
    try {
      const parsed = typeof body.rawRequest === "string" ? JSON.parse(body.rawRequest) : body.rawRequest;
      Object.assign(merged, parsed || {});
    } catch {
      // Ignore malformed rawRequest payloads.
    }
  }

  if (body.content) {
    try {
      const content = typeof body.content === "string" ? JSON.parse(body.content) : body.content;
      if (Array.isArray(content)) {
        content.forEach((item, index) => {
          if (!item || typeof item !== "object") return;
          const key = item.name || item.text || `field_${index + 1}`;
          const value = item.answer ?? item.prettyFormat ?? item.text;
          if (value !== undefined && value !== null && value !== "") {
            merged[`q_${key}`] = value;
          }
        });
      }
    } catch {
      // Ignore malformed content payloads.
    }
  }

  Object.entries(body).forEach(([key, value]) => {
    if (/^q\d/i.test(key)) merged[key] = value;
  });

  return merged;
}

function buildAnswers(rawAnswers = {}) {
  return Object.entries(rawAnswers)
    .filter(([key, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      field: key,
      label: humanizeFieldKey(key),
      value: formatAnswerValue(value),
    }))
    .filter((item) => item.value);
}

function pickSubmitter(answers = []) {
  const nameAnswer = answers.find((item) => /person filling|filled out|submitter/i.test(item.label))
    || answers.find((item) => /name|employee|person/i.test(item.label));
  const emailAnswer = answers.find((item) => /email/i.test(item.label));
  return {
    submitterName: nameAnswer?.value || "",
    submitterEmail: emailAnswer?.value || "",
  };
}

function buildTitle(answers = [], submissionId = "") {
  const locationAnswer = answers.find((item) => /property\/equipment location|damaged property|station|unit number|^location$/i.test(item.label));
  const descriptionAnswer = answers.find((item) => /what is damaged|description of the damage|damage description/i.test(item.label));
  const nameAnswer = answers.find((item) => /person filling|filled out|submitter/i.test(item.label))
    || answers.find((item) => /name|employee|person/i.test(item.label));

  if (locationAnswer?.value && descriptionAnswer?.value && locationAnswer.value !== descriptionAnswer.value) {
    const summary = descriptionAnswer.value.length > 72
      ? `${descriptionAnswer.value.slice(0, 69)}...`
      : descriptionAnswer.value;
    return `${locationAnswer.value} — ${summary}`;
  }
  if (locationAnswer?.value) return locationAnswer.value;
  if (descriptionAnswer?.value) {
    return descriptionAnswer.value.length > 96
      ? `${descriptionAnswer.value.slice(0, 93)}...`
      : descriptionAnswer.value;
  }
  if (nameAnswer?.value) return `Damage form — ${nameAnswer.value}`;
  return submissionId ? `Damage form #${submissionId}` : "Damage form submission";
}

function parseSubmittedAt(body = {}) {
  const raw = body.created_at || body.createdAt || body.submissionDate || body.submittedAt;
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function extractSubmissionId(body = {}) {
  const direct = body.submissionID
    || body.submissionId
    || body.submission_id
    || body.id;
  if (direct) return String(direct).trim();

  if (body.rawRequest) {
    try {
      const parsed = typeof body.rawRequest === "string" ? JSON.parse(body.rawRequest) : body.rawRequest;
      const nested = parsed?.submissionID || parsed?.submissionId || parsed?.id;
      if (nested) return String(nested).trim();
    } catch {
      // Ignore malformed rawRequest payloads.
    }
  }

  return "";
}

function parseJotformWebhookBody(body = {}, settings = {}) {
  const submissionId = extractSubmissionId(body);
  const formId = String(body.formID || body.formId || settings.formId || extractJotformId(settings.formUrl) || "").trim();
  const answers = buildAnswers(collectRawAnswers(body));
  const { submitterName, submitterEmail } = pickSubmitter(answers);
  const title = buildTitle(answers, submissionId);
  const summary = answers.find((item) => /what is damaged|description of the damage|damage description/i.test(item.label))?.value
    || answers[0]?.value
    || "";
  const pdfLinks = buildPublicPdfUrls(formId, submissionId);

  return {
    source: "jotform",
    submissionId,
    formId,
    formUrl: settings.formUrl || (formId ? `https://form.jotform.com/${formId}` : ""),
    formTitle: settings.formTitle || "Damage Form",
    title,
    summary,
    submittedAt: parseSubmittedAt(body),
    submitterName,
    submitterEmail,
    answers,
    viewUrl: submissionId ? `https://www.jotform.com/submission/${submissionId}` : "",
    pdfUrl: pdfLinks.pdfUrl,
    publicPdfUrl: pdfLinks.publicPdfUrl,
    receivedAt: new Date().toISOString(),
  };
}

async function validateWebhookToken(db, departmentId, token) {
  const settings = await loadSettings(db, departmentId);
  if (!settings?.webhookToken) {
    return false;
  }
  return String(token || "").trim() === String(settings.webhookToken).trim();
}

async function saveDamageFormSubmission(db, departmentId, body = {}) {
  const settings = (await loadSettings(db, departmentId)) || (await ensureSettings(db, departmentId));
  let parsed = parseJotformWebhookBody(body, settings);
  if (!parsed.submissionId) {
    throw new Error("Missing JotForm submission ID.");
  }

  if (settings?.apiKey) {
    try {
      const { enrichDamageFormRecord } = require("./jotformSubmissionApi");
      parsed = await enrichDamageFormRecord(parsed, settings, settings.apiKey);
    } catch (error) {
      console.warn("JotForm submission enrichment failed; saving webhook payload.", error.message);
    }
  }

  const recordId = `jf-${parsed.submissionId}`;
  const ref = db.doc(`departments/${departmentId}/damageForms/${recordId}`);
  await ref.set(parsed, { merge: true });
  return { id: recordId, ...parsed };
}

function buildWebhookUrl(projectId, departmentId, token) {
  const params = new URLSearchParams({
    departmentId,
    token,
  });
  return `https://us-central1-${projectId}.cloudfunctions.net/jotformDamageWebhook?${params.toString()}`;
}

module.exports = {
  SETTINGS_DOC_ID,
  buildWebhookUrl,
  ensureSettings,
  extractJotformId,
  formatAnswerValue,
  loadSettings,
  parseJotformWebhookBody,
  pickSubmitter,
  buildTitle,
  saveDamageFormSubmission,
  validateWebhookToken,
};
