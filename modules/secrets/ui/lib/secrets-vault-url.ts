import { SECRETS_MODULE_BASE } from "../secrets-paths.js";

export type SecretsSidebarTab = "clients" | "projects";
export type SecretsScopeFilter = "user" | "tenant";

export interface SecretsVaultFilters {
  client: string | null;
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

/** Build a vault href, preserving unspecified params from `current` when provided. */
export function secretsVaultHref(
  next: Partial<SecretsVaultFilters>,
  current?: Partial<SecretsVaultFilters>
): string {
  const merged: SecretsVaultFilters = {
    q: next.q ?? current?.q ?? "",
    scope: next.scope === undefined ? (current?.scope ?? null) : next.scope,
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
