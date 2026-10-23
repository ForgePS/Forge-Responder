/**
 * Department invites (client side). Memberships are created only by the
 * acceptDepartmentInvite Cloud Function; see functions/lib/invites.js.
 */
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebaseFunctions, getFirestoreDb } from "./firebaseClient.js";
import { resolveRmsAppUrl } from "./rmsAppUrl.js";

const PENDING_INVITE_KEY = "forge-pending-invite";

async function call(name, data = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name)(data);
  return result.data || {};
}

/** Friendly text for callable errors ("functions/permission-denied" etc.). */
export function inviteErrorMessage(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  if (["internal", "unavailable", "unknown"].includes(code) || /^internal$/i.test(String(error?.message || ""))) {
    return "We couldn't reach the invite service right now. Please try again in a moment.";
  }
  return String(error?.message || "Something went wrong with this invite.").replace(/^FirebaseError:\s*/, "");
}

/**
 * Move ?invite=TOKEN from the URL into sessionStorage and strip it from the
 * address bar, so it survives sign-up but doesn't linger in history/referrers.
 */
export function captureInviteTokenFromUrl() {
  if (typeof window === "undefined") return readPendingInviteToken();
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("invite");
    if (token) {
      window.sessionStorage.setItem(PENDING_INVITE_KEY, token);
      url.searchParams.delete("invite");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // ignore
  }
  return readPendingInviteToken();
}

export function readPendingInviteToken() {
  try {
    return window.sessionStorage.getItem(PENDING_INVITE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingInviteToken() {
  try {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
}

export function previewInvite(token) {
  return call("previewDepartmentInvite", { token });
}

export function acceptInvite(token) {
  return call("acceptDepartmentInvite", { token });
}

export function createInvite({ departmentId, email, roleIds, displayName = "", personnelId = "", sendEmail = true }) {
  return call("createDepartmentInvite", {
    departmentId,
    email,
    roleIds,
    displayName,
    personnelId,
    sendEmail,
    appOrigin: resolveRmsAppUrl(),
  });
}

export function revokeInvite(inviteId) {
  return call("revokeDepartmentInvite", { inviteId });
}

/** Pending invites for a department (rules allow department admins only). */
export async function listPendingInvites(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return [];
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("departmentId", "==", departmentId),
    where("status", "==", "pending")
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/** Invite errors that mean the token will never work — stop retrying it. */
export function isTerminalInviteError(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  return ["not-found", "failed-precondition", "deadline-exceeded", "invalid-argument"].includes(code);
}
