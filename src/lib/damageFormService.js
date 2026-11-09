import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";
import { createRecord, subscribeCollection } from "./firestoreService.js";

/** Where a damage form came from, in plain words. Older JotForm records keep their label. */
export function damageFormSourceLabel(record = {}) {
  if (record.source === "field-app") return "FORGE FIELD";
  if (record.source === "jotform") return "JotForm (older record)";
  return "Employee portal";
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

/** A printable PDF of a damage form, built on the server from the saved record. */
export async function fetchDamageFormPdf(departmentId, recordId = "") {
  const functions = getFirebaseFunctions();
  if (!functions || !departmentId || !recordId) {
    throw new Error("PDF download is unavailable.");
  }
  const callable = httpsCallable(functions, "getDamageFormPdf");
  const result = await callable({ departmentId, recordId });
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
    photos: (Array.isArray(form.photos) ? form.photos : workOrder.photos || [])
      .filter((photo) => photo && photo.url)
      .map((photo) => ({ url: photo.url, name: photo.name || "" })),
    answers: [
      { label: "Date", value: form.date || workOrder.reportDate || "" },
      { label: "Location", value: form.location || workOrder.location || "" },
      { label: "Equipment", value: form.equipment || workOrder.equipment || "" },
      { label: "Damage description", value: summary },
      { label: "Submitted by", value: submittedBy || workOrder.reportedBy || "" },
    ].filter((item) => item.value),
  });
}
