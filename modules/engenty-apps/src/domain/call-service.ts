import type { AppsRepoSupabase } from "../dal/supabase.js";
import { type AppHostClient, appHostId } from "../lib/app-host-client.js";
import type { AppManifestAction, AppVersion } from "../schema/types.js";

export interface CallServiceDeps {
  appHost: AppHostClient | null;
  repo: AppsRepoSupabase;
  tenantId: string;
}

export interface CallAppInput {
  action: string;
  appId: string;
  /** Opaque handle, when the caller is an App backend rather than a user. */
  capability?: string;
  input?: unknown;
  sessionId?: string;
}

export interface CallAppResult {
  action: string;
  appId: string;
  output: unknown;
  status: number;
}

/**
 * An action is "privileged" when the manifest says it is high risk or
 * explicitly requires approval. The split matters because a gateway operation
 * declares its risk statically — so privileged actions ride a separate
 * operation (`app_call_privileged`) whose contract carries
 * `requiresApproval: true`, and therefore flows through the platform's
 * existing durable approval machinery unchanged. `app_call` refuses them.
 */
export function isPrivilegedAction(action: AppManifestAction): boolean {
  return action.risk === "high" || action.requiresApproval === true;
}

export async function resolveActiveVersion(
  repo: AppsRepoSupabase,
  appId: string
): Promise<AppVersion> {
  const app = await repo.getApp(appId);
  if (!app) {
    throw new Error("app_not_found");
  }
  if (app.status !== "active" || !app.active_version_id) {
    throw new Error("app_not_active");
  }
  const version = await repo.getVersion(app.active_version_id);
  if (!version) {
    throw new Error("app_version_not_found");
  }
  return version;
}

export async function callApp(
  deps: CallServiceDeps,
  input: CallAppInput,
  options: { allowPrivileged: boolean }
): Promise<CallAppResult> {
  const version = await resolveActiveVersion(deps.repo, input.appId);

  const action = version.manifest.actions.find(
    (candidate) => candidate.id === input.action
  );
  if (!action) {
    // Fail closed: an action the manifest does not declare does not exist,
    // even if the app's backend would happily serve that path.
    throw new Error("app_action_not_declared");
  }

  const privileged = isPrivilegedAction(action);
  if (privileged && !options.allowPrivileged) {
    throw new Error("app_action_requires_approval");
  }
  if (options.allowPrivileged && !privileged) {
    // Calling a low-risk action through the privileged operation would make a
    // human approve something the manifest says needs no approval.
    throw new Error("app_action_not_privileged");
  }

  if (!deps.appHost) {
    throw new Error("app_host_unavailable");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.capability) {
    // The App backend uses this to call back into engenty. It is opaque and
    // only meaningful at engenty's proxy.
    headers["x-engenty-capability"] = input.capability;
  }
  if (input.sessionId) {
    headers["x-engenty-session"] = input.sessionId;
  }

  const response = await deps.appHost.request(
    appHostId(deps.tenantId, input.appId),
    {
      body: JSON.stringify({
        input: input.input ?? null,
        session_id: input.sessionId ?? null,
      }),
      headers,
      method: "POST",
      path: `/${action.id}`,
    }
  );

  let output: unknown = response.body;
  try {
    output = response.body ? JSON.parse(response.body) : null;
  } catch {
    // Leave it as text — an App is allowed to answer with something that is
    // not JSON, and swallowing that as an error would be worse than passing
    // it through.
  }

  return {
    action: action.id,
    appId: input.appId,
    output,
    status: response.status,
  };
}
