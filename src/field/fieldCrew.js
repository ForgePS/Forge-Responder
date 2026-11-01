/**
 * Hydrant crew session (like the desktop hydrant app): who is testing, which
 * shift, date and district. Set once, used by every inspection and flow test
 * for 8 hours. Kept in IndexedDB per department.
 */
import { kvGet, kvSet } from "./fieldDb.js";

export const CREW_SESSION_HOURS = 8;

function key(departmentId) {
  return `crew:${departmentId}`;
}

export async function loadCrewSession(departmentId) {
  const session = await kvGet(key(departmentId)).catch(() => null);
  return session && isCrewSessionActive(session) ? session : null;
}

export async function saveCrewSession(departmentId, session) {
  const next = {
    testedBy: session.testedBy || "",
    shift: session.shift || "",
    date: session.date || "",
    district: session.district || "",
    expiresAt: new Date(Date.now() + CREW_SESSION_HOURS * 3_600_000).toISOString(),
  };
  await kvSet(key(departmentId), next);
  return next;
}

export async function clearCrewSession(departmentId) {
  await kvSet(key(departmentId), null);
}

export function isCrewSessionActive(session, now = Date.now()) {
  return Boolean(session?.testedBy && session?.shift && session?.expiresAt && new Date(session.expiresAt).getTime() > now);
}
