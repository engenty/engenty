// Single source of truth for local service ports. Lives in apps/ (kept out of
// the repo root).
//
// Change a port here, or override per-run with the matching env var
// (exported into the environment before `pnpm dev`):
//
//   ENGENTY_UI_PORT   ENGENTY_CORE_PORT   ENGENTY_AI_PORT   ENGENTY_DOCS_PORT
//
// Consumers:
//   - apps/ui/vite.config.ts   → its own port AND the /api,/ai,/docs proxy targets
//   - apps/core (server.ts)    → reads ENGENTY_CORE_PORT (default below)
//   - apps/ai  (src/index.ts)  → reads ENGENTY_AI_PORT  (default below)
//   - apps/docs (dev:app)      → reads ENGENTY_DOCS_PORT (default below)
//
// core/ai/docs each read their own env var so there is no shared PORT to collide.

const fromEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const ports = {
  ui: fromEnv("ENGENTY_UI_PORT", 5173),
  core: fromEnv("ENGENTY_CORE_PORT", 8787),
  ai: fromEnv("ENGENTY_AI_PORT", 8790),
  docs: fromEnv("ENGENTY_DOCS_PORT", 3002),
  manage: fromEnv("ENGENTY_MANAGE_PORT", 5174),
  // apps/app-host — internal only. Never published, never a gateway target,
  // never a Portless host: it serves tenant-authored code and must not be
  // same-origin with anything. Listed here purely so local dev and the
  // stale-port sweep know about it.
  appHost: fromEnv("ENGENTY_APP_HOST_PORT", 8795),
};
