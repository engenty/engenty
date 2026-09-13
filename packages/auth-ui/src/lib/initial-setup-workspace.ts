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
    // The status is the only clue when the body carries no message — a dev
    // proxy answering for a core that is restarting says nothing else.
    throw new Error(
      readSetupApiErrorMessage(
        payload,
        `${fallbackMessage} (HTTP ${response.status} — is the core API running?)`
      )
    );
  }
  const body = payload as { data?: T };
  return (body?.data ?? payload) as T;
}

export interface SetupWorkspaceContext {
  currentTenant: { id: string; name: string; slug: string } | null;
  userId: string;
}

export async function readWorkspaceContext(
  accessToken: string
): Promise<SetupWorkspaceContext> {
  const context = await setupFetch<SetupWorkspaceContext>(
    "/api/users/setup/context",
    accessToken,
    { method: "GET" },
    "Could not read the workspace context."
  );
  return {
    currentTenant: context.currentTenant ?? null,
    userId: context.userId,
  };
}

export async function readCurrentTenant(
  accessToken: string
): Promise<{ id: string; name: string; slug: string } | null> {
  return (await readWorkspaceContext(accessToken)).currentTenant;
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
  /** Set on a personal space: the one person it belongs to. */
  ownerUserId: string | null;
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
 * Give the tenant its first space, named and keyed off the team's name, and
 * answer with the key `/s/<key>` routes on.
 *
 * Usually the trigger has already created a default space with the
 * placeholder key `company` — the key is what `/s/<key>/…` routes on, and
 * this is the one moment re-keying is free: nobody has a link to it yet. A
 * tenant with no default space (a trigger that did not fire, a database
 * migrated by hand) gets one created instead of an error the admin can only
 * skip past. The name is required: the trigger's "Company" is a placeholder,
 * not a default anyone should keep.
 */
export async function ensureFirstSpace(params: {
  accessToken: string;
  name: string;
}): Promise<{ key: string; name: string }> {
  const spaces = await setupFetch<SpaceRow[]>(
    "/api/spaces",
    params.accessToken,
    { method: "GET" },
    "Could not read the spaces."
  );
  const target = spaces.find((space) => space.isDefault);
  if (!target) {
    const name = params.name;
    const created = await setupFetch<SpaceRow>(
      "/api/spaces",
      params.accessToken,
      {
        body: {
          key: firstSpaceKey(
            name,
            spaces.map((space) => space.key)
          ),
          name,
        },
        method: "POST",
      },
      "Could not create the first space."
    );
    return { key: created.key, name: created.name };
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
  const key = firstSpaceKey(params.name, taken);
  await setupFetch(
    `/api/spaces/${encodeURIComponent(target.id)}/setup`,
    params.accessToken,
    {
      body: {
        key,
        mounts: mountsToSetupPayload(mounts),
        name: params.name,
      },
      method: "PUT",
    },
    "Could not save the space name."
  );
  return { key, name: params.name };
}

/**
 * The administrator's personal space — created by the database the moment
 * they joined the tenant (`core.ensure_personal_space`), private, no
 * members. Null only when that trigger did not fire.
 */
export async function readPersonalSpace(params: {
  accessToken: string;
  userId: string;
}): Promise<{ id: string; key: string; name: string } | null> {
  const spaces = await setupFetch<SpaceRow[]>(
    "/api/spaces",
    params.accessToken,
    { method: "GET" },
    "Could not read the spaces."
  );
  const own = spaces.find((space) => space.ownerUserId === params.userId);
  return own ? { id: own.id, key: own.key, name: own.name } : null;
}

/**
 * Rename the personal space. The key stays: `/s/me` resolves it for its
 * owner, so nothing routes by the name. Same echo-the-mounts rule as the
 * first space — `PUT /setup` reconciles the complete set.
 */
export async function namePersonalSpace(params: {
  accessToken: string;
  name: string;
  spaceId: string;
}): Promise<void> {
  const mounts = await setupFetch<SetupSpaceMount[]>(
    `/api/spaces/${encodeURIComponent(params.spaceId)}/mounts`,
    params.accessToken,
    { method: "GET" },
    "Could not read the space setup."
  );
  await setupFetch(
    `/api/spaces/${encodeURIComponent(params.spaceId)}/setup`,
    params.accessToken,
    {
      body: { mounts: mountsToSetupPayload(mounts), name: params.name },
      method: "PUT",
    },
    "Could not save the space name."
  );
}
