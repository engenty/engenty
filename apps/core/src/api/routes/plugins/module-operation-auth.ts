/**
 * Principal resolution for the module-operation and approval routes.
 */
import { AuthUnavailableError } from "../../../dal/core-users/auth.js";
import type { PrincipalContext } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { jsonApiError } from "../api-response.js";

/**
 * Overlay request headers onto a resolved principal. These claims only ever
 * narrow (space, driving agent, task/routine subject). Shared by every HTTP
 * edge so a header like `x-engenty-space-id` cannot be kept on module ops
 * and dropped on plugin routes — `scope=space` notification lists read it
 * off `auth.spaceId`.
 */
export function withRequestPrincipalHeaders(
  resolved: PrincipalContext,
  header: (name: string) => string | undefined
): PrincipalContext {
  const headerAgentId = header("x-engenty-agent-id");
  const headerGoalId = header("x-engenty-goal-id");
  const headerTaskId = header("x-engenty-task-id");
  const headerTriggerId = header("x-engenty-trigger-id");
  // CON-01: an engenty App drives core with the VIEWING USER's token, so every
  // policy that reads `principalType` sees an ordinary interactive user — and
  // the connections gate then stands aside for the AI pre-gate that, outside
  // chat, is not there. The App proxy marks its own calls; policies use it to
  // treat them as autonomous. Only ever ADDS an approval requirement, and only
  // the value "app" is recognised, so a forged header cannot widen anything.
  const headerOrigin = header("x-engenty-call-origin");
  // CN.3: the space the run is in, so a policy can intersect what the principal
  // may reach with what the space mounts. Taken on trust for the same reason as
  // the ids above — it only ever NARROWS. A caller naming a space they are not
  // in removes candidates from their own set; it cannot add one, because
  // sharing, capabilities and the connection's own policy still decide what is
  // in that set to begin with.
  const headerSpaceId = header("x-engenty-space-id")?.trim();
  return {
    ...resolved,
    ...(headerSpaceId ? { spaceId: headerSpaceId } : {}),
    agentId:
      resolved.principalType === "agent"
        ? resolved.principalId
        : (headerAgentId ?? resolved.agentId),
    ...(headerOrigin === "app" ? { callOrigin: "app" as const } : {}),
    goalId: headerGoalId ?? resolved.goalId,
    // Task/trigger the headless run is executing — subjects for task- and
    // routine-scoped approval grants, and (task) the link that lets an
    // approval resume the blocked task.
    taskId: headerTaskId ?? resolved.taskId,
    triggerId: headerTriggerId ?? resolved.triggerId,
  };
}

export async function requireAuth(
  c: {
    req: { header: (name: string) => string | undefined };
    json: (body: unknown, status?: number) => Response;
  },
  authProvider: AuthProvider
) {
  let resolved: Awaited<ReturnType<typeof authProvider.resolvePrincipal>>;
  try {
    resolved = await authProvider.resolvePrincipal(
      c.req.header("authorization")
    );
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      // The session could not be checked (auth server down/slow) — 503, not
      // 401. See AuthUnavailableError for why this distinction matters.
      return {
        error: jsonApiError(c, 503, {
          message: "Authentication service unavailable — please retry.",
        }),
        auth: null,
      };
    }
    throw error;
  }
  if (!resolved) {
    return {
      error: jsonApiError(c, 401, { message: "Unauthorized" }),
      auth: null,
    };
  }
  // Phase 4: surface the driving agent + goal so the escalation policy can
  // gate the band above the agent's grants. For an agent token the agent id IS
  // the principal; for chat act-as-user, apps/ai forwards it via headers. These
  // only ever ADD an approval requirement (never widen) — the token's own
  // capabilities remain the hard ceiling, checked upstream.
  return {
    auth: withRequestPrincipalHeaders(resolved, (name) => c.req.header(name)),
    error: null,
  };
}

/** Auth for audit API: engenty JWT or Supabase session (for UI users). */
export async function requireAuthForAudit(
  c: {
    req: {
      header: (name: string) => string | undefined;
      query: (key: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
  },
  authProvider: AuthProvider
): Promise<
  | { error: Response; auth: null }
  | { error: null; auth: { tenantId: string | null } }
> {
  const tenantId = await authProvider.resolveTenantForSession(
    c.req.header("authorization")
  );
  if (!tenantId) {
    return {
      error: jsonApiError(c, 401, { message: "Unauthorized" }),
      auth: null,
    };
  }
  return { error: null, auth: { tenantId } };
}
