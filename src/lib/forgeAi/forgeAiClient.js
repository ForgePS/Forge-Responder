/**
 * Forge AI client. Every call goes through a Cloud Function that verifies the
 * caller's department membership, permissions and the department's Forge AI
 * settings; the department id sent here only selects the department.
 */
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../firebaseClient.js";

async function call(name, payload, timeout = 60000) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Forge AI needs a connection to FORGE.");
  try {
    const result = await httpsCallable(functions, name, { timeout })(payload);
    return result.data || {};
  } catch (error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (/unavailable|network|offline/i.test(code) || /network|offline|failed to fetch/i.test(message)) {
      const offline = new Error("Forge AI can't be reached right now. The rest of FORGE keeps working; try again when you're connected.");
      offline.retryable = true;
      throw offline;
    }
    const friendly = new Error(message.replace(/^.*?: /, "") || "Forge AI had a problem. Try again.");
    friendly.code = code.replace(/^functions\//, "");
    friendly.retryable = !/permission-denied|unauthenticated|invalid-argument|failed-precondition|not-found/.test(code);
    throw friendly;
  }
}

export const loadForgeAiBootstrap = (departmentId) => call("forgeAiBootstrap", { departmentId }, 30000);
export const askForgeAi = (departmentId, { message, capability = "", conversationId = "", context = {} }) =>
  call("forgeAiAsk", { departmentId, message, capability: capability || undefined, conversationId: conversationId || undefined, context }, 180000);
export const listForgeAiConversations = (departmentId) => call("forgeAiListConversations", { departmentId });
export const getForgeAiConversation = (departmentId, conversationId) => call("forgeAiGetConversation", { departmentId, conversationId });
export const renameForgeAiConversation = (departmentId, conversationId, title) => call("forgeAiRenameConversation", { departmentId, conversationId, title });
export const archiveForgeAiConversation = (departmentId, conversationId) => call("forgeAiArchiveConversation", { departmentId, conversationId });
export const sendForgeAiFeedback = (departmentId, messageId, rating, comment = "") => call("forgeAiFeedback", { departmentId, messageId, rating, comment });
export const loadForgeAiSettings = (departmentId) => call("forgeAiGetSettings", { departmentId });
export const saveForgeAiSettings = (departmentId, settings) => call("forgeAiSaveSettings", { departmentId, settings });
export const loadForgeAiUsage = (departmentId) => call("forgeAiUsageReport", { departmentId });
