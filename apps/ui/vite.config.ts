import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Single source of truth for service ports (apps/ports.config.mjs). The UI binds
// `ports.ui` and proxies /api,/ai,/docs to wherever core/ai/docs resolve.
import { ports } from "../ports.config.mjs";

const appRoot = path.resolve(import.meta.dirname, ".");
const repoRoot = path.resolve(import.meta.dirname, "../..");

// App version surfaced in the shell (About dialog + app switcher). Sourced from
// the root package.json — the single release version bumped by `pnpm release`.
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
const aiUi = path.join(repoRoot, "packages", "ai-ui", "src");
const authUi = path.join(repoRoot, "packages", "auth-ui", "src");
const auditLogsUi = path.join(repoRoot, "packages", "audit-logs", "src");
const contextGraphUi = path.join(repoRoot, "packages", "context-graph", "ui");
const userManagementUi = path.join(
  repoRoot,
  "packages",
  "user-management-ui",
  "src"
);
const environment = path.join(repoRoot, "packages", "environment", "src");
const uiIcons = path.join(repoRoot, "packages", "ui-icons", "src");
const apiClient = path.join(repoRoot, "packages", "api-client");
const pdfTemplates = path.join(repoRoot, "packages", "pdf-templates", "src");
const engentyCopilotAi = path.join(
  repoRoot,
  "modules",
  "engenty-copilot",
  "ai"
);
const engentyCopilotUi = path.join(
  repoRoot,
  "modules",
  "engenty-copilot",
  "ui"
);
const projectsUi = path.join(repoRoot, "modules", "projects", "ui");
const generativeUi = path.join(repoRoot, "packages", "generative-ui", "src");
const uiCoreSrc = path.join(repoRoot, "packages", "ui-core", "src");
const i18nUi = path.join(repoRoot, "packages", "i18n", "src", "ui.tsx");

interface ViteAlias {
  find: string | RegExp;
  replacement: string;
}

function recordToAliasEntries(r: Record<string, string>): ViteAlias[] {
  return Object.entries(r).map(([find, replacement]) => ({
    find,
    replacement,
  }));
}

/** Dev: map workspace UI entrypoints (`/ui`, `/ui/plugin`, package `/plugin`) to source. */
function discoverWorkspaceUiAliases(
  workspaceRoots: string[]
): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const workspaceRoot of workspaceRoots) {
    if (!fs.existsSync(workspaceRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(workspaceRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const pkgRoot = path.join(workspaceRoot, entry.name);
      const packageJsonPath = path.join(pkgRoot, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      let packageName = "";
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        ) as { name?: string };
        packageName =
          typeof packageJson.name === "string" ? packageJson.name.trim() : "";
      } catch {
        continue;
      }

      if (!packageName) {
        continue;
      }

      const uiDir = path.join(pkgRoot, "ui");
      if (fs.existsSync(uiDir)) {
        for (const uiEntry of fs.readdirSync(uiDir, { withFileTypes: true })) {
          if (!uiEntry.isFile()) {
            continue;
          }
          const match = uiEntry.name.match(/^(?<base>.+)\.tsx?$/);
          const base = match?.groups?.base;
          if (!base || base.endsWith(".test")) {
            continue;
          }
          aliases[`${packageName}/ui/${base}`] = path.join(uiDir, uiEntry.name);
        }
      }

      const srcDir = path.join(pkgRoot, "src");
      if (fs.existsSync(srcDir)) {
        for (const pluginBase of ["plugin.ts", "plugin.tsx"] as const) {
          const pluginPath = path.join(srcDir, pluginBase);
          if (fs.existsSync(pluginPath)) {
            aliases[`${packageName}/plugin`] = pluginPath;
            break;
          }
        }
      }
    }
  }

  return aliases;
}

