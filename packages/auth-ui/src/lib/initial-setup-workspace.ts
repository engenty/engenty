/**
 * The workspace half of the initial setup: the team this installation belongs
 * to, and the space its work starts in.
 *
 * Both already exist by the time the wizard asks. Creating the first admin
 * calls `ensureDefaultTenant`, which inserts the tenant named "Default Tenant"
 * and puts the admin in it, and a database trigger gives every tenant its
 * default "Company" space with the baseline mounts. So the wizard RENAMES what
 * is there — a second tenant created here would leave the admin signed in to
 * the first one, which is what the `engenty.app/<slug>` step used to do.
 */
import { getApiBaseUrl } from "./api-client";
import {
  errorIfDatabaseUnavailableFromResponse,
  readResponseJsonLoose,
  readSetupApiErrorMessage,
} from "./initial-setup-gate";

const SETUP_REQUEST_TIMEOUT_MS = 10_000;

/** Tenant and space keys are lowercase, hyphenated, and never empty. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}

export interface SetupSpaceMount {
  agentAccess?: "none" | "read" | "write" | null;
  recordScope?: "space" | "all" | null;
  resourceKey: string;
  resourceType: string;
}

/**
 * A space's mounts in the shape `PUT /setup` takes back. That route reconciles
 * the COMPLETE desired set and rejects one missing a baseline mount, so a
 * rename has to echo what the space already carries.
 */
export function mountsToSetupPayload(
  mounts: readonly SetupSpaceMount[]
): Record<string, string>[] {
  return mounts.map((mount) => ({
    resource_key: mount.resourceKey,
    resource_type: mount.resourceType,
    ...(mount.recordScope ? { record_scope: mount.recordScope } : {}),
    ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
  }));
}

async function setupFetch<T>(
  path: string,
  accessToken: string,
  init: { body?: unknown; method: string },
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
  });
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(readSetupApiErrorMessage(payload, fallbackMessage));
  }
  const body = payload as { data?: T };
  return (body?.data ?? payload) as T;
}

interface WorkspaceContext {
  currentTenant: { id: string; name: string; slug: string } | null;
}

export async function readCurrentTenant(
  accessToken: string
): Promise<{ id: string; name: string; slug: string } | null> {
  const context = await setupFetch<WorkspaceContext>(
    "/api/users/setup/context",
    accessToken,
    { method: "GET" },
    "Could not read the workspace context."
  );
  return context.currentTenant ?? null;
}

/**
 * Name the tenant the administrator is already in. The slug is derived rather
 * than asked for: nothing routes by it — it shows on the tenant settings page
 * and in the superadmin console, and the URL the old step promised
 * (`engenty.app/<slug>`) does not exist in this product.
 */
export async function nameTenant(params: {
  accessToken: string;
  name: string;
  tenantId: string;
}): Promise<void> {
  const slug = slugifyName(params.name) || "team";
  await setupFetch(
    `/api/superadmin/tenants/${encodeURIComponent(params.tenantId)}`,
    params.accessToken,
    { body: { name: params.name, slug }, method: "PATCH" },
    "Could not save the team name."
  );
}

interface SpaceRow {
  id: string;
  isDefault: boolean;
  key: string;
  name: string;
}

/**
 * A key `spaces_key_format_check` accepts: lowercase, starts on a letter or
 * digit, no trailing hyphen. Falls back to `space` for a name that slugifies to
 * nothing, and to `<key>-2`, `-3`… while the tenant already holds the key.
 */
export function firstSpaceKey(name: string, taken: readonly string[]): string {
  const base = slugifyName(name).slice(0, 60) || "space";
  const used = new Set(taken.map((key) => key.toLowerCase()));
  if (!used.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

/**
 * Name the tenant's default space and key it off that name.
 *
 * The trigger that creates it has only the tenant id to go on, so it uses the
 * placeholder key `company` — and the key is what `/s/<key>/…` routes on. This
 * is the one moment re-keying is free: nobody has a link to the space yet.
 */
export async function nameFirstSpace(params: {
  accessToken: string;
  name: string;
}): Promise<void> {
  const spaces = await setupFetch<SpaceRow[]>(
    "/api/spaces",
    params.accessToken,
    { method: "GET" },
    "Could not read the spaces."
  );
  const target = spaces.find((space) => space.isDefault);
  if (!target) {
    throw new Error("This tenant has no default space.");
  }
  const mounts = await setupFetch<SetupSpaceMount[]>(
    `/api/spaces/${encodeURIComponent(target.id)}/mounts`,
    params.accessToken,
    { method: "GET" },
    "Could not read the space setup."
  );
  const taken = spaces
    .filter((space) => space.id !== target.id)
    .map((space) => space.key);
  await setupFetch(
    `/api/spaces/${encodeURIComponent(target.id)}/setup`,
    params.accessToken,
    {
      body: {
        key: firstSpaceKey(params.name, taken),
        mounts: mountsToSetupPayload(mounts),
        name: params.name,
      },
      method: "PUT",
    },
    "Could not save the space name."
  );
}
