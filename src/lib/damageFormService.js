import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirestoreDb, getFirebaseFunctions } from "./firebaseClient.js";
import { createRecord, subscribeCollection } from "./firestoreService.js";

export const DAMAGE_FORM_SETTINGS_DOC = "damageFormJotform";

export function extractJotformId(formUrl = "") {
  const match = String(formUrl).match(/jotform\.com\/(?:form\/|jsform\/)?(\d+)/i);
  return match ? match[1] : "";
}

export function buildJotformEmbedUrl(formUrl = "") {
  const formId = extractJotformId(formUrl);
  if (!formId) return String(formUrl || "").trim();
  return `https://form.jotform.com/${formId}`;
}

export function resolveJotformPdfViewerUrl(record = {}) {
  const submissionId = String(record.submissionId || "").trim();
  if (!submissionId) return "";
  if (record.publicPdfUrl) return record.publicPdfUrl;
  return `https://www.jotform.com/pdf-submission/${submissionId}`;
}

export function buildJotformWebhookUrl(projectId, departmentId, token) {
  if (!projectId || !departmentId || !token) return "";
  const params = new URLSearchParams({ departmentId, token });
  return `https://us-central1-${projectId}.cloudfunctions.net/jotformDamageWebhook?${params.toString()}`;
}

export function formatDamageFormDate(value = "") {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateText(value = "", maxLength = 72) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function buildDamageFormListLabel(record = {}) {
  const answers = Array.isArray(record.answers) ? record.answers : [];
  const location = answers.find((item) => /property\/equipment location|damaged property|station|unit number|^location$/i.test(item.label))?.value
    || record.location
    || "";
  const description = answers.find((item) => /what is damaged|description of the damage|damage description/i.test(item.label))?.value
    || record.summary
    || "";

  if (location && description && location !== description) {
    return `${location} — ${truncateText(description, 56)}`;
  }
  if (location) return location;
  if (description) return truncateText(description, 72);
  return record.title || record.formTitle || "Damage form";
}

export function sortDamageForms(records = []) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.submittedAt || left.receivedAt || 0).getTime();
    const rightTime = new Date(right.submittedAt || right.receivedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export function subscribeDamageForms(departmentId, onData, onError) {
  return subscribeCollection(
    departmentId,
    "damageForms",
    (records) => onData(sortDamageForms(records)),
    onError
  );
}

export async function loadDamageFormSettings(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  const ref = doc(db, "departments", departmentId, "settings", DAMAGE_FORM_SETTINGS_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  // Older departments may still have the key and webhook token here until an admin
  // opens the setup screen (the server then moves them); never pass them on.
  const { apiKey, webhookToken: _webhookToken, ...rest } = snap.data();
  return { ...rest, apiKeyConfigured: Boolean(apiKey) };
}

async function callJotformSetup(departmentId, data) {
  const functions = getFirebaseFunctions();
  if (!functions || !departmentId) throw new Error("Damage form setup is unavailable.");
  const callable = httpsCallable(functions, "saveJotformDamageSetup");
  const result = await callable({ departmentId, ...data });
  return result.data || null;
}

/** Admins: load the setup (including the webhook link). The key stays on the server. */
export async function ensureDamageFormSettings(departmentId) {
  return callJotformSetup(departmentId, { readOnly: true });
}

/** Admins: save the form link/title; a non-blank apiKey replaces the stored one. */
export async function saveDamageFormSettings(departmentId, settings = {}) {
  return callJotformSetup(departmentId, {
    formUrl: String(settings.formUrl || "").trim(),
    formTitle: String(settings.formTitle || "").trim(),
    apiKey: String(settings.apiKey || "").trim(),
    removeApiKey: Boolean(settings.removeApiKey),
  });
}

export async function fetchJotformDamagePdf(departmentId, { recordId = "", submissionId = "", formId = "" } = {}) {
  const functions = getFirebaseFunctions();
  if (!functions || !departmentId || !recordId) {
    throw new Error("PDF download is unavailable.");
  }
  const callable = httpsCallable(functions, "getJotformDamagePdf");
  const result = await callable({ departmentId, recordId, submissionId, formId });
  return result.data || {};
}

export async function syncJotformDamageSubmissions(departmentId, limit = 25) {
  const functions = getFirebaseFunctions();
  if (!functions || !departmentId) {
    throw new Error("Sync is unavailable.");
  }
  const callable = httpsCallable(functions, "syncJotformDamageSubmissions");
  const result = await callable({ departmentId, limit });
  return result.data || {};
}

export async function createPortalDamageFormRecord(departmentId, form = {}, workOrder = {}, submittedBy = "") {
  if (!departmentId || !workOrder?.id) return null;

  const title = `Damage report — ${form.location || workOrder.location || "Unspecified"}`;
  const summary = String(form.damageDescription || workOrder.damageDescription || "").trim();
  const submittedAt = workOrder.submittedAt || new Date().toISOString();

  return createRecord(departmentId, "damageForms", `portal-${workOrder.id}`, {
    source: "employee-portal",
    title,
    summary,
    submittedAt,
    submitterName: submittedBy || workOrder.reportedBy || "",
    location: form.location || workOrder.location || "",
    equipment: form.equipment || workOrder.equipment || "",
    damageDescription: summary,
    workOrderId: workOrder.id,
    answers: [
      { label: "Date", value: form.date || workOrder.reportDate || "" },
      { label: "Location", value: form.location || workOrder.location || "" },
      { label: "Equipment", value: form.equipment || workOrder.equipment || "" },
      { label: "Damage description", value: summary },
      { label: "Submitted by", value: submittedBy || workOrder.reportedBy || "" },
    ].filter((item) => item.value),
  });
}