/** Exact `@engenty/pkg/ui` only — must not prefix-match `/ui/plugin`. */
function discoverBareUiIndexAliases(workspaceRoots: string[]): ViteAlias[] {
  const entries: ViteAlias[] = [];

  for (const workspaceRoot of workspaceRoots) {
    if (!fs.existsSync(workspaceRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(workspaceRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const pkgRoot = path.join(workspaceRoot, entry.name);
      const packageJsonPath = path.join(pkgRoot, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      let packageName = "";
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        ) as { name?: string };
        packageName =
          typeof packageJson.name === "string" ? packageJson.name.trim() : "";
      } catch {
        continue;
      }

      if (!packageName) {
        continue;
      }

      const uiDir = path.join(pkgRoot, "ui");
      for (const indexBase of ["index.ts", "index.tsx"] as const) {
        const indexPath = path.join(uiDir, indexBase);
        if (fs.existsSync(indexPath)) {
          entries.push({
            find: new RegExp(
              `^${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/ui$`
            ),
            replacement: indexPath,
          });
          break;
        }
      }
    }
  }

  return entries;
}

function buildResolveAlias(isDev: boolean): ViteAlias[] {
  const shared: Record<string, string> = {
    "@": path.join(appRoot, "src"),
    "@engenty/engenty-copilot/paths": path.join(engentyCopilotUi, "paths.ts"),
    "@engenty/engenty-copilot/ui/model-chooser-control": path.join(
      engentyCopilotUi,
      "components",
      "chat",
      "copilot-model-chooser-control.tsx"
    ),
    "@engenty/engenty-copilot/ai/frontend-tools/register": path.join(
      engentyCopilotAi,
      "frontend-tools",
      "register-all.ts"
    ),
    "@engenty/engenty-copilot/ai/ui/frontend-tools": path.join(
      engentyCopilotAi,
      "frontend-tools",
      "register-all.ts"
    ),
    "@engenty/api-client": path.join(apiClient, "src", "index.ts"),
    "@engenty/environment": path.join(environment, "index.ts"),
    "@engenty/projects/ui/public-plugin": path.join(
      projectsUi,
      "public-plugin.ts"
    ),
    // Stub Node-only telemetry so UI bundle never pulls in OpenTelemetry/evlog
    "@engenty/telemetry": path.join(appRoot, "src", "telemetry-stub.ts"),
    // Offers module imports pdf-templates/core; resolve subpath to source for dev
    "@engenty/pdf-templates/core": path.join(pdfTemplates, "core.ts"),
  };

  const modulesRoot = path.join(repoRoot, "modules");
  // Nested connector providers live at modules/<parent>/providers/<child>; add
  // each existing `providers` dir as a workspace root so their `/ui/*` and
  // `/plugin` entrypoints resolve to source (keyed by package name regardless
  // of nesting depth).
  const providerRoots = fs.existsSync(modulesRoot)
    ? fs
        .readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(modulesRoot, entry.name, "providers"))
        .filter((dir) => fs.existsSync(dir))
    : [];
  const workspaceRoots = [
    modulesRoot,
    ...providerRoots,
    path.join(repoRoot, "packages"),
  ];
  // Resolve every on-disk module's UI entrypoints (`/ui/plugin`, `/ui/*`, `/plugin`)
  // to source in BOTH dev and build. The generated plugin catalog imports these
  // even though modules are never dependencies of apps/ui (a module must not be a
  // dependency of the core shell) — so the production build needs these aliases to
  // resolve the catalog's module imports.
  const workspaceUiAliases = discoverWorkspaceUiAliases(workspaceRoots);
  const bareUiIndexAliases = discoverBareUiIndexAliases(workspaceRoots);

  const devWorkspace: Record<string, string> = isDev
    ? {
        "@engenty/ai-ui/plugin": path.join(aiUi, "plugin.tsx"),
        "@engenty/ai-ui/embed": path.join(aiUi, "embed.ts"),
        "@engenty/ai-ui": path.join(aiUi, "index.ts"),
        "@engenty/auth-ui/plugin": path.join(authUi, "plugin.tsx"),
        "@engenty/auth-ui": path.join(authUi, "index.ts"),
        "@engenty/audit-logs/plugin": path.join(auditLogsUi, "plugin.tsx"),
        "@engenty/context-graph/plugin": path.join(
          contextGraphUi,
          "plugin.tsx"
        ),
        "@engenty/user-management-ui/plugin": path.join(
          userManagementUi,
          "plugin.tsx"
        ),
        "@engenty/ui-icons": path.join(uiIcons, "index.ts"),
        "@engenty/i18n/ui": i18nUi,
        "@engenty/app-shell/navigation": path.join(appShell, "navigation.ts"),
        "@engenty/app-shell": path.join(appShell, "index.ts"),
        "@engenty/generative-ui": path.join(generativeUi, "index.ts"),
        "@engenty/pdf-templates/core": path.join(pdfTemplates, "core.ts"),
        "@engenty/pdf-templates": path.join(pdfTemplates, "index.ts"),
        "@engenty/projects/ui/portal": path.join(projectsUi, "portal.ts"),
      }
    : {};

  // Dev: load ui-core from source for HMR. Subpath imports (e.g. shadcn CLI output)
  // must map under packages/ui-core/src; regex entries must precede other aliases.
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
    ...bareUiIndexAliases,
    ...recordToAliasEntries(shared),
    ...recordToAliasEntries(workspaceUiAliases),
    ...recordToAliasEntries(devWorkspace),
  ];
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === "serve";

  return {
    envDir: repoRoot,
    /** Expose `ENV` from workspace `.env` to `import.meta.env.ENV` (see `@engenty/environment`). */
    envPrefix: ["VITE_", "ENV"],
    plugins: [react(), tailwindcss()],
    define: {
      "process.env": {},
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    resolve: {
      alias: buildResolveAlias(isDev),
      dedupe: [
        "@ai-sdk/react",
        "@base-ui/react",
        "zustand",
        "react",
        "react-dom",
      ],
    },
    optimizeDeps: {
      exclude: [
        "@engenty/ai-ui",
        "@engenty/app-shell",
        "@engenty/user-management-ui",
        "@engenty/contacts",
        "@engenty/generative-ui",
        "@engenty/knowledge-base",
        "@engenty/engenty-copilot",
        "@engenty/projects",
        "@engenty/auth-ui",
        "@engenty/ui-icons",
        "@engenty/pdf-templates",
        "@engenty/user-settings",
      ],
    },
    server: {
      host: true,
      port: ports.ui,
      strictPort: true,
      allowedHosts: [".localhost"],
      watch: {
        ignored: [
          /node_modules\/(?!@engenty\/(ai-ui|app-shell|auth-ui|contacts|generative-ui|knowledge-base|copilot|projects|user-management-ui|ui-core|ui-icons|pdf-templates)(\/|$))/,
          "**/.git/**",
        ],
        awaitWriteFinish: isDev
          ? { stabilityThreshold: 500, pollInterval: 100 }
          : undefined,
        followSymlinks: true,
      },
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
        "/ai": {
          target: `http://127.0.0.1:${ports.ai}`,
          changeOrigin: true,
          ws: true,
        },
        // Docs (Next, served under /docs) — so the Vite origin is single-origin in dev.
        "/docs": {
          target: `http://127.0.0.1:${ports.docs}`,
          changeOrigin: true,
          ws: true,
        },
        // Next.js assets + HMR for the docs app. Vite never uses /_next, so routing
        // it to docs is safe (mirrors the core gateway). Without this, /docs renders
        // unstyled because its /_next/* assets 404 against the Vite server.
        "/_next": {
          target: `http://127.0.0.1:${ports.docs}`,
          changeOrigin: true,
          ws: true,
        },
        "/__nextjs": {
          target: `http://127.0.0.1:${ports.docs}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
