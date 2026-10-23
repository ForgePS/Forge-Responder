/**
 * Builds the website for the Firebase project being deployed to. Runs as the
 * hosting predeploy step (firebase.json), where the Firebase CLI sets
 * GCLOUD_PROJECT, so a hosting deploy can never ship the staging build to
 * production or the production build to staging.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const STAGING_PROJECT = "forge-rms-staging";
const PRODUCTION_PROJECT = "rms-dashboard-7562e";

const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
const mode = project === STAGING_PROJECT ? "staging" : project === PRODUCTION_PROJECT ? "production" : "";

if (!mode) {
  console.error(`build-for-project: unknown project "${project}". Expected ${PRODUCTION_PROJECT} or ${STAGING_PROJECT}.`);
  process.exit(1);
}

// The CLI's file-hash cache for dist (.firebase/hosting.*.cache) goes stale when
// production and staging builds take turns in dist; clear it so uploads match.
try {
  for (const name of readdirSync(".firebase")) {
    if (/^hosting\..*\.cache$/.test(name)) rmSync(`.firebase/${name}`);
  }
} catch { /* no cache yet */ }

console.log(`Building the website for ${project} (vite --mode ${mode})`);
const result = spawnSync("npx", ["vite", "build", "--mode", mode], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
