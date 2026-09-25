// Does a finished agent run need a human review, or is the task simply done?
//
// Reuses the ONE trust dial the platform already has — the agent-approval
// mode (the agent's own mode → its platform default → space
// `agent_approval_mode` → tenant `ai.config.agent_approval`; core uses the
// same rule to gate risky tools). `manual` means a human signs results off
// (`in_review` + a review to-do); `auto` and `pass-all` mean the agent's
// completed work IS done — the task closes and dependents dispatch without a
// click.
//
// Fail-soft to `review`: an unreadable layer must never silently widen agent
// autonomy.
import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import {
  type AgentApprovalMode,
  parseAgentApprovalMode,
  resolveAgentApprovalMode,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { getTenantDbFactoryFromEnv } from "../../infra/tenant-db.js";

const logger = createLogger({ name: "task-completion-policy" });

export type TaskCompletionPolicy = "complete" | "review";

export interface TaskCompletionPolicyDeps {
  /** The space's `agent_approval_mode` column, or null when unset/unknown. */
  loadSpaceMode: (tenantId: string, spaceId: string) => Promise<string | null>;
  /** The tenant `ai.config.agent_approval` prefs, or null when unset. */
  loadTenantPrefs: (tenantId: string) => Promise<{
    agents?: Record<string, string> | null;
    mode?: string | null;
  } | null>;
}

export interface ResolveApprovalModeInput {
  agentTypeKey: string | null;
  spaceId: string | null;
  tenantId: string;
}

/**
 * The ONE resolver for the run's effective agent-approval mode — the same
 * stored layers core's gate reads, through `resolveAgentApprovalMode`: the
 * per-agent mode decides when set, else the agent's platform default, else
 * the space's `agent_approval_mode`, else tenant `ai.config.agent_approval`. Both consumers derive
 * from it: the completion policy (done vs review) and the run's tool-gating
 * policy (request vs defer).
 * Fail-soft to `manual`: an unreadable layer must never silently widen agent
 * autonomy.
 */
export async function resolveEffectiveAgentApprovalMode(
  deps: TaskCompletionPolicyDeps,
  input: ResolveApprovalModeInput
): Promise<AgentApprovalMode> {
  try {
    const [prefs, spaceModeRaw] = await Promise.all([
      deps.loadTenantPrefs(input.tenantId).catch(() => null),
      input.spaceId
        ? deps.loadSpaceMode(input.tenantId, input.spaceId).catch(() => null)
        : Promise.resolve(null),
    ]);
    return resolveAgentApprovalMode({
      agentKey: input.agentTypeKey,
      agentMode: input.agentTypeKey
        ? parseAgentApprovalMode(prefs?.agents?.[input.agentTypeKey])
        : null,
      spaceMode: parseAgentApprovalMode(spaceModeRaw),
      tenantMode: parseAgentApprovalMode(prefs?.mode),
    });
  } catch (error) {
    logger.warn("approval mode unresolved — defaulting to manual", {
      message: error instanceof Error ? error.message : String(error),
      tenant_id: input.tenantId,
    });
    return "manual";
  }
}

export async function resolveTaskCompletionPolicy(
  deps: TaskCompletionPolicyDeps,
  input: ResolveApprovalModeInput
): Promise<TaskCompletionPolicy> {
  const mode = await resolveEffectiveAgentApprovalMode(deps, input);
  return mode === "manual" ? "review" : "complete";
}

/** Gated-operation behavior for a headless task run, derived from the dial. */
export type TaskRunGatingPolicy = "defer" | "request";

/**
 * The mode→policy mapping for tool gating in the task lane. `manual` keeps
 * today's behavior: the AI pre-gate parks the run on every `requiresApproval`
 * op that no durable grant covers ("request"). `auto`/`pass-all` skip the
 * pre-gate and let core decide ("defer") — core's resolver knows the mode AND
 * whether the space write-mounts the module, so medium-risk writes run without
 * a human while high/critical still 202 (which the execute tool translates
 * back into the same needs-approval park).
 */
export function taskRunGatingPolicy(
  mode: AgentApprovalMode
): TaskRunGatingPolicy {
  return mode === "manual" ? "request" : "defer";
}

/** Env-backed deps: tenant-settings row + `core.spaces` over the tenant lane. */
export function taskCompletionPolicyDepsFromEnv(): TaskCompletionPolicyDeps | null {
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return null;
  }
  return {
    loadSpaceMode: async (tenantId, spaceId) => {
      const db = factory.getTenantDb({ tenantId });
      const { data, error } = await db
        .schema("core")
        .from("spaces")
        .select("agent_approval_mode")
        .eq("id", spaceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return (data?.agent_approval_mode as string | null) ?? null;
    },
    loadTenantPrefs: async (tenantId) => {
      const repo = createTenantSettingsRepoSupabase(
        factory.getTenantDb({ tenantId }),
        tenantId,
        "default"
      );
      const result = await repo.get(TENANT_AI_CONFIG_KEY);
      const settings = parseTenantAiSettings(result?.value);
      return settings.agent_approval ?? null;
    },
  };
}
