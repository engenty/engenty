// HTTP + HITL helpers for agent_propose. Live hires POST the human create
// path; gated hires POST /propose and, when a human can answer, suspend with
// the same decision artifact requestDecision uses.

import {
  type AgentEngentyKind,
  createRequestDecisionArtifact,
  type RequestDecisionArtifact,
} from "@engenty/ai-core";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../frontend-tools/frontend-tool-suspend-lock.js";
import {
  withLiveHirePresentationTools,
  withLiveHireSkills,
} from "./agent-hire-policy.js";
import type { NativeRequestDecisionResumeData } from "./request-decision/native-request-decision.js";

/** What the agent is being hired FOR — decides the next step it is handed. */
export type HireForWork = "routine" | "tasks" | "chat";

export interface HireHttp {
  accessToken: string;
  baseUrl: string;
  fetchFn: typeof fetch;
}

export interface HireConfigBody {
  agentScope: "personal" | "shared";
  description: string;
  engenty: AgentEngentyKind;
  instructions: string;
  model?: string;
  name: string;
  proposed_by_agent: string | null;
  proposed_space_id: string | null;
  skillIds: string[];
  toolIds: string[];
}

interface JsonResponse {
  data: Record<string, unknown>;
  ok: boolean;
  status: number;
}

/** Registry HTTP with the run's bearer. Shared with `agent_self_revise`. */
export async function registryJson(
  http: HireHttp,
  path: string,
  init?: { body?: string; method?: string }
): Promise<JsonResponse> {
  const response = await http.fetchFn(`${http.baseUrl}${path}`, {
    method: init?.method ?? "GET",
    ...(init?.body ? { body: init.body } : {}),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${http.accessToken}`,
      "content-type": "application/json",
    },
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { data, ok: response.ok, status: response.status };
}

function failed(status: number, data: Record<string, unknown>, verb: string) {
  const error = typeof data.error === "string" ? data.error : null;
  return {
    ok: false as const,
    code: "agent_propose_failed",
    message: `agent_propose: ${verb} HTTP ${status}${error ? ` (${error})` : ""}`,
  };
}

export async function lookupExistingActive(
  http: HireHttp,
  agentId: string
): Promise<{ error: ReturnType<typeof failed> } | { existingActive: boolean }> {
  const result = await registryJson(
    http,
    `/ai/registry/agents/${encodeURIComponent(agentId)}`
  );
  if (result.status === 404) {
    return { existingActive: false };
  }
  if (!result.ok) {
    return { error: failed(result.status, result.data, "lookup") };
  }
  return { existingActive: true };
}

/**
 * What the model must do NEXT, in the terms it hired for.
 *
 * A hire for recurring work used to end on "message it with message_agent
 * now", which is the wrong next step and reads as completion: live on
 * 2026-08-24 the copilot hired an Inbox Contact Importer, announced it, and
 * created no routine — the agent existed and did nothing. A hired specialist
 * runs nothing until a routine gives it a job.
 */
function hiredNote(agentId: string, forWork: HireForWork): string {
  if (forWork === "routine") {
    return (
      "The agent is active and mounted, and has NO job yet. " +
      "Create its routine now: routines_create with " +
      `agent_id: "${agentId}", the full operating instructions ` +
      "(what to read, what to skip, what to write), and the schedule " +
      "(cron + IANA timezone) — all flat on the routine. Nothing runs until " +
      "you do; do not report the job as set up before that call returns."
    );
  }
  if (forWork === "tasks") {
    return "The agent is active and mounted — assign it a Task with tasks_create.";
  }
  return "The agent is active and mounted on this space — message it with message_agent now.";
}

export async function createAndMountAgent(
  http: HireHttp,
  agentId: string,
  body: HireConfigBody,
  spaceId: string,
  forWork: HireForWork
) {
  const result = await registryJson(http, "/ai/registry/agents", {
    body: JSON.stringify({
      agentScope: body.agentScope,
      description: body.description,
      engenty: body.engenty,
      id: agentId,
      instructions: body.instructions,
      model: body.model,
      name: body.name,
      skillIds: withLiveHireSkills(body.skillIds),
      source: "database",
      spaceIds: [spaceId],
      toolIds: withLiveHirePresentationTools(body.toolIds),
    }),
    method: "POST",
  });
  if (!result.ok) {
    return failed(result.status, result.data, "create");
  }
  const mounted = Array.isArray(result.data.mounted) ? result.data.mounted : [];
  return {
    ok: true as const,
    agent_id: agentId,
    mounted,
    note: hiredNote(agentId, forWork),
    status: "active" as const,
  };
}

export async function proposeAgentRecord(
  http: HireHttp,
  agentId: string,
  body: HireConfigBody
) {
  const result = await registryJson(
    http,
    `/ai/registry/agents/${encodeURIComponent(agentId)}/propose`,
    { body: JSON.stringify(body), method: "POST" }
  );
  if (!result.ok) {
    return failed(result.status, result.data, "propose");
  }
  const record =
    result.data.record && typeof result.data.record === "object"
      ? (result.data.record as {
          proposed_config?: unknown;
          status?: string;
        })
      : null;
  const pendingRevision = Boolean(record?.proposed_config);
  return {
    ok: true as const,
    agent_id: agentId,
    pending_revision: pendingRevision,
    status: record?.status ?? "proposed",
  };
}

/** Read Approve/Reject off a decision card's resume payload. */
export function readDecisionChoice(
  resume: NativeRequestDecisionResumeData
): "approve" | "dismiss" | "reject" | "unknown" {
  if (resume.cancelled) {
    return "dismiss";
  }
  const tokens = [
    resume.choice_id,
    resume.choice_label,
    ...(resume.choices ?? []).flatMap((choice) => [choice.id, choice.label]),
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  if (tokens.some((token) => token === "approve")) {
    return "approve";
  }
  if (tokens.some((token) => token === "reject")) {
    return "reject";
  }
  return "unknown";
}

export async function finalizeHireResume(input: {
  agentId: string;
  /** Why it was hired — survives the approval suspend on the tool's own input. */
  forWork: HireForWork;
  http: HireHttp;
  resume: NativeRequestDecisionResumeData;
  spaceId: string | null;
}) {
  const choice = readDecisionChoice(input.resume);
  if (choice === "dismiss" || choice === "unknown") {
    return {
      ok: true as const,
      agent_id: input.agentId,
      note:
        choice === "dismiss"
          ? "The user dismissed the hire card. The proposal stays pending on the coordinator desk waiting lane — do not assume it was approved."
          : "The user responded, but no Approve/Reject choice could be read. The proposal is still pending. Ask them to pick again.",
      status: "proposed" as const,
    };
  }
  const path =
    choice === "approve"
      ? `/ai/registry/agents/${encodeURIComponent(input.agentId)}/approve`
      : `/ai/registry/agents/${encodeURIComponent(input.agentId)}/reject`;
  const result = await registryJson(input.http, path, {
    body:
      choice === "approve" && input.spaceId
        ? JSON.stringify({ spaceId: input.spaceId })
        : JSON.stringify({}),
    method: "POST",
  });
  if (!result.ok) {
    return failed(result.status, result.data, choice);
  }
  if (choice === "reject") {
    return {
      ok: true as const,
      agent_id: input.agentId,
      note: "The user rejected this hire. The agent is not active and must not be assigned tasks.",
      status: "rejected" as const,
    };
  }
  const mounted = Array.isArray(result.data.mounted) ? result.data.mounted : [];
  return {
    ok: true as const,
    agent_id: input.agentId,
    mounted,
    note: `The user approved this hire. ${hiredNote(input.agentId, input.forWork)}`,
    status: "active" as const,
  };
}

export function hireDecisionArtifact(input: {
  description: string;
  id: string;
  instructions: string;
  name: string;
  skillIds: readonly string[];
  spaceId: string | null;
  toolIds: readonly string[];
}) {
  const tools = input.toolIds.length > 0 ? input.toolIds.join(", ") : "(none)";
  const skills =
    input.skillIds.length > 0 ? input.skillIds.join(", ") : "(none)";
  const spaceLine = input.spaceId
    ? `**Intended space:** ${input.spaceId}`
    : "No space is stamped — approve will ask for one, or pick it on the desk.";
  return {
    ...createRequestDecisionArtifact({
      title: `Hire ${input.name}?`,
      // Markdown: the card renders it, and the instruction block is long.
      body:
        `${input.name} (\`${input.id}\`) is waiting for approval before it can run.\n\n` +
        `${input.description}\n\n` +
        `- **Tools:** ${tools}\n- **Skills:** ${skills}\n- ${spaceLine}\n\n` +
        `**Instructions**\n\n${input.instructions}`,
      choices: [
        {
          id: "approve",
          label: "Approve",
          description: "Activate this agent and mount it on the space.",
        },
        {
          id: "reject",
          label: "Reject",
          description: "Discard the proposal. Nothing goes live.",
        },
      ],
    }),
    // The propose route already wrote `agent_proposed`. emitArtifactInterrupt
    // must not also file `agent_question` for this card.
    durable_inbox: true,
  };
}

export function hireSuspendLockKey(input: {
  orchestratorThreadId?: string | null;
  runId?: string | null;
  userFacingThreadId?: string | null;
}): string {
  return (
    input.orchestratorThreadId?.trim() ||
    input.userFacingThreadId?.trim() ||
    input.runId?.trim() ||
    "__untagged__"
  );
}

/** Park on a decision card, one per thread. Shared with `agent_remove`. */
export async function suspendHireDecision(input: {
  artifact: RequestDecisionArtifact;
  lockKey: string;
  suspend?: (payload: unknown) => Promise<unknown>;
}): Promise<undefined> {
  const ticket = await acquireFrontendToolSuspendSlot(input.lockKey);
  try {
    await input.suspend?.(input.artifact);
    releaseFrontendToolSuspendSlot(input.lockKey, ticket);
  } catch (error) {
    releaseFrontendToolSuspendSlot(input.lockKey, ticket);
    throw error;
  }
  return;
}
