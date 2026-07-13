import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./src/manifest.js";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      // crxjs picks up the service worker from the manifest; the side panel
      // page is declared here so it is emitted as its own html entry.
      input: {
        sidepanel: "src/sidepanel/index.html",
      },
    },
  },
});
