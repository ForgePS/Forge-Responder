/**
 * Open Forge AI from another page with a question ready to send.
 * The request is kept until the Forge AI page picks it up, so it survives the
 * lazy page load. Nothing is sent until the page sends it.
 */
export const FORGE_AI_PAGE = "Forge AI";
export const FORGE_AI_OPEN_EVENT = "forge-ai:open";

let pending = null;

/** @param {{capability?:string, prompt?:string, context?:{reportId?:string}, autoSend?:boolean, view?:"assistant"|"admin"}} request */
export function openForgeAi(request = {}) {
  pending = {
    capability: String(request.capability || ""),
    prompt: String(request.prompt || "").slice(0, 2000),
    context: request.context?.reportId ? { reportId: String(request.context.reportId) } : {},
    autoSend: request.autoSend !== false,
    view: request.view === "admin" ? "admin" : "assistant",
    at: Date.now(),
  };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FORGE_AI_OPEN_EVENT, { detail: pending }));
}

let pendingRecord = null;

/** A Forge AI source was clicked: remember which record the next page should open. */
export function rememberRecordToOpen(page, recordId) {
  pendingRecord = page && recordId ? { page: String(page), recordId: String(recordId), at: Date.now() } : null;
}

/** The record a page should open on arrival, if Forge AI sent the member there (read-only peek). */
export function recordToOpen(page) {
  if (!pendingRecord || pendingRecord.page !== page || Date.now() - pendingRecord.at > 60_000) return "";
  return pendingRecord.recordId;
}

/** Forget the record once the page has opened it. */
export function clearRecordToOpen(page) {
  if (pendingRecord?.page === page) pendingRecord = null;
}

/** The Forge AI page takes the pending request (once). Requests older than a minute are dropped. */
export function takePendingForgeAiRequest() {
  const request = pending;
  pending = null;
  if (!request || Date.now() - request.at > 60_000) return null;
  return request;
}
