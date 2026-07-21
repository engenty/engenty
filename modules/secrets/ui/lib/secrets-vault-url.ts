import type { SecretKind } from "../api.js";
import { SECRETS_MODULE_BASE } from "../secrets-paths.js";

export type SecretsSidebarTab = "clients" | "projects";
export type SecretsScopeFilter = "user" | "tenant";

const SECRET_KINDS = new Set<SecretKind>([
  "username_password",
  "api_key",
  "key_list",
  "credit_card",
  "note",
]);

export interface SecretsVaultFilters {
  client: string | null;
  kind: SecretKind | null;
  project: string | null;
  q: string;
  scope: SecretsScopeFilter | null;
  tab: SecretsSidebarTab;
}

export function parseSecretsSidebarTab(
  raw: string | null | undefined
): SecretsSidebarTab {
  return raw === "projects" ? "projects" : "clients";
}

export function parseSecretsScopeFilter(
  raw: string | null | undefined
): SecretsScopeFilter | null {
  if (raw === "user" || raw === "tenant") {
    return raw;
  }
  return null;
}

export function parseSecretsKindFilter(
  raw: string | null | undefined
): SecretKind | null {
  if (raw && SECRET_KINDS.has(raw as SecretKind)) {
    return raw as SecretKind;
  }
  return null;
}

/** Build a vault href, preserving unspecified params from `current` when provided. */
export function secretsVaultHref(
  next: Partial<SecretsVaultFilters>,
  current?: Partial<SecretsVaultFilters>
): string {
  const merged: SecretsVaultFilters = {
    q: next.q ?? current?.q ?? "",
    scope: next.scope === undefined ? (current?.scope ?? null) : next.scope,
    kind: next.kind === undefined ? (current?.kind ?? null) : next.kind,
    client: next.client === undefined ? (current?.client ?? null) : next.client,
    project:
      next.project === undefined ? (current?.project ?? null) : next.project,
    tab: next.tab ?? current?.tab ?? "clients",
  };

  const params = new URLSearchParams();
  if (merged.q.trim()) {
    params.set("q", merged.q.trim());
  }
  if (merged.scope) {
    params.set("scope", merged.scope);
  }
  if (merged.kind) {
    params.set("kind", merged.kind);
  }
  if (merged.client) {
    params.set("client", merged.client);
  }
  if (merged.project) {
    params.set("project", merged.project);
  }
  if (merged.tab !== "clients") {
    params.set("tab", merged.tab);
  }
  const search = params.toString();
  return search ? `${SECRETS_MODULE_BASE}?${search}` : SECRETS_MODULE_BASE;
}
