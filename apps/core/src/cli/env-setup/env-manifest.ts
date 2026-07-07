import { loadEnvContributions } from "./env-contributions.js";
import type {
  EnvFeatureInfo,
  EnvScope,
  EnvScopeInfo,
  EnvVarSpec,
} from "./env-manifest-types.js";
import { isHttpUrl } from "./env-validators.js";

export const ENV_SCOPES: Record<EnvScope, EnvScopeInfo> = {
  deploy: {
    envFile: "deploy/.env",
    exampleFile: "deploy/.env.example",
    label: "Production deploy (deploy/.env)",
    scope: "deploy",
  },
  root: {
    envFile: ".env.local",
    exampleFile: ".env.example",
    label: "Workspace root (.env.local)",
    scope: "root",
  },
};

/**
 * Core/cross-app feature gates. Module-owned features (inbox, ai, banking,
 * ingestion) are contributed via each module's `engenty.plugin.json`.
 */
export const CORE_ENV_FEATURES: EnvFeatureInfo[] = [
  {
    description: "LLM tracing via LangFuse (disabled when unset)",
    id: "observability",
    label: "Observability (LangFuse)",
  },
];

/**
 * Core/cross-app env vars. Module-specific groups (Inbox, AI, Banking, Web
 * ingest) live in each owning module's `engenty.plugin.json` `env` field and
 * are merged in at runtime by {@link getEnvManifest}. Drives the `engenty env`
 * wizard, gap report, validation, and the generated `.env.example` templates
 * (`engenty env example --write`). Groups render in manifest order.
 */
