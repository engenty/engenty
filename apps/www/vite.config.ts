import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { ports } from "../ports.config.mjs";

const appRoot = path.resolve(import.meta.dirname, ".");
const repoRoot = path.resolve(import.meta.dirname, "../..");
const uiCoreSrc = path.join(repoRoot, "packages", "ui-core", "src");

export default defineConfig({
  base: "/",
  envDir: repoRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: path.join(appRoot, "src") },
      {
        find: /^@engenty\/ui-core\/components\/engenty$/,
        replacement: path.join(uiCoreSrc, "components/engenty/index.ts"),
      },
      {
        find: /^@engenty\/ui-core\/(.+)$/,
        replacement: `${uiCoreSrc}/$1`,
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["@engenty/ui-core"],
  },
  server: {
    host: true,
    port: ports.www,
    strictPort: true,
    allowedHosts: [".localhost"],
  },
});
