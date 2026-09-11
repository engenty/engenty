/**
 * Execution context passed to tools when running in copilot chat.
 *
 * Rules: Use `callGatewayMethod` for DAL/API (e.g. contacts.get); use `scope`
 * for module-defined context (e.g. scope.entityId for current contact).
 */
export interface ToolExecutionContext {
  /** Current action/route key. */
  action: string;
  /** Bound agent definition id (e.g. `engenty.copilot`) when running an agent invocation. */
  agentId?: string | null;
  /** Call API gateway method (plugin API). */
  callGatewayMethod?: (
    name: string,
    input: unknown,
    opts?: { auth?: unknown }
  ) => Promise<unknown>;
  /** Current module. */
  moduleId: string;
  /** Durable orchestrator session id for this chat turn (when bound). */
  orchestratorThreadId?: string | null;
  /** Module-defined scope (e.g. { entityId, entity } for contacts). */
  scope: Record<string, unknown> | null;
  /** Scope ID from auth context. */
  scopeId: string | null;
  /**
   * True when this agent is activated in the Space rather than merely running
   * inside one. Distinct from {@link spaceId}: a resolved Space without
   * confinement still forwards `spaceId` so space-owned records default there.
   */
  spaceConfined?: boolean;
  /**
   * Active Space for this run, when resolved. Absent/null is intentional
   * tenant-global — never a stand-in for a claimed Space that failed to load.
   */
  spaceId?: string | null;
  /** Tenant ID from auth context. */
  tenantId: string | null;
  /** Authenticated user id (`execution_scope.user_id`) for this invocation. */
  userId?: string | null;
}
