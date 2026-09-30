/**
 * The workspace half of the initial setup: the administrator's copilot, the
 * space their work starts in with its apps and first engenty, and the team
 * this installation belongs to.
 *
 * Both already exist by the time the wizard asks. Creating the first admin
 * calls `ensureDefaultTenant`, which inserts the tenant named "Default Tenant"
 * and puts the admin in it, and a database trigger gives every tenant its
 * default "Company" space with the baseline mounts. So the wizard RENAMES what
 * is there — a second tenant created here would leave the admin signed in to
 * the first one, which is what the `engenty.app/<slug>` step used to do.
 */
import {
  type AgentEngentyKind,
  buildSpaceAgentHireInput,
  COPILOT_LOOK_USER_SETTING_NAME,
  firstEngentyDraft,
  spaceKeyFromName,
} from "@engenty/ai-core/browser";
import { TENANT_SETUP_DONE_SETTING } from "../routes/tenant-setup-path";
import { getApiBaseUrl } from "./api-client";
import { resolveAiServiceBaseUrl } from "./initial-setup-checks";
import {
  errorIfDatabaseUnavailableFromResponse,
  readResponseJsonLoose,
  readSetupApiErrorMessage,
} from "./initial-setup-gate";

const SETUP_REQUEST_TIMEOUT_MS = 10_000;

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
  init: {
    baseUrl?: string;
    body?: unknown;
    headers?: Record<string, string>;
    method: string;
  },
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(`${init.baseUrl ?? getApiBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init.headers,
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
        `${fallbackMessage} (HTTP ${response.status} — is the ${init.baseUrl ? "AI service" : "core API"} running?)`
      )
    );
  }
  const body = payload as { data?: T };
  return (body?.data ?? payload) as T;
}

export interface SetupWorkspaceContext {
  currentTenant: { id: string; name: string; slug: string } | null;
  /** The signed-in person's display name, or null when none is stored. */
  displayName: string | null;
  userId: string;
}

export async function readWorkspaceContext(
  accessToken: string
): Promise<SetupWorkspaceContext> {
  const context = await setupFetch<{
    currentTenant?: SetupWorkspaceContext["currentTenant"];
    currentUser?: { display_name: string | null; email: string | null };
    userId: string;
  }>(
    "/api/users/setup/context",
    accessToken,
    { method: "GET" },
    "Could not read the workspace context."
  );
  return {
    currentTenant: context.currentTenant ?? null,
    displayName:
      context.currentUser?.display_name?.trim() ||
      context.currentUser?.email?.split("@")[0] ||
      null,
    userId: context.userId,
  };
}

/** Mark the tenant set up: the app stops sending its admins to the wizard. */
export async function markTenantSetupDone(params: {
  accessToken: string;
}): Promise<void> {
  await setupFetch(
    `/api/tenant-settings/${encodeURIComponent(TENANT_SETUP_DONE_SETTING)}`,
    params.accessToken,
    { body: { type: "boolean", value_boolean: true }, method: "PATCH" },
    "Could not finish the setup."
  );
}

/**
 * The wizard's language becomes the tenant's: everyone without a language of
 * their own reads the app in it (`appearance.language`, user over tenant).
 */
export async function saveTenantLanguage(params: {
  accessToken: string;
  language: string;
}): Promise<void> {
  await setupFetch(
    "/api/tenant-settings/appearance.language",
    params.accessToken,
    {
      body: { type: "string", value_string: params.language },
      method: "PATCH",
    },
    "Could not save the language."
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
  const base = spaceKeyFromName(name).slice(0, 60) || "space";
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

/** What `GET /api/spaces/setup-catalog` answers: the mountable apps and the space templates. */
export interface SetupCatalog {
  baseline: SetupSpaceMount[];
  modules: {
    description: string | null;
    id: string;
    name: string;
    /** Module ids this one needs mounted alongside it. */
    requires: string[];
  }[];
  templates: {
    description: string;
    featuredMountKeys: string[];
    id: string;
    name: string;
  }[];
}

export async function readSetupCatalog(
  accessToken: string
): Promise<SetupCatalog> {
  return await setupFetch<SetupCatalog>(
    "/api/spaces/setup-catalog",
    accessToken,
    { method: "GET" },
    "Could not read the apps."
  );
}

/** The mount set `PUT /setup` takes: the baseline plus what is already there. */
function firstSpaceMounts(params: {
  baseline: readonly SetupSpaceMount[];
  existing: readonly SetupSpaceMount[];
}): Record<string, string>[] {
  const seen = new Set<string>();
  const set = [...params.baseline, ...params.existing].filter((mount) => {
    const id = `${mount.resourceType}:${mount.resourceKey}`;
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  return mountsToSetupPayload(set);
}

/** Open: everyone in the team finds it. Private: only its members. */
export type SpaceVisibility = "open" | "private";

/**
 * Give the tenant its first space: named, keyed off the name, in its colour
 * and icon, open or private, its apps left as they are, and answer with its id (the first engenty is hired into it)
 * and the key `/s/<key>` routes on.
 *
 * Usually the trigger has already created a default space with the
 * placeholder key `company` — this is the one moment re-keying is free:
 * nobody has a link to it yet. The person setting it up becomes its owner
 * first, so a private space does not shut them out; a created space adds its
 * creator itself. A tenant with no default space (a trigger that
 * did not fire, a database migrated by hand) gets one created instead.
 */
export async function ensureFirstSpace(params: {
  accessToken: string;
  baseline: readonly SetupSpaceMount[];
  color: string;
  /** Null shows the name's initials. */
  icon: string | null;
  name: string;
  userId: string;
  visibility: SpaceVisibility;
}): Promise<{ id: string; key: string; name: string }> {
  const spaces = await setupFetch<SpaceRow[]>(
    "/api/spaces",
    params.accessToken,
    { method: "GET" },
    "Could not read the spaces."
  );
  const target = spaces.find((space) => space.isDefault);
  if (!target) {
    const created = await setupFetch<{ space: SpaceRow }>(
      "/api/spaces",
      params.accessToken,
      {
        body: {
          key: firstSpaceKey(
            params.name,
            spaces.map((space) => space.key)
          ),
          color: params.color,
          icon: params.icon,
          mounts: firstSpaceMounts({ baseline: params.baseline, existing: [] }),
          name: params.name,
          visibility: params.visibility,
        },
        method: "POST",
      },
      "Could not create the first space."
    );
    return {
      id: created.space.id,
      key: created.space.key,
      name: created.space.name,
    };
  }
  const existing = await setupFetch<SetupSpaceMount[]>(
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
    `/api/spaces/${encodeURIComponent(target.id)}/members/${encodeURIComponent(params.userId)}`,
    params.accessToken,
    { body: { role: "owner" }, method: "PUT" },
    "Could not join the space."
  );
  await setupFetch(
    `/api/spaces/${encodeURIComponent(target.id)}/setup`,
    params.accessToken,
    {
      body: {
        color: params.color,
        icon: params.icon,
        key,
        mounts: firstSpaceMounts({ baseline: params.baseline, existing }),
        name: params.name,
        visibility: params.visibility,
      },
      method: "PUT",
    },
    "Could not save the space."
  );
  return { id: target.id, key, name: params.name };
}

/** What the space's engenties may do on its computer, and when they ask. */
export interface SpaceWorkRules {
  approvalMode: "manual" | "auto" | "pass-all";
  /** The space browser: start it without asking; use it in unattended runs. */
  browser: { autostart: boolean; unattended: boolean };
}

/**
 * Save the space's approval mode and browser grant. `PUT
 * /setup` replaces the whole mount set, so what the space has goes back as it
 * is. The browser grant is the space owner's; the wizard made the person one.
 */
export async function saveSpaceWorkRules(params: {
  accessToken: string;
  rules: SpaceWorkRules;
  spaceId: string;
}): Promise<void> {
  const path = `/api/spaces/${encodeURIComponent(params.spaceId)}`;
  const existing = await setupFetch<SetupSpaceMount[]>(
    `${path}/mounts`,
    params.accessToken,
    { method: "GET" },
    "Could not read the space setup."
  );
  await setupFetch(
    `${path}/setup`,
    params.accessToken,
    {
      body: {
        agent_approval_mode: params.rules.approvalMode,
        mounts: mountsToSetupPayload(existing),
      },
      method: "PUT",
    },
    "Could not save the space."
  );
  await setupFetch(
    `${path}/browser-grant`,
    params.accessToken,
    { body: params.rules.browser, method: "PUT" },
    "Could not save the browser permissions."
  );
}

/**
 * Mount apps into the space, next to what it has: each with write access for
 * its engenties, as the space setup dialog adds them.
 */
export async function addSpaceApps(params: {
  accessToken: string;
  modules: readonly string[];
  spaceId: string;
}): Promise<void> {
  await setupFetch(
    `/api/spaces/${encodeURIComponent(params.spaceId)}/setup/add`,
    params.accessToken,
    {
      body: {
        mounts: mountsToSetupPayload(
          params.modules.map((resourceKey) => ({
            agentAccess: "write",
            resourceKey,
            resourceType: "module",
          }))
        ),
      },
      method: "POST",
    },
    "Could not add the apps."
  );
}

/** The engenty a first space starts with, as the setup wizard shapes it. */
export interface FirstEngentyChoice {
  engenty: AgentEngentyKind;
  /** The standing job, in the person's words. */
  job: string;
  name: string;
}

/**
 * Hire the space's first engenty through the AI service — the same registry
 * write and mount the in-app hire wizard makes (`firstEngentyDraft`). The
 * service posts its welcome in `language`.
 */
export async function hireFirstEngenty(params: {
  accessToken: string;
  choice: FirstEngentyChoice;
  language: string;
  space: { id: string; name: string };
}): Promise<{ id: string; name: string }> {
  const draft = firstEngentyDraft(params.space.name, null);
  const input = buildSpaceAgentHireInput(
    {
      ...draft,
      description: params.choice.job.trim() || draft.description,
      engenty: params.choice.engenty,
      name: params.choice.name.trim() || draft.name,
    },
    params.space.id
  );
  const result = await setupFetch<{
    mounted?: { error?: string; ok: boolean; spaceId: string }[];
  }>(
    "/ai/registry/agents",
    params.accessToken,
    {
      baseUrl: resolveAiServiceBaseUrl(),
      body: input,
      headers: { "accept-language": params.language },
      method: "POST",
    },
    "Could not hire the engenty."
  );
  const mount = result.mounted?.find((m) => m.spaceId === params.space.id);
  if (!mount?.ok) {
    throw new Error(
      mount?.error ?? "The engenty was created but not added to the space."
    );
  }
  return { id: input.id, name: input.name };
}

/** Saves the face the person picked for their copilot, as their own setting. */
export async function saveCopilotLook(params: {
  accessToken: string;
  look: AgentEngentyKind;
}): Promise<void> {
  await setupFetch(
    `/api/user-settings/${encodeURIComponent(COPILOT_LOOK_USER_SETTING_NAME)}`,
    params.accessToken,
    { body: { type: "string", value_string: params.look }, method: "PATCH" },
    "Could not save your copilot's look."
  );
}

/** The copilot's registry id — the one personal agent every person has. */
const COPILOT_AGENT_ID = "engenty.copilot";

/**
 * Open the administrator's copilot: its one private conversation, tenant-wide
 * (`POST /ai/threads/dm` with no space). The first open creates it and leaves
 * the copilot's welcome in `language`; any later open answers the same thread.
 */
export async function openCopilot(params: {
  accessToken: string;
  language: string;
}): Promise<{ created: boolean }> {
  const result = await setupFetch<{ created: boolean }>(
    "/ai/threads/dm",
    params.accessToken,
    {
      baseUrl: resolveAiServiceBaseUrl(),
      body: { agent_id: COPILOT_AGENT_ID, ui_language: params.language },
      method: "POST",
    },
    "Could not start the copilot."
  );
  return { created: result.created };
}
