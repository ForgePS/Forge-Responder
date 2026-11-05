/**
 * The whole FORGE Responder platform on this computer, no internet needed:
 * the RMS, FORGE FIELD and the Creator Console run against local Firebase
 * emulators (sign-in, database, file storage and server functions).
 *
 *   npm run demo:offline              start (builds the app the first time)
 *   npm run demo:offline -- --rebuild rebuild the app first (after code changes)
 *   npm run demo:offline -- --reset   start over with fresh sample data
 *
 * Changes made during a demo are kept for next time (saved when you stop with Ctrl+C).
 * Needs Java (for the emulators) and this repo's node_modules, both already installed.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFLINE_PROJECT_ID, seedOfflineDemo } from "./seed.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const STATE_DIR = join(ROOT, ".offline-demo");
const DATA_DIR = join(STATE_DIR, "emulator-data");
const DIST = "dist-offline";
const PORT = 4173;
const URL_BASE = `http://localhost:${PORT}`;
const args = new Set(process.argv.slice(2));

const log = (...parts) => console.log("[offline demo]", ...parts);
const children = [];

function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { cwd: ROOT, stdio: "inherit", shell: true, ...options });
  children.push(child);
  return child;
}

function runToEnd(command, commandArgs, options) {
  return new Promise((resolve, reject) => {
    run(command, commandArgs, options).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${commandArgs.join(" ")} exited with ${code}`))));
  });
}

async function waitFor(check, label, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await check()) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function isUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await isUp("http://127.0.0.1:4400/emulators")) {
    log("The offline demo is already running (or another emulator is). Close that window first, or open:");
    log(`  ${URL_BASE}/demo`);
    process.exit(1);
  }
  if (args.has("--reset") && existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    log("Cleared saved demo data: starting fresh.");
  }

  if (args.has("--rebuild") || !existsSync(join(ROOT, DIST, "index.html"))) {
    log("Building the app for offline use (one time, about a minute)...");
    await runToEnd("npx", ["vite", "build", "--mode", "emulator", "--outDir", DIST, "--emptyOutDir"]);
  }

  // Quiet the CLI's online checks so nothing waits on the network.
  const quiet = { ...process.env, NO_UPDATE_NOTIFIER: "1", FIREBASE_CLI_EXPERIMENTS: process.env.FIREBASE_CLI_EXPERIMENTS || "" };
  const imported = existsSync(join(DATA_DIR, "firebase-export-metadata.json"));
  log(imported ? "Starting local Firebase with your saved demo data..." : "Starting local Firebase...");
  const emulators = run("npx", [
    "firebase", "emulators:start",
    "--only", "auth,firestore,storage,functions",
    "--project", OFFLINE_PROJECT_ID,
    ...(imported ? ["--import", `"${DATA_DIR}"`] : []),
    "--export-on-exit", `"${DATA_DIR}"`,
  ], { env: quiet });
  emulators.on("exit", (code) => {
    log(`Local Firebase stopped${code ? ` (code ${code})` : ""}.`);
    shutdown();
  });

  await waitFor(async () => {
    const response = await fetch("http://127.0.0.1:4400/emulators");
    const running = await response.json();
    return ["auth", "firestore", "storage", "functions"].every((name) => running[name]);
  }, "the emulators");

  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  const { loginFile } = await seedOfflineDemo({ root: ROOT, dataDir: STATE_DIR });

  run("npx", ["vite", "preview", "--mode", "emulator", "--outDir", DIST, "--port", String(PORT), "--strictPort"]);
  await waitFor(async () => (await fetch(URL_BASE)).ok, "the app");

  log("");
  log("Ready. No internet needed.");
  log(`  RMS demo:        ${URL_BASE}/demo`);
  log(`  FORGE FIELD:     ${URL_BASE}/field  (after launching the demo)`);
  log(`  Creator Console: ${URL_BASE}/creator-console  (login saved in ${loginFile})`);
  log("Press Ctrl+C to stop. Changes are saved for next time.");
  // Also save every few minutes, in case the window is closed instead of Ctrl+C.
  setInterval(() => {
    const save = spawn("npx", ["firebase", "emulators:export", `"${DATA_DIR}"`, "--project", OFFLINE_PROJECT_ID, "--force"], { cwd: ROOT, stdio: "ignore", shell: true, env: quiet });
    save.on("exit", (code) => { if (code) log("Autosave failed; data is still saved when you press Ctrl+C."); });
  }, 5 * 60 * 1000).unref();
  if (!args.has("--no-open")) spawn("cmd", ["/c", "start", "", `${URL_BASE}/demo`], { stdio: "ignore", detached: true }).unref();
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  // Ctrl+C reaches every process in this window; give the emulators time to save the data.
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", () => {
  log("Stopping and saving demo data...");
});

main().catch((error) => {
  console.error("[offline demo]", error.message || error);
  children.forEach((child) => child.kill());
  process.exit(1);
});
