/**
 * Guards for the destructive workspace tools (PLAN-space-data-agent-crud P1.6/P1.6b).
 *
 * Mastra 1.59 ships `mastra_workspace_delete` **ungated**, and it takes
 * `recursive: boolean` — so an agent can wipe a whole prefix of `/shared` in one
 * call, and until now nothing asked. `EXECUTE_COMMAND` already had the answer
 * (`loader.ts`): the per-tool `WorkspaceToolsConfig` carries
 * `{enabled, requireApproval}`, and `requireApproval` accepts a DYNAMIC value
 * that is evaluated at tool-EXECUTION time with the call's `args`.
 *
 * ## Why the dynamic form is what makes this work headless (P1.6b)
 *
 * An earlier reading called headless approval a blocker needing either a
 * suspension bridge or a fail-closed disable. Reading the lane changed the
 * answer. Because `requireApproval` runs at execution time, and because the
 * leaf lane runs its whole lifecycle inside `engentyToolsRunAls.run(...)`, the
 * closure can read `getEngentyToolsRunContext().approvalGrants` — the SAME
 * grants a gated module operation consults. So the headless flow becomes
 * identical to a gated module op: first call hits the gate and suspends, a
 * human approves, a grant is written, the re-dispatched run sees the grant and
 * the tool runs.
 *
 * **Never `requireApproval: false` for a destructive call.** That is fail-open,
 * and it is the one option that must not ship. Where this file cannot prove a
 * call is safe, it gates.
 *
 * ## What counts as safe
 *
 * A non-recursive delete inside the agent's OWN scratch (`/home`, `/task`, its
 * sandbox) is the agent tidying up after itself, and gating it would make the
 * approval card meaningless through sheer volume. Everything else — anything
 * recursive, anything on a shared or space mount, anything in `/data` — asks.
 */

import type { ToolApprovalSuspendPayload } from "../../../ai/tools/engenty-tools/lib/execute-approval.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { DATA_MOUNT_PATH, SPACE_MOUNT_PATH } from "./workspace-presets.js";

/**
 * Mounts an agent may treat as its own desk.
 *
 * `/home` is per-agent or per-user; `/task` is the run's own working folder.
 * Nothing here is shared with another principal, so a single-file delete inside
 * one destroys only the agent's own work.
 */
const OWN_SCRATCH_MOUNTS = ["/home", "/task", "/sandbox"] as const;

/**
 * Mounts where a delete reaches other people's work.
 *
 * `/shared` is the tenant commons, `/space` the space's, `/project` the
 * containment chain — every one of them is read by principals other than
 * this run. `/data` is worse than shared: a delete there is a module's records.
 */
const SHARED_MOUNTS = [
  "/shared",
  SPACE_MOUNT_PATH,
  "/project",
  DATA_MOUNT_PATH,
] as const;

function pathOf(args: Record<string, unknown>): string {
  const value = args.path ?? args.file_path ?? args.target;
  return typeof value === "string" ? value : "";
}

