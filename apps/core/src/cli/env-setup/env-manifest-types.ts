/**
 * Which env file a variable lives in. Note: the Vite apps (ui, manage) read env
 * from the workspace root too (`envDir: repoRoot`), so VITE_* vars are root-scoped.
 */
export type EnvScope = "root" | "deploy";

export interface EnvScopeInfo {
  /** Workspace-relative path of the live (gitignored) env file. */
  envFile: string;
  /** Workspace-relative path of the committed, generated template. */
  exampleFile: string;
  label: string;
  scope: EnvScope;
}

export type SecretGeneratorId = "base64-32" | "base64url-48";

export type ObtainStrategy =
  /** CLI can mint the value locally via node:crypto. */
  | { kind: "generate"; generator: SecretGeneratorId }
  /** Harvested from `supabase status -o env`; ordered key-name fallbacks across CLI generations. */
  | { kind: "supabase"; statusKeys: readonly string[] }
  /** Owned by scripts/sync-dev-env-from-portless.mjs — the env CLI never writes these. */
  | { kind: "portless" }
  /** Issued by an external provider dashboard. */
  | { kind: "provider"; instructions: readonly string[]; url: string }
  /** Set by hand (with optional guidance). */
  | { kind: "manual"; instructions?: readonly string[] };

export type EnvRequirement = "always" | "feature" | "optional";

/**
 * Whether a var may be overridden at runtime from the DB-backed settings store
 * (`@engenty/platform-settings`), and at which scope:
 *  - `"platform"` — editable in the superadmin Setup UI; overrides the env value
 *    for the whole installation.
 *  - `"tenant"` — additionally overridable per-tenant by a tenant admin (implies
 *    platform-configurable).
 *  - `false` / omitted (default) — env-only. Bootstrap secrets and anything
 *    needed before DB access is available MUST stay this way; see
 *    {@link NON_CONFIGURABLE_ENV_KEYS}.
 */
export type EnvConfigurable = false | "platform" | "tenant";

/**
 * Keys that must never be DB-configurable: the root of trust and anything read
 * before the DB is reachable. Setting `configurable` on any of these fails the
 * manifest build (enforced in env-contributions + the core manifest builder).
 */
export const NON_CONFIGURABLE_ENV_KEYS: readonly string[] = [
  "ENGENTY_SECURITY_JWT_SECRET",
  "ENGENTY_AI_SERVICE_JWT",
  "ENGENTY_AI_SERVICE_SECRET",
  "ENGENTY_AI_SERVICE_EMAIL",
  "ENGENTY_AI_SERVICE_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "CONNECTIONS_TOKEN_ENC_KEY",
  "SECRETS_ENC_KEY",
] as const;

export interface EnvVarSpec {
  /** DB-override scope for this var; omitted = env-only. */
  configurable?: EnvConfigurable;
  /**
   * Real, usable value the CLI may write (per scope or for all scopes).
   * Distinct from `exampleValue`, which is a placeholder.
   */
  defaultValue?: string | Partial<Record<EnvScope, string>>;
  /** Becomes the comment line(s) above the key in generated templates. */
  description: string;
  /** Placeholder shown in templates; a live file still holding it counts as unconfigured. */
  exampleValue?: string;
  /** Optional-feature gate (e.g. "inbox", "banking"); `required: "feature"` vars need one. */
  feature?: string;
  /** Section header in templates and wizard grouping. Groups render in manifest order. */
  group: string;
  key: string;
  obtain: ObtainStrategy;
  required: EnvRequirement;
  scopes: readonly EnvScope[];
  /** Masked in reports and prompted via password input. */
  secret: boolean;
  /** Returns an error message for invalid values. */
  validate?: (value: string) => string | undefined;
}

/** Optional feature gates surfaced in the wizard multiselect. */
export interface EnvFeatureInfo {
  description: string;
  id: string;
  label: string;
  /** Preselected in the env wizard's feature picker on a fresh setup. */
  recommended?: boolean;
}

/**
 * Shape of a single env var as declared in a module's `engenty.plugin.json`
 * under the optional `env.vars` array. Mirrors {@link EnvVarSpec} except that
 * `validate` is a STRING naming a registered validator (JSON can't hold
 * functions). The loader resolves the name to a function via the validator
 * registry before merging into the effective manifest.
 */
export interface ContributedEnvVarSpec {
  /** DB-override scope for this var; omitted = env-only. */
  configurable?: EnvConfigurable;
  defaultValue?: string | Partial<Record<EnvScope, string>>;
  description: string;
  exampleValue?: string;
  feature?: string;
  group: string;
  key: string;
  obtain: ObtainStrategy;
  required: EnvRequirement;
  scopes: readonly EnvScope[];
  secret: boolean;
  /** Name of a validator in the env-validators registry (e.g. "url"). */
  validate?: string;
}

/** The optional `env` field contributed by a module's `engenty.plugin.json`. */
export interface ContributedEnv {
  /** Optional feature gate surfaced in the wizard multiselect. */
  feature?: EnvFeatureInfo;
  vars: ContributedEnvVarSpec[];
}

export function defaultValueForScope(
  spec: EnvVarSpec,
  scope: EnvScope
): string | undefined {
  if (typeof spec.defaultValue === "string") {
    return spec.defaultValue;
  }
  return spec.defaultValue?.[scope];
}