export const CORE_ENV_MANIFEST: EnvVarSpec[] = [
  // ── Workspace ──
  {
    defaultValue: "development",
    description:
      "Workspace tier for `@engenty/environment` (e.g. user menu Developer mode). Use `development` locally.",
    group: "Workspace",
    key: "ENV",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },

  // ── Dev URLs (generated block) ──
  ...(
    [
      "ENGENTY_UI_BASE_URL",
      "ENGENTY_API_BASE_URL",
      "ENGENTY_AI_BASE_URL",
      "ENGENTY_DOCS_BASE_URL",
      "ENGENTY_CORE_BASE_URL",
      "ENGENTY_CORS_ORIGINS",
      "VITE_ENGENTY_AI_BASE_URL",
      "NEXT_PUBLIC_DOCS_SITE_URL",
    ] as const
  ).map(
    (key): EnvVarSpec => ({
      description:
        "Dev service URL — generated block: pnpm dev:urls:localhost (default) or pnpm dev:urls:portless (HTTPS).",
      group: "Dev URLs",
      key,
      obtain: { kind: "portless" },
      required: "optional",
      scopes: ["root"],
      secret: false,
    })
  ),

  // ── API security ──
  {
    description:
      "API JWT signing secret (device login, CLI, service tokens). Generate: engenty env generate.",
    group: "API security",
    key: "ENGENTY_SECURITY_JWT_SECRET",
    obtain: { kind: "generate", generator: "base64url-48" },
    required: "always",
    scopes: ["root", "deploy"],
    secret: true,
    validate: (value) =>
      value.length >= 32 ? undefined : "Must be at least 32 characters.",
  },

  {
    description:
      "Service JWT for apps/ai task dispatcher (same token the coordinator pg_cron job uses for its tenant). Local dev: run `pnpm service:jwt` (scripts/mint-service-jwt.mjs) to mint a long-lived token for the dedicated service identity.",
    group: "API security",
    key: "ENGENTY_AI_SERVICE_JWT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },

  // ── Supabase ──
  {
    defaultValue: { root: "http://127.0.0.1:54321" },
    description:
      "Supabase API endpoint. Local: http://127.0.0.1:54321 (pnpm supabase:start). Production: project URL reachable from the Docker network.",
    exampleValue: undefined,
    group: "Supabase",
    key: "SUPABASE_URL",
    obtain: { kind: "supabase", statusKeys: ["API_URL"] },
    required: "always",
    scopes: ["root", "deploy"],
    secret: false,
    validate: isHttpUrl,
  },
  {
    description:
      "Supabase secret key (server-side admin access — never expose to the browser). Local: from pnpm supabase → Secret (Authentication Keys).",
    exampleValue: "sb_secret_...",
    group: "Supabase",
    key: "SUPABASE_SERVICE_ROLE_KEY",
    obtain: {
      kind: "supabase",
      statusKeys: ["SECRET_KEY", "SERVICE_ROLE_KEY"],
    },
    required: "always",
    scopes: ["root", "deploy"],
    secret: true,
  },
  {
    description:
      "Supabase anon/publishable key (public browser key). Production only — locally the UI reads VITE_SUPABASE_ANON_KEY from the root .env.local.",
    group: "Supabase",
    key: "SUPABASE_ANON_KEY",
    obtain: { kind: "supabase", statusKeys: ["PUBLISHABLE_KEY", "ANON_KEY"] },
    required: "always",
    scopes: ["deploy"],
    secret: false,
  },
  {
    defaultValue: {
      root: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
    description:
      "Direct Postgres connection for apps/ai Mastra framework storage (workflow/run snapshots, native suspend/resume). Chat sessions use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY instead. Recommended for local dev; without it Mastra falls back to in-memory storage. Local default matches the Supabase CLI stack.",
    group: "Supabase",
    key: "SUPABASE_DB_URL",
    obtain: { kind: "supabase", statusKeys: ["DB_URL"] },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },
  {
    defaultValue: { root: "http://127.0.0.1:54321" },
    description:
      "Supabase API endpoint for the UI (Vite reads it from the workspace root; baked into production bundles at build time).",
    group: "Supabase",
    key: "VITE_SUPABASE_URL",
    obtain: { kind: "supabase", statusKeys: ["API_URL"] },
    required: "always",
    scopes: ["root", "deploy"],
    secret: false,
    validate: isHttpUrl,
  },
  {
    description:
      "Supabase anon/publishable key for the UI (public browser key). Local: from pnpm supabase.",
    exampleValue: "sb_publishable_...",
    group: "Supabase",
    key: "VITE_SUPABASE_ANON_KEY",
    obtain: { kind: "supabase", statusKeys: ["PUBLISHABLE_KEY", "ANON_KEY"] },
    required: "always",
    scopes: ["root", "deploy"],
    secret: false,
  },

  // ── Observability (LangFuse) ──
  {
    description: "LangFuse secret key (LLM tracing; disabled when unset).",
    feature: "observability",
    group: "Observability (LangFuse)",
    key: "LANGFUSE_SECRET_KEY",
    obtain: {
      kind: "provider",
      instructions: ["Project settings → API keys in LangFuse."],
      url: "https://cloud.langfuse.com",
    },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },
  {
    description: "LangFuse public key.",
    feature: "observability",
    group: "Observability (LangFuse)",
    key: "LANGFUSE_PUBLIC_KEY",
    obtain: {
      kind: "provider",
      instructions: ["Project settings → API keys in LangFuse."],
      url: "https://cloud.langfuse.com",
    },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "LangFuse base URL (cloud region or self-hosted instance).",
    exampleValue: "https://cloud.langfuse.com",
    feature: "observability",
    group: "Observability (LangFuse)",
    key: "LANGFUSE_BASE_URL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },

  // ── UI (Vite) extras ──
  {
    description:
      "Omit for same-origin /api via the Vite dev proxy (http://localhost:5173 → core on :8787).",
    group: "UI (Vite)",
    key: "VITE_API_BASE_URL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Persist copilot composer draft across refresh (off by default).",
    exampleValue: "true",
    group: "UI (Vite)",
    key: "VITE_COPILOT_COMPOSER_DRAFT_RECOVERY",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },

  // ── Dev login ──
  {
    description: "Dev auto-login email (core dev-login routes).",
    group: "Dev login",
    key: "ENGENTY_DEV_EMAIL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Dev auto-login password.",
    group: "Dev login",
    key: "ENGENTY_DEV_PASS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },
  {
    description: "Dev auto-login email prefilled in the UI login form.",
    group: "Dev login",
    key: "VITE_ENGENTY_DEV_EMAIL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Dev auto-login password prefilled in the UI login form.",
    group: "Dev login",
    key: "VITE_ENGENTY_DEV_PASS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },

  // ── Core API & AI workspace ──
  {
    description:
      "Core API (apps/core): optional Vault office preview via Gotenberg.",
    exampleValue: "http://127.0.0.1:3000",
    group: "Core API & AI workspace",
    key: "GOTENBERG_URL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Workspace filesystem backend for agent workspaces (e.g. file-storage, remote, local).",
    group: "Core API & AI workspace",
    key: "ENGENTY_WORKSPACE_FS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Agent code sandbox provider: docker (default) | gondolin (local dev micro-VM).",
    exampleValue: "docker",
    group: "Core API & AI workspace",
    key: "ENGENTY_SANDBOX_PROVIDER",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Supabase Storage bucket for agent workspace files.",
    exampleValue: "files",
    group: "Core API & AI workspace",
    key: "ENGENTY_WORKSPACE_STORAGE_BUCKET",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },

  // ── Logging & debug ──
  {
    description: "CLI/server log level: debug | info | warn | error.",
    exampleValue: "info",
    group: "Logging & debug",
    key: "LOG_LEVEL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Local log output directory.",
    group: "Logging & debug",
    key: "LOG_DIR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "evlog structured log directory.",
    group: "Logging & debug",
    key: "EVLOG_LOG_DIR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Axiom ingest token for structured logs (optional).",
    group: "Logging & debug",
    key: "AXIOM_TOKEN",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: true,
  },
  {
    description: "AI debug logging: =1 to enable (packages/ai-core).",
    exampleValue: "1",
    group: "Logging & debug",
    key: "AI_DEBUG",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "AI debug log directory.",
    group: "Logging & debug",
    key: "AI_DEBUG_LOG_DIR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "AI debug log file name.",
    group: "Logging & debug",
    key: "AI_DEBUG_LOG_FILE",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "AI debug: also log to stdout (=1).",
    group: "Logging & debug",
    key: "AI_DEBUG_LOG_STDOUT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },

  // ── Production deploy (deploy/.env only) ──
  {
    description:
      "Public URL, single origin — Coolify Traefik should point HTTPS here → engenty-edge:8787. No trailing slash.",
    exampleValue: "https://app.example.com",
    group: "Production edge",
    key: "PUBLIC_APP_URL",
    obtain: { kind: "manual" },
    required: "always",
    scopes: ["deploy"],
    secret: false,
    validate: (value) => {
      if (!/^https?:\/\//.test(value)) {
        return "Must be an http(s):// URL.";
      }
      return value.endsWith("/")
        ? "Must not end with a trailing slash."
        : undefined;
    },
  },
  {
    defaultValue: { deploy: "8787" },
    description:
      "Port published on the host when not using Coolify routing only (optional).",
    group: "Production edge",
    key: "EDGE_PUBLISH_PORT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "CORS for apps/ai (comma-separated origins allowed to call /ai).",
    exampleValue: "https://app.example.com",
    group: "Production edge",
    key: "ENGENTY_CORS_ORIGINS",
    obtain: { kind: "manual" },
    required: "always",
    scopes: ["deploy"],
    secret: false,
  },
  {
    defaultValue: { deploy: "false" },
    description: "Proxy /docs to the docs service (compose profile docs).",
    group: "Production gateway flags",
    key: "ENGENTY_GATEWAY_DOCS_ENABLED",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    defaultValue: { deploy: "false" },
    description: "Proxy /studio to Mastra Studio (compose profile studio).",
    group: "Production gateway flags",
    key: "ENGENTY_GATEWAY_STUDIO_ENABLED",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description: "HTTP basic auth on /studio (user:password).",
    exampleValue: "operator:change-me",
    group: "Production gateway flags",
    key: "ENGENTY_GATEWAY_STUDIO_BASIC_AUTH",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: true,
  },
  {
    defaultValue: { deploy: "engenty-sandbox:latest" },
    description:
      "Prebaked agent sandbox runtime image (bun + python3 + uv). Build first: docker compose -f deploy/docker-compose.yaml build.",
    group: "Agent sandbox (Docker-only)",
    key: "ENGENTY_SANDBOX_DOCKER_IMAGE",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Host dir for sandbox staging; mirrored 1:1 into containers (see compose notes).",
    exampleValue: "/opt/engenty/sandboxes",
    group: "Agent sandbox (Docker-only)",
    key: "ENGENTY_SANDBOX_HOST_DIR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
];

/**
 * The effective manifest: core entries first (in declared order), then env vars
 * contributed by modules present in the workspace (discovered from their
 * `engenty.plugin.json`). Assembled fresh on each call so a minimal build only
 * documents the env of the modules it ships.
 */
export function getEnvManifest(): EnvVarSpec[] {
  return [...CORE_ENV_MANIFEST, ...loadEnvContributions().vars];
}

/** Core feature gates first, then features contributed by present modules. */
export function getEnvFeatures(): EnvFeatureInfo[] {
  return [...CORE_ENV_FEATURES, ...loadEnvContributions().features];
}

export function manifestForScope(scope: EnvScope): EnvVarSpec[] {
  return getEnvManifest().filter((spec) => spec.scopes.includes(scope));
}

export function findSpec(key: string): EnvVarSpec | undefined {
  return getEnvManifest().find((spec) => spec.key === key);
}
