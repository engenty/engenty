import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  QueueServiceLike,
  SpaceAgentMountResolution,
} from "@engenty/plugin-sdk";
import type { createTasksRepoSupabase } from "../dal/supabase.js";
import type { Task } from "../schema/types.js";
import { fetchRegisteredAgentIds } from "./agent-key-validator.js";
import type { CoreGrantsWriter } from "./task-approval-service.js";

export type TasksRepo = ReturnType<typeof createTasksRepoSupabase>;

export type RepoOrFactory =
  | TasksRepo
  | ((
      auth: PluginAuthContext,
      recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
    ) => TasksRepo);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext,
  recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
): TasksRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth, recordAuditEvent);
  }
  return repoOrFactory;
}

export const tasksReadOp = (moduleCaps: string[]) => ({
  dryRunSupported: false,
  idempotent: true,
  moduleId: "tasks",
  requiredCapabilities: moduleCaps,
  requiresApproval: false,
  riskLevel: "low" as const,
});

/**
 * Ordinary task writes. Medium risk with `requiresApproval`: `manual`
 * mode still asks a human, `auto` passes once the space mounts the module's
 * write capability, `pass-all` never asks. Creating and updating tasks is the
 * coordinator's bread-and-butter — reversible, visible, in-platform — and
 * grading it `high` made every planning run stall on a blind approval no
 * matter how much trust the space had declared.
 */
export const tasksWriteOp = (moduleCaps: string[]) => ({
  dryRunSupported: false,
  idempotent: false,
  moduleId: "tasks",
  requiredCapabilities: moduleCaps,
  requiresApproval: true,
  riskLevel: "medium" as const,
});

/** Destructive writes (deletes): gated in every mode short of pass-all. */
export const tasksDestructiveOp = (moduleCaps: string[]) => ({
  dryRunSupported: false,
  idempotent: false,
  moduleId: "tasks",
  requiredCapabilities: moduleCaps,
  requiresApproval: true,
  riskLevel: "high" as const,
});

export interface TasksGatewayOptions {
  /** Base URL of apps/ai (e.g. http://localhost:3100). When absent, agent key validation is skipped. */
  aiBaseUrl?: string | null;
  /** Service JWT for apps/ai registry calls. When absent, agent key validation is skipped. */
  aiServiceJwt?: string | null;
  /** Core approval-grant writer (D2): the durable half of a tool approval,
   * spent by core-side gates via the run's forwarded task id. */
  coreGrantsFactory?: (auth: PluginAuthContext) => CoreGrantsWriter;
  /** Queue service for dispatching agent tasks. When absent, auto-dispatch is skipped. */
  queue?: QueueServiceLike | null;
  /** Core-owned Space mount lookup injected by the plugin host boundary. */
  resolveSpaceAgentMount?: (input: {
    agentTypeKey: string;
    spaceId: string;
    tenantId: string;
  }) => Promise<SpaceAgentMountResolution>;
  /** Resolves auth/default Space for checkout workspace bytes. Task-row
   * Space is preferred inside `performTaskCheckout`. */
  resolveSpaceId?: (auth: PluginAuthContext) => Promise<string | null>;
}

export async function validateAgentKey(
  agentTypeKey: string | null | undefined,
  options: TasksGatewayOptions | undefined
): Promise<void> {
  if (!agentTypeKey) {
    return;
  }
  const { aiBaseUrl, aiServiceJwt } = options ?? {};
  if (!(aiBaseUrl && aiServiceJwt)) {
    return;
  }
  const known = await fetchRegisteredAgentIds(aiBaseUrl, aiServiceJwt);
  if (!known.has(agentTypeKey)) {
    const err = new Error("unknown_agent_type_key") as Error & {
      details: unknown;
    };
    err.details = { agent_type_key: agentTypeKey, known: [...known] };
    throw err;
  }
}

export async function validateAgentAssignment(
  input: {
    agentTypeKey: string | null | undefined;
    spaceId?: string | null;
    tenantId?: string | null;
  },
  options: TasksGatewayOptions | undefined
): Promise<void> {
  const agentTypeKey = input.agentTypeKey?.trim();
  if (!agentTypeKey) {
    return;
  }

  // Unknown stays distinct from unmounted: registry identity is checked first.
  await validateAgentKey(agentTypeKey, options);

  const spaceId = input.spaceId?.trim();
  if (!spaceId) {
    // Intentional tenant-global work keeps the tenant registry policy only.
    return;
  }
  const tenantId = input.tenantId?.trim();
  if (!(tenantId && options?.resolveSpaceAgentMount)) {
    throw new Error("space_context_unresolved");
  }
  const resolution = await options.resolveSpaceAgentMount({
    agentTypeKey,
    spaceId,
    tenantId,
  });
  if (resolution !== "mounted") {
    throw new Error(resolution);
  }
}

export async function resolveAssignmentFallbackSpace(
  auth: PluginAuthContext,
  options: TasksGatewayOptions | undefined
): Promise<string | null> {
  if (!options?.resolveSpaceId) {
    return null;
  }
  try {
    return await options.resolveSpaceId(auth);
  } catch {
    throw new Error("space_context_unresolved");
  }
}

export function taskAssignmentValidator(
  options: TasksGatewayOptions | undefined
): ((task: Task) => Promise<void>) | undefined {
  if (
    !(
      options?.resolveSpaceAgentMount ||
      (options?.aiBaseUrl && options.aiServiceJwt)
    )
  ) {
    return;
  }
  return (task) =>
    validateAgentAssignment(
      {
        agentTypeKey: task.primary_assignee_agent_type_key,
        spaceId: task.space_id,
        tenantId: task.tenant_id,
      },
      options
    );
}
