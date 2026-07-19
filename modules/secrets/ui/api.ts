import { requestApiJson } from "@engenty/api-client";

/** Secrets Vault UI data layer. Ops go through the operations gateway; the
 * reveal is a dedicated audited HTTP route (never a low-friction tool call). */

export type OwnerScope = "user" | "project" | "client" | "tenant";
export type SecretKind =
  | "username_password"
  | "api_key"
  | "key_list"
  | "credit_card"
  | "note";

export interface SecretListItem {
  id: string;
  owner_scope: OwnerScope;
  owner_id: string;
  name: string;
  kind: SecretKind;
  url: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecretCreateInput {
  owner_scope: OwnerScope;
  owner_id: string;
  name: string;
  kind: SecretKind;
  url?: string;
  description?: string;
  payload: Record<string, unknown>;
  project_ids?: string[];
}

export interface SecretUpdateInput {
  id: string;
  name?: string;
  url?: string | null;
  description?: string | null;
  payload?: Record<string, unknown>;
}

export interface RevealedSecret {
  id: string;
  kind: SecretKind;
  payload: Record<string, unknown>;
}

export interface ClientOption {
  id: string;
  display_name: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  client_id: string | null;
}

/** Some endpoints return the row set directly, others wrap it in `{ data }` —
 * requestApiJson already strips the outer `{ ok, data }` envelope. */
function normalizeList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (key && Array.isArray(record[key])) {
      return record[key] as T[];
    }
    if (Array.isArray(record.data)) {
      return record.data as T[];
    }
  }
  return [];
}

async function invokeOperation<T>(
  operationId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  return await requestApiJson<T>(`/api/operations/${operationId}/invoke`, {
    method: "POST",
    body: { input },
    signal,
  });
}

export async function listSecrets(
  signal?: AbortSignal
): Promise<SecretListItem[]> {
  const res = await invokeOperation<{ rows: SecretListItem[] }>(
    "secrets_list",
    {},
    signal
  );
  return normalizeList<SecretListItem>(res, "rows");
}

export async function createSecret(
  input: SecretCreateInput
): Promise<{ id: string }> {
  return await invokeOperation<{ id: string }>("secrets_create", input);
}

export async function updateSecret(input: SecretUpdateInput): Promise<void> {
  await invokeOperation("secrets_update", input);
}

export async function moveSecret(input: {
  id: string;
  owner_scope: OwnerScope;
  owner_id: string;
}): Promise<void> {
  await invokeOperation("secrets_move", input);
}

export async function deleteSecret(id: string): Promise<void> {
  await invokeOperation("secrets_delete", { id });
}

/** Audited reveal — plaintext is returned once and must never be persisted to
 * browser storage; callers keep it in transient component state only. */
export async function revealSecret(id: string): Promise<RevealedSecret> {
  return await requestApiJson<RevealedSecret>(`/api/secrets/${id}/reveal`, {
    method: "POST",
  });
}

/** Organisation contacts are the vault's "clients" (group headers + owner picker). */
export async function listClients(
  signal?: AbortSignal
): Promise<ClientOption[]> {
  const raw = await requestApiJson<unknown>(
    "/api/contacts?type=organisation&pageSize=200",
    { method: "GET", signal }
  );
  return normalizeList<ClientOption>(raw, "data");
}

export async function listProjects(
  signal?: AbortSignal
): Promise<ProjectOption[]> {
  const raw = await requestApiJson<unknown>("/api/projects?pageSize=200", {
    method: "GET",
    signal,
  });
  return normalizeList<ProjectOption>(raw, "data");
}
