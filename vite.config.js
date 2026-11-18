import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fieldServiceWorker from "./vite-plugins/fieldServiceWorker.js";

// "0.1.0+abc1234" (package version + commit), sent with help desk requests.
function appVersion() {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return sha ? `${version}+${sha}` : version;
  } catch {
    return version; // no git (e.g. the USB demo copy)
  }
}

export default defineConfig({
  plugins: [react(), fieldServiceWorker()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()),
  },
});
