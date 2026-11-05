/**
 * Pack the offline demo into one zip for another Windows computer: the app,
 * its packages, the saved demo data, the Firebase emulator files and portable
 * copies of Node and Java. The other computer needs nothing installed and no
 * internet: unzip, then double-click "Start FORGE Demo.cmd".
 *
 *   npm run demo:usb -- D:\          writes D:\FORGE-Demo.zip (and a how-to next to it)
 *
 * Run it from this laptop after the offline demo has run here at least once
 * (that downloads the emulator files and builds the app). Stop the demo first
 * so its data is saved.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NAME = "FORGE-Demo";
const log = (...parts) => console.log("[usb]", ...parts);

function fail(message) {
  console.error("[usb]", message);
  process.exit(1);
}

async function isUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function javaHome() {
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, "bin", "java.exe"))) return process.env.JAVA_HOME;
  try {
    const java = execFileSync("where", ["java"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
    return dirname(dirname(realpathSync(java)));
  } catch {
    return "";
  }
}

const LAUNCHER = `@echo off
title FORGE Responder offline demo
setlocal
set "HERE=%~dp0"
set "PATH=%HERE%runtime\\node;%HERE%runtime\\java\\bin;%PATH%"
set "JAVA_HOME=%HERE%runtime\\java"
set "FIREBASE_EMULATORS_PATH=%HERE%runtime\\emulators"
cd /d "%HERE%app"
node scripts\\offline-demo\\start.mjs %*
echo.
pause
`;

const README = `FORGE Responder offline demo (Windows)
=======================================

Runs the whole platform with no internet: the RMS, FORGE FIELD and the
Creator Console. Nothing needs to be installed.

Set up (once per computer)
  1. Copy FORGE-Demo.zip from the drive to the computer (for example the Desktop).
     Running it straight from the drive works but is much slower.
  2. Right-click the zip > Extract All.
  3. Open the extracted FORGE-Demo folder and double-click "Start FORGE Demo.cmd".
     If Windows shows "Windows protected your PC", click More info > Run anyway.
     If the firewall asks about Java or Node, click Allow (private networks).

Using it
  - The browser opens at http://localhost:4173/demo. Click Launch Demo RMS.
  - FORGE FIELD:     http://localhost:4173/field (after launching the demo)
  - Creator Console: http://localhost:4173/creator-console
    Login: app\\.offline-demo\\creator-login.txt
  - Stop: press Ctrl+C in the black window (changes are saved for next time).

Start over with fresh sample data: delete app\\.offline-demo\\emulator-data,
then start again.

Needs internet (everything else works offline): satellite map imagery, AI
narrative writing, sending real texts/emails, and the Inter web font.
`;

async function main() {
  const dest = process.argv[2];
  if (!dest) fail("Say where to put it, for example: npm run demo:usb -- D:\\");
  if (process.platform !== "win32") fail("This packs a Windows bundle; run it on Windows.");
  if (!existsSync(dest)) fail(`${dest} does not exist (is the drive plugged in?)`);
  if (await isUp("http://127.0.0.1:4400/emulators")) fail("Stop the offline demo first (Ctrl+C in its window) so its data is saved.");
  if (!existsSync(join(ROOT, "dist-offline", "index.html"))) fail("Run npm run demo:offline once first (it builds the app).");

  const emulatorInfo = JSON.parse(readFileSync(join(ROOT, "node_modules", "firebase-tools", "lib", "emulator", "downloadableEmulatorInfo.json"), "utf8"));
  const cacheDir = process.env.FIREBASE_EMULATORS_PATH || join(homedir(), ".cache", "firebase", "emulators");
  const emulatorFiles = ["firestore", "storage"].map((key) => emulatorInfo[key].downloadPathRelativeToCacheDir);
  for (const file of emulatorFiles) {
    if (!existsSync(join(cacheDir, file))) fail(`Missing ${file}: run npm run demo:offline once with internet first.`);
  }
  const java = javaHome();
  if (!java) fail("Java was not found (set JAVA_HOME).");
  const nodeDir = dirname(realpathSync(process.execPath));

  const stage = join(tmpdir(), "forge-demo-usb");
  const out = join(stage, NAME);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  log("Copying the app...");
  const app = join(out, "app");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of tracked) {
    const from = join(ROOT, file);
    if (!existsSync(from) || statSync(from).isDirectory()) continue; // skips submodules
    mkdirSync(dirname(join(app, file)), { recursive: true });
    copyFileSync(from, join(app, file));
  }
  for (const dir of ["dist-offline", ".offline-demo"]) {
    if (existsSync(join(ROOT, dir))) cpSync(join(ROOT, dir), join(app, dir), { recursive: true });
  }
  log("Copying packages (a few minutes)...");
  cpSync(join(ROOT, "node_modules"), join(app, "node_modules"), { recursive: true });
  cpSync(join(ROOT, "functions", "node_modules"), join(app, "functions", "node_modules"), { recursive: true });

  log("Copying Node, Java and the emulator files...");
  const runtime = join(out, "runtime");
  mkdirSync(join(runtime, "node", "node_modules"), { recursive: true });
  for (const file of ["node.exe", "npm.cmd", "npx.cmd", "npm", "npx", "LICENSE"]) {
    if (existsSync(join(nodeDir, file))) copyFileSync(join(nodeDir, file), join(runtime, "node", file));
  }
  cpSync(join(nodeDir, "node_modules", "npm"), join(runtime, "node", "node_modules", "npm"), { recursive: true });
  cpSync(java, join(runtime, "java"), { recursive: true });
  mkdirSync(join(runtime, "emulators"), { recursive: true });
  for (const file of emulatorFiles) copyFileSync(join(cacheDir, file), join(runtime, "emulators", file));

  writeFileSync(join(out, "Start FORGE Demo.cmd"), LAUNCHER.replace(/\n/g, "\r\n"));
  writeFileSync(join(out, "README.txt"), README.replace(/\n/g, "\r\n"));

  const zip = join(resolve(dest), `${NAME}.zip`);
  log(`Zipping to ${zip} (a few minutes)...`);
  rmSync(zip, { force: true });
  // Windows' own tar writes zip files (Git's tar does not).
  execFileSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", zip, "-C", stage, NAME], { stdio: "inherit" });
  writeFileSync(join(resolve(dest), `${NAME} - READ ME.txt`), README.replace(/\n/g, "\r\n"));
  rmSync(stage, { recursive: true, force: true });

  log(`Done: ${zip} (${Math.round(statSync(zip).size / 1048576)} MB)`);
}

main().catch((error) => fail(error.message || String(error)));
