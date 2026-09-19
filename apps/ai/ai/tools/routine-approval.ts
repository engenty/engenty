// When creating a routine needs a person, and what the card says.
//
// One trust dial, the agent-approval mode the platform already has (tenant
// `ai.config.agent_approval` → space `agent_approval_mode` → per-agent). It
// decides whether `routines_create` may write the row on its own:
//
// - `manual`: a person approves every routine, prompt or Workflow — one
//   inline card that, on Approve, publishes the Workflow AS THAT PERSON and
//   creates the routine in the same step;
// - `auto`: the model decides. It creates on its own, or sets `ask_first`
//   when the job is unclear or writes records, and the same card appears;
// - `pass-all`: no card.
//
// `approval_grants` are the exception on every setting: they let a fire run
// gated writes with nobody watching, so a person always confirms them.
//
// A run that cannot park (a headless task job, a routine's own run, a
// delegated child) has nobody to answer a card: where the card is required
// the call refuses and names who can do it instead; where the model merely
// asked for one, the routine is created and the Space hears about it.
import { createRequestDecisionArtifact } from "@engenty/ai-core";
import type { AgentApprovalMode } from "@engenty/plugin-sdk";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export type RoutineApprovalOutcome = "create" | "card" | "refuse";

export interface RoutineApprovalInput {
  /** The model asked for confirmation itself (`ask_first`). */
  askFirst: boolean;
  /** This run can park on a card a person answers. */
  canSuspend: boolean;
  /** The routine names operation ids a fire may run without asking. */
  hasGrants: boolean;
  mode: AgentApprovalMode;
}

/** Pure: the matrix above, in one place for the tool and its tests. */
export function decideRoutineApproval(
  input: RoutineApprovalInput
): RoutineApprovalOutcome {
  const required = input.mode === "manual" || input.hasGrants;
  if (required) {
    return input.canSuspend ? "card" : "refuse";
  }
  if (input.mode === "auto" && input.askFirst && input.canSuspend) {
    return "card";
  }
  return "create";
}

/** Why the card was required — the refusal names it when nobody can answer. */
export function routineApprovalRefusalNote(input: {
  coordinatorIds: readonly string[];
  hasGrants: boolean;
  routineName: string;
}): string {
  const why = input.hasGrants
    ? "it grants operations a fire may run without asking"
    : "this Space asks a person before an agent creates a routine";
  const who =
    input.coordinatorIds.length > 0
      ? `Hand it to a coordinator (${input.coordinatorIds.join(", ")}) with message_agent, or`
      : "Say so in your reply, so a person can";
  return (
    `'${input.routineName}' was not created: ${why}, and this run has nobody to ask. ` +
    `${who} create it from a chat where someone can approve the card.`
  );
}

export const ROUTINE_DECISION_CHOICE_APPROVE = "approve";
export const ROUTINE_DECISION_CHOICE_REJECT = "reject";

function wakeLine(input: RoutineCardInput): string {
  switch (input.kind) {
    case "schedule":
      return `**Wakes:** \`${input.cron ?? "?"}\` (${input.timezone ?? "UTC"})`;
    case "event":
      return `**Wakes:** on \`${input.resource ?? "?"}\` (${input.providerId ?? "module-events"})`;
    case "manual":
      return "**Wakes:** when a person presses it";
    default:
      return "**Wakes:** when someone asks for it in chat";
  }
}

export interface RoutineCardInput {
  agentId: string;
  approvalGrants: readonly string[];
  cron?: string | null;
  kind: "schedule" | "event" | "manual" | "agent";
  name: string;
  outcome?: string | null;
  /** The single-step body, when the routine is a prompt. */
  prompt?: string | null;
  providerId?: string | null;
  report: "quiet" | "desk_card" | "ask";
  resource?: string | null;
  timezone?: string | null;
  /** The Workflow it runs instead, and whether Approve also publishes it. */
  workflow?: { name: string; needsPublish: boolean } | null;
}

/** The one card: what it is, when it wakes, what Approve does. */
export function routineDecisionArtifact(input: RoutineCardInput) {
  const body = [
    `${input.agentId} wants a standing job.`,
    "",
    wakeLine(input),
    input.outcome ? `**Done means:** ${input.outcome}` : null,
    `**Reports:** ${input.report}`,
    input.approvalGrants.length > 0
      ? `**May run without asking:** ${input.approvalGrants.join(", ")}`
      : null,
    input.workflow
      ? `**Runs the Workflow** "${input.workflow.name}"${
          input.workflow.needsPublish ? " — Approve publishes it as you." : "."
        }`
      : null,
    input.prompt ? `\n**Each run:**\n\n${input.prompt}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return {
    ...createRequestDecisionArtifact({
      body,
      choices: [
        {
          id: ROUTINE_DECISION_CHOICE_APPROVE,
          label: "Approve",
          description: input.workflow?.needsPublish
            ? "Publish the Workflow and create the routine."
            : "Create the routine.",
        },
        {
          id: ROUTINE_DECISION_CHOICE_REJECT,
          label: "Reject",
          description: "Create nothing.",
        },
      ],
      title: `Create routine "${input.name}"?`,
    }),
  };
}

/** Same serialization key the other suspending tools use (one park per thread). */
export function routineSuspendLockKey(): string {
  const ctx = getEngentyToolsRunContext();
  return (
    ctx.orchestratorThreadId?.trim() ||
    ctx.userFacingThreadId?.trim() ||
    ctx.runId?.trim() ||
    "__untagged__"
  );
}

export async function suspendRoutineDecision(input: {
  artifact: ReturnType<typeof routineDecisionArtifact>;
  lockKey: string;
  suspend: (payload: unknown) => Promise<unknown>;
}): Promise<undefined> {
  const ticket = await acquireFrontendToolSuspendSlot(input.lockKey);
  try {
    await input.suspend(input.artifact);
    releaseFrontendToolSuspendSlot(input.lockKey, ticket);
  } catch (error) {
    releaseFrontendToolSuspendSlot(input.lockKey, ticket);
    throw error;
  }
  return;
}
