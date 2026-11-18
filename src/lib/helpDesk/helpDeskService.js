// Help Desk data: reads come straight from Firestore (the rules decide who sees
// what); every write goes through the helpDesk* Cloud Functions.
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getBlob, ref, uploadBytes } from "firebase/storage";
import { getFirebaseFunctions, getFirebaseStorage, getFirestoreDb } from "../firebaseClient.js";
import { friendlyError, isHumanMessage } from "../friendlyError.js";
import { ATTACHMENT_LIMITS } from "./constants.js";
import { pageSlug } from "../pageUrl.js";

async function call(name, payload = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("The help desk isn't available right now.");
  const result = await httpsCallable(functions, name)(payload);
  return result.data || {};
}

/** Server messages for validation problems are written for people; show them. */
export function helpDeskError(error, fallback = "That didn't work. Please try again.") {
  const code = String(error?.code || "").replace(/^functions\//, "");
  if (["invalid-argument", "failed-precondition", "resource-exhausted", "permission-denied", "not-found"].includes(code)
    && isHumanMessage(error?.message)) {
    return error.message;
  }
  return friendlyError(error, fallback);
}

function newest(list, field = "updatedAt") {
  return [...list].sort((a, b) => String(b[field] || b.createdAt || "").localeCompare(String(a[field] || a.createdAt || "")));
}

function subscribe(q, onChange, onError, sortField = "updatedAt") {
  return onSnapshot(q, (snap) => {
    onChange(newest(snap.docs.map((d) => ({ id: d.id, ...d.data() })), sortField));
  }, (error) => onError?.(error));
}

/** mode: "mine" (requester), "department" (that department's queue) or "platform" (every department). */
export function subscribeTickets({ mode, uid, departmentId }, onChange, onError) {
  const db = getFirestoreDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  const tickets = collection(db, "helpDeskTickets");
  if (mode === "platform") return subscribe(query(tickets, orderBy("updatedAt", "desc"), limit(500)), onChange, onError);
  if (mode === "department") return subscribe(query(tickets, where("departmentId", "==", departmentId)), onChange, onError);
  return subscribe(query(tickets, where("requesterUid", "==", uid)), onChange, onError);
}

/** Thread oldest-first. Requesters may only ask for public messages. */
export function subscribeMessages(ticketId, { staff = false } = {}, onChange, onError) {
  const db = getFirestoreDb();
  if (!db || !ticketId) {
    onChange([]);
    return () => {};
  }
  const messages = collection(db, "helpDeskTickets", ticketId, "messages");
  const q = staff ? messages : query(messages, where("visibility", "==", "public"));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(list.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))));
  }, (error) => onError?.(error));
}

export function subscribeNotifications(ticketId, onChange, onError) {
  const db = getFirestoreDb();
  if (!db || !ticketId) {
    onChange([]);
    return () => {};
  }
  return subscribe(collection(db, "helpDeskTickets", ticketId, "notifications"), onChange, onError, "createdAt");
}

// ---- attachments ----

function contentTypeFor(file) {
  if (file.type) return file.type;
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".json")) return "application/json";
  return "text/plain";
}

export function validateFiles(files = []) {
  if (files.length > ATTACHMENT_LIMITS.count) return `Attach at most ${ATTACHMENT_LIMITS.count} files.`;
  const tooBig = files.find((file) => file.size >= ATTACHMENT_LIMITS.bytes);
  if (tooBig) return `${tooBig.name} is over 10 MB.`;
  const wrongType = files.find((file) => {
    const type = contentTypeFor(file);
    return !(type.startsWith("image/") || ["application/pdf", "text/plain", "text/csv", "application/json"].includes(type));
  });
  if (wrongType) return `${wrongType.name} can't be attached. Use images, PDFs or text files.`;
  return "";
}

/** folder: "helpDesk/{departmentId}/{uid}/" or "helpDeskReplies/{ticketId}/{public|internal}/{uid}/" (storage.rules). */
async function uploadFiles(files, folder) {
  if (!files?.length) return [];
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("File uploads aren't available right now.");
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return Promise.all(files.map(async (file, index) => {
    const safeName = String(file.name || `file-${index + 1}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `file-${index + 1}`;
    const path = `${folder}${uploadId}-${index}/${safeName}`;
    const contentType = contentTypeFor(file);
    await uploadBytes(ref(storage, path), file, { contentType, });
    return { path, name: file.name || safeName, size: file.size || 0, contentType };
  }));
}

/** Opens an attachment through the signed-in session (no shareable download link). */
export async function openAttachment(attachment) {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Files aren't available right now.");
  const blob = await getBlob(ref(storage, attachment.path));
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name || "attachment";
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- context ----

export function describeBrowser(userAgent = "") {
  const ua = String(userAgent);
  const pick = (pattern, name) => {
    const match = ua.match(pattern);
    return match ? `${name} ${match[1].split(".")[0]}` : "";
  };
  const browser = pick(/Edg\/([\d.]+)/, "Edge") || pick(/OPR\/([\d.]+)/, "Opera") || pick(/Firefox\/([\d.]+)/, "Firefox")
    || pick(/CriOS\/([\d.]+)/, "Chrome") || pick(/Chrome\/([\d.]+)/, "Chrome") || pick(/Version\/([\d.]+).*Safari/, "Safari") || "Unknown browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** What the help desk sees about where the request came from: the page the person was on (not the Help Desk itself). */
export function captureContext(pageName = "", { releaseVersion = "" } = {}) {
  if (typeof window === "undefined") return { page: pageName };
  const slug = pageName ? pageSlug(pageName) : "";
  const userAgent = window.navigator?.userAgent || "";
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timezone = "";
  }
  return {
    page: pageName,
    path: `${window.location.pathname}${slug ? `?page=${encodeURIComponent(slug)}` : ""}`,
    userAgent,
    browser: describeBrowser(userAgent),
    // The release shown in the footer (platform settings) plus the exact build.
    appVersion: [releaseVersion ? `v${releaseVersion}` : "", import.meta.env.VITE_APP_VERSION ? `build ${import.meta.env.VITE_APP_VERSION}` : ""].filter(Boolean).join(" · "),
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    timezone,
    theme: document.documentElement?.dataset?.theme || "",
  };
}

// ---- writes ----

export async function createTicket({ departmentId, uid, subject, category, priority, description, files = [], page, releaseVersion = "" }) {
  const attachments = await uploadFiles(files, `helpDesk/${departmentId}/${uid}/`);
  return call("helpDeskCreateTicket", {
    departmentId, subject, category, priority, description, attachments, context: captureContext(page, { releaseVersion }),
  });
}

export async function addMessage({ ticketId, uid, body, internal = false, status = "", files = [] }) {
  const attachments = await uploadFiles(files, `helpDeskReplies/${ticketId}/${internal ? "internal" : "public"}/${uid}/`);
  return call("helpDeskAddMessage", { ticketId, body, internal, status, attachments });
}

export const updateTicket = (ticketId, changes) => call("helpDeskUpdateTicket", { ticketId, ...changes });
export const listAssignees = (ticketId) => call("helpDeskListAssignees", { ticketId });
export const getHelpDeskSettings = (scope) => call("helpDeskGetSettings", { scope });
export const saveHelpDeskSettings = (scope, notifyEmails) => call("helpDeskSaveSettings", { scope, notifyEmails });
