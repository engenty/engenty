import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Single source of truth for service ports (apps/ports.config.mjs). Manage binds
// `ports.manage` (5174), proxies /api,/gateway to wherever core resolves, and
// /ai to the AI service.
import { ports } from "../ports.config.mjs";

const appRoot = path.resolve(import.meta.dirname, ".");
const repoRoot = path.resolve(import.meta.dirname, "../..");

const appVersion: string = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const appShell = path.join(repoRoot, "packages", "app-shell", "src");
const authUi = path.join(repoRoot, "packages", "auth-ui", "src");
const uiIcons = path.join(repoRoot, "packages", "ui-icons", "src");
const apiClient = path.join(repoRoot, "packages", "api-client");
const environment = path.join(repoRoot, "packages", "environment", "src");
const uiCoreSrc = path.join(repoRoot, "packages", "ui-core", "src");
const i18nUi = path.join(repoRoot, "packages", "i18n", "src", "ui.tsx");

interface ViteAlias {
  find: string | RegExp;
  replacement: string;
}

function buildResolveAlias(isDev: boolean): ViteAlias[] {
  const shared: Record<string, string> = {
    "@": path.join(appRoot, "src"),
    "@engenty/api-client": path.join(apiClient, "src", "index.ts"),
    "@engenty/environment": path.join(environment, "index.ts"),
  };

  // Dev: map workspace UI packages manage consumes to source for HMR.
  const devWorkspace: Record<string, string> = isDev
    ? {
        "@engenty/auth-ui/plugin": path.join(authUi, "plugin.tsx"),
        "@engenty/auth-ui": path.join(authUi, "index.ts"),
        "@engenty/ui-icons": path.join(uiIcons, "index.ts"),
        "@engenty/i18n/ui": i18nUi,
        "@engenty/app-shell/navigation": path.join(appShell, "navigation.ts"),
        "@engenty/app-shell": path.join(appShell, "index.ts"),
      }
    : {};

  // Dev: load ui-core from source for HMR. Regex entries must precede others.
  const uiCoreDev: ViteAlias[] = isDev
    ? [
        {
          find: /^@engenty\/ui-core$/,
          replacement: path.join(uiCoreSrc, "index.ts"),
        },
        {
          find: /^@engenty\/ui-core\/(.+)$/,
          replacement: `${uiCoreSrc}/$1`,
        },
      ]
    : [];

  return [
    ...uiCoreDev,
    ...Object.entries(shared).map(([find, replacement]) => ({
      find,
      replacement,
    })),
    ...Object.entries(devWorkspace).map(([find, replacement]) => ({
      find,
      replacement,
    })),
  ];
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === "serve";

  return {
    // Served behind the gateway at /manage (prefix NOT stripped by the proxy),
    // so both dev and build must root the app at /manage/.
    base: "/manage/",
    envDir: repoRoot,
    envPrefix: ["VITE_", "ENV"],
    plugins: [react(), tailwindcss()],
    define: {
      "process.env": {},
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    resolve: {
      alias: buildResolveAlias(isDev),
      dedupe: ["@base-ui/react", "react", "react-dom"],
    },
    optimizeDeps: {
      exclude: ["@engenty/app-shell", "@engenty/auth-ui", "@engenty/ui-icons"],
    },
    server: {
      host: true,
      port: ports.manage,
      strictPort: true,
      allowedHosts: [".localhost"],
      hmr: { overlay: true },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${ports.core}`,
          changeOrigin: true,
          ws: true,
        },
        "/gateway": {
          target: `http://127.0.0.1:${ports.core}`,
          changeOrigin: true,
        },
        // Superadmin AI-plane surfaces (gateway model catalog, usage policy)
        // live on the AI service. In prod the gateway routes /ai/* there for
        // us; in dev nothing did, so those calls 404'd.
        "/ai": {
          target: `http://127.0.0.1:${ports.ai}`,
          changeOrigin: true,
        },
      },
    },
  };
});
