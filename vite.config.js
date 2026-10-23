import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fieldServiceWorker from "./vite-plugins/fieldServiceWorker.js";

export default defineConfig({
  plugins: [react(), fieldServiceWorker()],
});