function isUnder(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount}/`);
}

/** True when the call takes children with it. */
export function isRecursiveDelete(args: Record<string, unknown>): boolean {
  return args.recursive === true;
}

/**
 * A grant id that names WHAT was approved, not merely which tool.
 *
 * Path-scoped on purpose: approving one recursive delete of
 * `/shared/old-imports` must not grant every future recursive delete the agent
 * thinks of. A grant is permission for a change, not for a capability.
 */
export function workspaceToolGrantId(
  toolName: string,
  args: Record<string, unknown>
): string {
  const path = pathOf(args);
  return path ? `workspace:${toolName}:${path}` : `workspace:${toolName}`;
}

/**
 * Does this specific call need a human first?
 *
 * Ordered so the dangerous cases are decided before the safe one: a recursive
 * delete asks wherever it points, including in the agent's own scratch, because
 * `recursive` on a path the agent chose is the call that empties a mount.
 */
export function workspaceDeleteNeedsApproval(
  args: Record<string, unknown>
): boolean {
  if (isRecursiveDelete(args)) {
    return true;
  }
  const path = pathOf(args);
  if (!path) {
    // A delete whose target we cannot read is a delete we cannot reason about.
    return true;
  }
  if (SHARED_MOUNTS.some((mount) => isUnder(path, mount))) {
    return true;
  }
  return !OWN_SCRATCH_MOUNTS.some((mount) => isUnder(path, mount));
}

/**
 * What a human is being asked to approve, in their words rather than the
 * tool's.
 *
 * An approval card reading `mastra_workspace_delete` tells a person nothing
 * they can decide on. "delete /shared/imports and everything in it" is the
 * same fact stated so the answer is obvious — and the cascade is named
 * explicitly, because that is the part someone approving in a hurry would
 * otherwise not see.
 */
export function describeWorkspaceToolCall(args: unknown): string {
  const record = (args ?? {}) as Record<string, unknown>;
  const path = pathOf(record);
  if (!path) {
    return "target not stated";
  }
  return isRecursiveDelete(record) ? `${path} and everything inside it` : path;
}

/**
 * Has this exact call already been approved for this run?
 *
 * Reads the run's grants from the engenty-tools ALS, which the leaf lane has
 * already entered by the time a tool executes. Outside that context — a chat
 * turn, a unit test — `getEngentyToolsRunContext()` simply yields no grants,
 * so the answer is no and the caller gates, which is the correct direction to
 * fail.
 */
function isGranted(toolName: string, args: Record<string, unknown>): boolean {
  try {
    const grants = getEngentyToolsRunContext().approvalGrants ?? [];
    return grants.includes(workspaceToolGrantId(toolName, args));
  } catch {
    return false;
  }
}

/**
 * The gate's pause, stated as the approval card every other gated call uses.
 *
 * A workspace tool is gated by Mastra's own `requireApproval`, so its pause
 * arrives carrying a tool name and args rather than an operation id. The card
 * needs the operation: it is the same {@link workspaceToolGrantId} the headless
 * lane records, so approving in chat writes the grant a later run — or the next
 * fire of a routine holding it — spends.
 */
export function workspaceApprovalSuspendPayload(gate: {
  args: Record<string, unknown>;
  toolName: string;
}): ToolApprovalSuspendPayload {
  return {
    kind: "tool_approval",
    operation_id: workspaceToolGrantId(gate.toolName, gate.args),
    requires_approval: true,
    risk_level: "high",
    title: `${gate.toolName} — ${describeWorkspaceToolCall(gate.args)}`,
  };
}

/**
 * The dynamic `requireApproval` for a destructive workspace tool.
 */
export function workspaceDeleteApprovalGate(toolName: string) {
  return ({ args }: { args: Record<string, unknown> }): boolean => {
    if (!workspaceDeleteNeedsApproval(args)) {
      return false;
    }
    return !isGranted(toolName, args);
  };
}

/**
 * The dynamic `requireApproval` for running a command in the sandbox.
 *
 * A STATIC `true` was unusable headless in the one place it matters most: a
 * routine fire would gate, park for a human, and — because the static answer
 * cannot see the grant that human wrote — gate again on the very next fire,
 * forever. Reading the grants makes an approval mean something: the first call
 * asks, the approval is recorded on the run's subject, and the re-dispatch (or
 * the next fire of a routine holding a standing grant) runs it.
 *
 * Its grant id names the TOOL, not a path — an `execute_command` call carries
 * no path, and a grant keyed on the command string would never be spendable
 * twice, since a model does not repeat itself verbatim. So this is the one
 * workspace grant that means "this subject may run commands", which is exactly
 * what a routine's standing allow-list is for.
 */
export function sandboxExecuteApprovalGate(toolName: string) {
  return ({ args }: { args: Record<string, unknown> }): boolean =>
    !isGranted(toolName, args);
}
