/**
 * Register forgeresponder.com hosts on Firebase Hosting and show the DNS
 * records Firebase needs.
 *
 * DRY RUN by default (read-only: shows current status). --apply registers any
 * missing domains and points each department's gateway at its subdomain.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/register-domains.mjs *> domains.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/register-domains.mjs --apply *> domains.txt
 *
 * Hosts: app.<root> (platform: tenant picker + creator console) and
 * <department>.<root> for every active department in platformDepartments.
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { GoogleAuth } = require("google-auth-library");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const SITE_ID = process.env.HOSTING_SITE_ID || PROJECT_ID;
const ROOT = String(process.env.TENANT_ROOT_DOMAIN || "forgeresponder.com").toLowerCase();
const APPLY = process.argv.includes("--apply");
const API = "https://firebasehosting.googleapis.com/v1beta1";
const VALID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

async function api(path, { method = "GET", body } = {}) {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": PROJECT_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

const domainPath = (domain) => `projects/${PROJECT_ID}/sites/${SITE_ID}/customDomains/${domain}`;

function printDns(updates) {
  if (!updates) return;
  const desired = updates.desired || [];
  for (const set of desired) {
    for (const rec of set.records || []) {
      const action = rec.requiredAction && rec.requiredAction !== "NONE" ? ` <- ${rec.requiredAction}` : "";
      console.log(`       DNS ${rec.type.padEnd(5)} ${set.domainName.padEnd(36)} ${rec.rdata}${action}`);
    }
  }
}

async function handle(domain, onApplied) {
  let { status, json } = await api(domainPath(domain));
  if (status === 404) {
    if (!APPLY) {
      console.log(`  -  ${domain}: not registered (will register with --apply)`);
      return;
    }
    const created = await api(`projects/${PROJECT_ID}/sites/${SITE_ID}/customDomains?customDomainId=${encodeURIComponent(domain)}`, { method: "POST", body: {} });
    if (created.status >= 400 && created.status !== 409) {
      console.log(`  !  ${domain}: register FAILED ${created.status} ${created.json.error?.message || ""}`);
      return;
    }
    ({ status, json } = await api(domainPath(domain)));
    console.log(`  +  ${domain}: registered`);
  } else if (status >= 400) {
    console.log(`  !  ${domain}: API error ${status} ${json.error?.message || ""}`);
    return;
  }
  console.log(`     ${domain}: host=${json.hostState} ownership=${json.ownershipState} cert=${json.cert?.state || "-"}`);
  printDns(json.requiredDnsUpdates);
  if (APPLY && onApplied) await onApplied();
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}, site ${SITE_ID}, root ${ROOT}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  console.log("== Platform host ==");
  await handle(`app.${ROOT}`);

  console.log("\n== Department subdomains ==");
  const registry = await db.collection("platformDepartments").get();
  for (const doc of registry.docs) {
    const data = doc.data() || {};
    if (["disabled", "archived"].includes(data.status)) continue;
    const sub = String(data.subdomain || doc.id).toLowerCase();
    if (!VALID.test(sub)) {
      console.log(`  ?  ${doc.id}: "${sub}" isn't a valid subdomain — set platformDepartments/${doc.id}.subdomain`);
      continue;
    }
    const domain = `${sub}.${ROOT}`;
    await handle(domain, async () => {
      const now = new Date().toISOString();
      await db.doc(`rmsGateways/${sub}`).set({
        gatewayId: sub, departmentId: doc.id, departmentName: data.name || doc.id,
        departmentShortName: data.shortName || data.name || doc.id, status: "active", domain, updatedAt: now,
      }, { merge: true });
      await db.doc(`platformDepartments/${doc.id}`).set({ domain, subdomain: sub, updatedAt: now }, { merge: true });
    });
  }
  console.log("\nAdd any DNS records marked ADD at your DNS provider (GoDaddy). Re-run to check progress.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
