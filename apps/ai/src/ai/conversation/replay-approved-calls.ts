// Replay-once of tool calls that were approved while a headless run was parked.
//
// The durable-approval flow used to end at "grant written + task re-dispatched":
// the resumed model turn started over from the same brief and had to re-derive
// the gated call itself. Nothing made that exactly-once — on 2026-08-22 a
// coordinator resumed this way executed `tasks_create` twice (ENG-22 with no
// attribution, then ENG-23), because the re-briefed model both repeated the
// prepared call and re-issued a fresh one.
//
// Now the park records the exact gated call (operation + args), the approval
// resume hands it back through Mastra's suspend/resume payload (single-use:
// Mastra clears the payload when a resume claims the task), and THIS module
// executes it once — inside the delegated run's ALS, so attribution, space
// gating and the approval pre-gate all apply exactly as if the model had made
// the call — then tells the model what happened instead of asking it to try
// again.
import { executeEngentyTool } from "../../../ai/tools/engenty-tools/index.js";
import type { ApprovedResumeCall } from "../jobs/task-job-schema.js";

export interface ReplayApprovedCallsDeps {
  /** Executes one module operation; defaults to the standard execute tool. */
  execute: (
    operationId: string,
    input: Record<string, unknown>
  ) => Promise<unknown>;
}

const defaultDeps: ReplayApprovedCallsDeps = {
  execute: (operationId, input) =>
    executeEngentyTool(
      { id: operationId, input: JSON.stringify(input) },
      undefined
    ),
};

function renderResult(result: unknown): string {
  try {
    const text = JSON.stringify(result, null, 2) ?? String(result);
    // A tool result can be large (list payloads); the model only needs the
    // outcome, not an unbounded dump inside its brief.
    return text.length > 4000 ? `${text.slice(0, 4000)}\n… (truncated)` : text;
  } catch {
    return String(result);
  }
}

export interface ReplayedApprovedCall {
  operationId: string;
  result: unknown;
}

export interface ReplayApprovedCallsOutcome {
  /** Brief section describing what already ran; null when nothing replayed. */
  briefSection: string | null;
  replayed: ReplayedApprovedCall[];
}

/**
 * Execute each approved call exactly once and render the outcome as a brief
 * section for the resumed model turn.
 *
 * Must run inside the delegated run's `engentyToolsRunAls` scope: the execute
 * tool reads the bearer, agent identity, space and approval grants from there.
 * A call the grants still do not cover simply gates again (the pre-gate
 * returns `approval_pending` and records the ask via `onApprovalRequired`),
 * so a denied-then-redispatched run parks again rather than executing.
 *
 * Calls without recorded input cannot be replayed (pre-change parks, bulk
 * cards) and are skipped — the run then behaves exactly as before this
 * mechanism existed.
 */
export async function replayApprovedCalls(
  calls: readonly ApprovedResumeCall[] | undefined,
  deps: ReplayApprovedCallsDeps = defaultDeps
): Promise<ReplayApprovedCallsOutcome> {
  const replayable = (calls ?? []).filter(
    (call): call is ApprovedResumeCall & { input: Record<string, unknown> } =>
      Boolean(call.input)
  );
  if (replayable.length === 0) {
    return { briefSection: null, replayed: [] };
  }
  const replayed: ReplayedApprovedCall[] = [];
  const sections: string[] = [];
  for (const call of replayable) {
    let result: unknown;
    try {
      result = await deps.execute(call.operation_id, call.input);
    } catch (error) {
      result = {
        ok: false,
        error: "replay_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    replayed.push({ operationId: call.operation_id, result });
    const label = call.title
      ? `${call.title} (\`${call.operation_id}\`)`
      : `\`${call.operation_id}\``;
    sections.push(
      [`### ${label}`, "```json", renderResult(result), "```"].join("\n")
    );
  }
  const briefSection = [
    "## Approved while you were paused",
    "",
    "A human approved the tool call(s) this task was blocked on, and each has ALREADY been executed exactly once with the arguments you prepared. The results are below.",
    "",
    "Do NOT run these calls again — that would duplicate the side effect. Treat each result as your own successful tool call and continue the task from there. Only if a result below shows an error may you correct the arguments and retry that call.",
    "",
    ...sections,
  ].join("\n");
  return { briefSection, replayed };
}
