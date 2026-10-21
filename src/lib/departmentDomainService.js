/** Department subdomains (<department>.forgeresponder.com). Creator-only callables. */
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function call(name, data) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name)(data);
  return result.data || {};
}

/** Registers <subdomain>.forgeresponder.com for the department on Firebase Hosting. */
export function registerDepartmentDomain(departmentId, subdomain = departmentId) {
  return call("registerDepartmentDomain", { departmentId, subdomain });
}

export function departmentDomainStatus(subdomain) {
  return call("departmentDomainStatus", { subdomain });
}

/** One-line, human description of a domain status result. */
export function describeDomainStatus(status = {}) {
  if (status.live && status.certState === "CERT_ACTIVE") return `${status.domain} is live.`;
  if (status.live) return `${status.domain} is connected; its security certificate is being issued (usually under an hour).`;
  if (status.requiredDnsUpdates) return `${status.domain} is registered and waiting for DNS records.`;
  return `${status.domain} is registered; Firebase is still setting it up.`;
}
