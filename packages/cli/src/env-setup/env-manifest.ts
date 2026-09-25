import { loadEnvContributions } from "./env-contributions.js";
import type {
  EnvFeatureInfo,
  EnvScope,
  EnvScopeInfo,
  EnvVarSpec,
} from "./env-manifest-types.js";
import { isHttpUrl } from "./env-validators.js";

export const ENV_SCOPES: Record<EnvScope, EnvScopeInfo> = {
  // Not workspace-relative: resolved against ENGENTY_HOME (~/.engenty), the
  // install `engenty start` manages. There is no checkout to hold it.
  home: {
    envFile: ".env",
    exampleFile: ".env.example",
    label: "Managed install (~/.engenty/.env)",
    scope: "home",
  },
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
    description:
      "Agent run tracing from apps/ai to Langfuse, any OTLP backend, or the Mastra store (off when no sink is configured)",
    id: "observability",
    label: "Observability",
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
      "Private key the tenant-locked server lane signs its engenty_server JWTs with, as a PKCS8 PEM or that PEM base64-encoded. Set this ONLY when the Supabase project verifies asymmetric keys — Supabase Cloud after the JWT-signing-keys migration publishes a JWKS and keeps its own private key, so there is no shared secret to sign with and HS256 tokens are rejected outright. Generate an EC P-256 key, import it into the project's JWT signing keys, and keep the private half here. Leave unset on local/self-hosted stacks, which still verify the symmetric secret. Must be set together with ENGENTY_SERVER_LANE_KEY_ID.",
    group: "API security",
    key: "ENGENTY_SERVER_LANE_PRIVATE_KEY",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: true,
  },

  {
    description:
      "Key id (`kid`) of the imported signing key above — the project's JWKS holds several keys and the verifier needs to know which one to try. Supabase requires this to be a UUID and rejects the import otherwise, so generate one (`uuidgen`) and use the same value in the imported JWK and here. Must be set together with ENGENTY_SERVER_LANE_PRIVATE_KEY; setting one without the other fails at boot rather than silently falling back to HS256.",
    exampleValue: "208398c6-7a4c-467e-b222-8f9f6e45a0dc",
    group: "API security",
    key: "ENGENTY_SERVER_LANE_KEY_ID",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },

  {
    description:
      "Canonical HTTPS URL of the Engenty MCP resource server (ends with /mcp). OAuth access tokens must carry this exact audience; the generic `aud: engenty` token is never accepted at /mcp.",
    exampleValue: "https://engenty.localhost/mcp",
    group: "API security",
    key: "ENGENTY_MCP_RESOURCE_URL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
    validate: isHttpUrl,
  },

  {
    description:
      "MCP access-token audience. Defaults to `engenty-mcp`. Must match the claim minted by core.custom_access_token_hook; generic `aud: engenty` tokens are never accepted at /mcp.",
    exampleValue: "engenty-mcp",
    group: "API security",
    key: "ENGENTY_MCP_AUDIENCE",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },

  {
    description:
      "The service credential for apps/ai (scheduler, task dispatcher, remote channels), as `<credentialId>.<secret>`. Locally `engenty setup` mints and rewrites it whenever the row is missing from the local Supabase (a `db reset` drops it) — `engenty service-token ensure-local` does the same by hand. On a deployment: `engenty service-token create --name ai-service` after a device-flow `engenty auth login` (not --dev). A locked-down mint must list module.* and core.agents.manage — module.read / module.write cover no module that names its own capabilities (module.offers.*, module.tasks.*, …). apps/ai exchanges it at POST /api/auth/service-token for a 15-minute engenty token per tenant — no Supabase user, revocable with `engenty service-token revoke`, capabilities clamped at creation.",
    group: "API security",
    key: "ENGENTY_AI_SERVICE_SECRET",
    obtain: {
      kind: "manual",
      instructions: [
        "Local: pnpm engenty setup (or: pnpm engenty service-token ensure-local)",
        "Deployment: pnpm engenty service-token create --name ai-service",
      ],
    },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: true,
  },

  // ── Supabase ──
  // The three local Supabase addresses carry NO default: a second stack on
  // another port band (project id ≠ engenty-local) would otherwise keep the
  // default band, pass `env check`, and point core at a different database
  // while every local stack answers with the same demo keys (2026-09-13).
  // `engenty env init` writes them from `supabase status`.
  {
    description:
      "Supabase API endpoint. Local: written by `engenty env init` from `supabase status`. Production: project URL reachable from the Docker network.",
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
    description:
      "Direct Postgres connection string. Two uses: (1) apps/ai Mastra framework storage (workflow/run snapshots, native suspend/resume — without it Mastra falls back to in-memory); (2) the deploy migrate init-service applies pending migrations to it on each deploy. The service-role key can't run DDL, so this is REQUIRED for automatic migrations (unset ⇒ the migrate step is skipped and you apply migrations manually). Local: written by `engenty env init` from `supabase status`.",
    group: "Supabase",
    key: "SUPABASE_DB_URL",
    obtain: { kind: "supabase", statusKeys: ["DB_URL"] },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: true,
  },
  {
    description:
      'JWT secret the Supabase stack verifies HS256 tokens with. The tenant-locked server lane (core and apps/ai) signs its engenty_server tokens with it; without it the lane falls back to ENGENTY_SECURITY_JWT_SECRET, which the stack does not know, and every tenant-lane query fails with "No suitable key or wrong key type". Local: written by `engenty env init` from `supabase status` (JWT_SECRET). Self-hosted: the stack\'s JWT_SECRET. Supabase Cloud with asymmetric signing keys: leave unset and use ENGENTY_SERVER_LANE_PRIVATE_KEY instead.',
    group: "Supabase",
    key: "SUPABASE_JWT_SECRET",
    obtain: { kind: "supabase", statusKeys: ["JWT_SECRET"] },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: true,
  },
  {
    description:
      "Supabase API endpoint for the UI. Required locally, where Vite serves the SPA and reads this from the workspace root. In a deployment the gateway writes it into the served page and falls back to SUPABASE_URL — set it there only when the browser-facing address differs, e.g. SUPABASE_URL is container-internal Docker DNS.",
    group: "Supabase",
    key: "VITE_SUPABASE_URL",
    obtain: { kind: "supabase", statusKeys: ["API_URL"] },
    required: { deploy: "optional", root: "always" },
    scopes: ["root", "deploy"],
    secret: false,
    validate: isHttpUrl,
  },
  {
    description:
      "Supabase anon/publishable key for the UI (public browser key). Local: from pnpm supabase. In a deployment the gateway writes it into the served page and falls back to SUPABASE_ANON_KEY, so it is only needed when the two differ.",
    exampleValue: "sb_publishable_...",
    group: "Supabase",
    key: "VITE_SUPABASE_ANON_KEY",
    obtain: { kind: "supabase", statusKeys: ["PUBLISHABLE_KEY", "ANON_KEY"] },
    required: { deploy: "optional", root: "always" },
    scopes: ["root", "deploy"],
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
  {
    description:
      "Sampled UI interaction telemetry (INP, named interactions, long tasks, route transitions, startup bytes, API latency). Off by default. Payloads carry release, route group, and device class only — never ids or user content.",
    exampleValue: "1",
    group: "UI (Vite)",
    key: "VITE_UI_PERFORMANCE_TELEMETRY",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Optional POST URL for sampled UI interaction telemetry. Empty means collect-only (no network).",
    exampleValue: "https://example.invalid/ui-perf",
    group: "UI (Vite)",
    key: "VITE_UI_PERFORMANCE_TELEMETRY_URL",
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

  // ── Mastra Studio (dev) ──
  {
    description: "Set by `pnpm engenty dev --studio`. Ignored in production.",
    exampleValue: "1",
    group: "Mastra Studio",
    key: "ENGENTY_MASTRA_STUDIO_API",
    obtain: {
      kind: "manual",
      instructions: [
        "Do not set this by hand. Pass --studio on the dev script.",
      ],
    },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Optional tenant UUID to pin onto Mastra Studio at boot (local / single-tenant). Ignored in production and when Studio is off. Setup → Mastra Studio → Activate tenant in Studio can set the runtime pin when this is unset.",
    group: "Mastra Studio",
    key: "ENGENTY_STUDIO_TENANT_ID",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
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
      "Agent code sandbox provider. docker is the only supported value (sandbox doctrine 2026-08-03); any other value fails loudly at resolve.",
    exampleValue: "docker",
    group: "Core API & AI workspace",
    key: "ENGENTY_SANDBOX_PROVIDER",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Set to false to stop sending email notifications for unread in-app notifications. Any other value (or unset) leaves them on.",
    exampleValue: "true",
    group: "Core API & AI workspace",
    key: "ENGENTY_EMAIL_NOTIFICATIONS_ENABLED",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "How long a notification stays unread before it is emailed, in minutes. Defaults to 5.",
    exampleValue: "5",
    group: "Core API & AI workspace",
    key: "ENGENTY_EMAIL_NOTIFICATION_DELAY_MINUTES",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Which notification sources may be emailed: comma-separated list, or * for all. Defaults to team-chat.",
    exampleValue: "team-chat",
    group: "Core API & AI workspace",
    key: "ENGENTY_EMAIL_NOTIFICATION_SOURCES",
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
  {
    description:
      "Days a marked-deleted space stays recoverable before the background sweep hard-deletes it and its data. Defaults to 7. Set to 0 to purge on the next sweep.",
    exampleValue: "7",
    group: "Core API & AI workspace",
    key: "ENGENTY_SPACE_PURGE_AFTER_DAYS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },

  // ── engenty Apps (tenant-authored apps) ──
  {
    description:
      "Internal URL of apps/app-host (apps/ai → app-host). Never published and never a gateway target — app-host runs tenant-authored code, so it gets no origin of its own.",
    exampleValue: "http://127.0.0.1:8795",
    group: "engenty Apps",
    key: "ENGENTY_APP_HOST_URL",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },
  {
    description:
      "Shared secret apps/ai presents on every app-host internal call. Required in production — app-host refuses to boot without it.",
    exampleValue: "generate-a-random-64-char-secret",
    group: "engenty Apps",
    key: "ENGENTY_APP_HOST_TOKEN",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: true,
  },
  {
    description:
      "The one host root, shared by app-host and engenty-ai. Each Space has one folder, tenants/<tenant>/spaces/<space>/: home/, sandbox/ and cache/ of its computer, browser/{profile,downloads}/, and apps/<slug>/{src,data} (App repositories and databases — back these up). engenty-ai also stages object storage under it (…/ai/). Must be the same path inside the containers and on the host. Defaults to ~/.engenty/spaces; the compose files bind /opt/engenty/spaces.",
    exampleValue: "/opt/engenty/spaces",
    group: "engenty Apps",
    key: "ENGENTY_SPACES_DIR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },
  {
    description: "Local port for apps/app-host (internal only).",
    exampleValue: "8795",
    group: "engenty Apps",
    key: "ENGENTY_APP_HOST_PORT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description:
      "Deployment-wide kill switch for engenty Apps. Set to false and the module registers no operations at all — nothing to reach. Per-tenant gating is module licensing; per-app gating is app_archive.",
    exampleValue: "true",
    group: "engenty Apps",
    key: "ENGENTY_APPS_ENABLED",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
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
      "Immutable edge image tag used by the blue/green edge Compose file.",
    exampleValue: "v0.1.127",
    group: "Production edge",
    key: "ENGENTY_RELEASE_TAG",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Immutable image tag used by the stable blue/green backend Compose file.",
    exampleValue: "v0.1.127",
    group: "Production edge",
    key: "ENGENTY_BACKEND_RELEASE_TAG",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Blue/green edge color for this Coolify application (blue or green).",
    exampleValue: "blue",
    group: "Production edge",
    key: "ENGENTY_DEPLOY_COLOR",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
    validate: (value) =>
      value === "blue" || value === "green"
        ? undefined
        : "Must be blue or green.",
  },
  {
    description:
      "CORS for apps/ai (comma-separated origins allowed to call /ai). Defaults to PUBLIC_APP_URL, which is the whole list for a single-origin install — set it only to allow additional origins.",
    exampleValue: "https://app.example.com",
    group: "Production edge",
    key: "ENGENTY_CORS_ORIGINS",
    obtain: { kind: "manual" },
    required: "optional",
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
      "Quota for one Space's folder on the host (its computer's home, sandbox and caches, its browser profile and downloads, its Apps), measured with du on the reaper's tick. Over it, the Space's package caches are cleared, then it is reported on the Computers view. Default 20 GiB.",
    exampleValue: "21474836480",
    group: "Agent sandbox (Docker-only)",
    key: "ENGENTY_SPACE_DRIVE_MAX_BYTES",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Idle browsers are stopped after this many ms (logins survive in the profile). Default 15 min.",
    exampleValue: "900000",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_IDLE_STOP_MS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Running browsers per tenant, host-wide. Over the ceiling, Start answers 429. Default 4.",
    exampleValue: "4",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_MAX_PER_TENANT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Running browsers per person, host-wide. Over the ceiling, Start answers 429. Default 2.",
    exampleValue: "2",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_MAX_PER_USER",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: false,
  },
  {
    description:
      "Shared secret for the live-view tickets across engenty-ai instances (also used by the voice cascade). Random per process when unset, which only works while there is one instance.",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_REALTIME_TICKET_SECRET",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["deploy"],
    secret: true,
  },
  // Jev answers the small classifiers (Auto effort, inbox categories, KB
  // search verifier) and, behind its own switch, each browser fast-loop step.
  {
    configurable: "platform",
    description:
      "TypeSafe (Jev) API key for the small classifiers and the browser fast loop — optional: without it Jev is reached through the Vercel AI Gateway (typesafe-ai/jev) on AI_GATEWAY_API_KEY.",
    group: "Core API & AI workspace",
    key: "TYPESAFE_API_KEY",
    obtain: {
      instructions: [
        "1. Sign in at https://typesafe.ai and create an API key",
        "2. Copy it here",
      ],
      kind: "provider",
      url: "https://docs.typesafe.ai/introduction/quickstart",
    },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: true,
  },
  {
    configurable: "platform",
    defaultValue: "false",
    description:
      "Experimental: offer agents the browser_run_fast tool (TypeSafe Jev decides each browser step). Needs AI_GATEWAY_API_KEY or TYPESAFE_API_KEY.",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_FAST_LOOP",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
    validate: (value) =>
      ["true", "false", "1", "0", ""].includes(value.trim().toLowerCase())
        ? undefined
        : "must be true or false",
  },
  {
    configurable: "platform",
    defaultValue: "0.1",
    description:
      "Fast loop: a step is executed only when the classifier's pick leads the runner-up by at least this probability margin (0–1); otherwise the agent LLM takes over. Default 0.1.",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_FAST_MIN_MARGIN",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },
  {
    configurable: "platform",
    defaultValue: "60",
    description:
      "Fast loop: hard ceiling of browser steps per browser_run_fast call. Default 60.",
    group: "User browsers (one per person per Space)",
    key: "ENGENTY_BROWSER_FAST_MAX_STEPS",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root", "deploy"],
    secret: false,
  },
];

/**
 * The effective manifest: core entries first (in declared order), then env vars
 * contributed by modules present in the workspace (discovered from their
 * `engenty.plugin.json`). Assembled fresh on each call so a minimal build only
 * documents the env of the modules it ships.
 */
export function getEnvManifest(workspaceRoot?: string): EnvVarSpec[] {
  return [...CORE_ENV_MANIFEST, ...loadEnvContributions(workspaceRoot).vars];
}

/** Core feature gates first, then features contributed by present modules. */
export function getEnvFeatures(): EnvFeatureInfo[] {
  return [...CORE_ENV_FEATURES, ...loadEnvContributions().features];
}

export function manifestForScope(
  scope: EnvScope,
  workspaceRoot?: string
): EnvVarSpec[] {
  return getEnvManifest(workspaceRoot).filter((spec) =>
    spec.scopes.includes(scope)
  );
}

export function findSpec(key: string): EnvVarSpec | undefined {
  return getEnvManifest().find((spec) => spec.key === key);
}
