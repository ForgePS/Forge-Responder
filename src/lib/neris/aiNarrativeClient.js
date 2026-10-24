import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../firebaseClient.js";

/**
 * Ask the server to draft a narrative (Claude). The server keeps only an
 * allowlist of report facts and strips names, phone numbers and emails.
 * @returns {Promise<{ narrative: string, missing: string[], model: string }>}
 */
export async function requestAiNarrative({ departmentId, report, notes = "", style = "standard", existingNarrative = "" }) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("AI drafting needs a connection to FORGE.");
  const call = httpsCallable(functions, "draftNerisNarrative", { timeout: 120000 });
  try {
    const result = await call({ departmentId, report, notes, style, existingNarrative });
    return result.data;
  } catch (error) {
    const message = String(error?.message || "");
    if (/offline|network|unavailable/i.test(error?.code || message)) {
      throw new Error("You're offline. Write the narrative by hand or try again when you're connected.");
    }
    throw new Error(message.replace(/^.*?: /, "") || "Couldn't draft the narrative. Try again.");
  }
}
