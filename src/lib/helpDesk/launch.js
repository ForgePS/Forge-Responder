// Remembers the last page someone was on before opening the Help Desk, so a new
// request can say where the problem happened.
import { HELP_DESK_PAGE } from "./constants.js";

let lastPage = "";

export function rememberPageForHelpDesk(pageName = "") {
  if (pageName && pageName !== HELP_DESK_PAGE) lastPage = String(pageName);
}

export function helpDeskContextPage() {
  return lastPage;
}

/** ?ticket=<id> on the Help Desk page (links in requester emails). */
export function ticketIdFromLocation(location = typeof window !== "undefined" ? window.location : null) {
  if (!location) return "";
  const params = new URLSearchParams(location.search || "");
  return String(params.get("ticket") || params.get("helpDeskTicket") || "").replace(/[^\w-]/g, "").slice(0, 80);
}
