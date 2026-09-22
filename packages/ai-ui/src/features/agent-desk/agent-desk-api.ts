import type { AgentDeskFeed } from "@engenty/ai-core/browser";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export function getAgentDeskFeed(
  input: {
    agent_id: string;
    cursor?: string;
    limit?: number;
    locale?: string;
    /** Absent for the copilot's desk outside a space. */
    space_id?: string | null;
  },
  signal?: AbortSignal
): Promise<AgentDeskFeed> {
  const query = new URLSearchParams({ agent_id: input.agent_id });
  if (input.space_id) {
    query.set("space_id", input.space_id);
  }
  if (input.cursor) {
    query.set("cursor", input.cursor);
  }
  if (input.limit) {
    query.set("limit", String(input.limit));
  }
  if (input.locale) {
    query.set("locale", input.locale);
  }
  return requestAiServiceJson<AgentDeskFeed>(
    `/ai/v1/agent-desk/feed?${query.toString()}`,
    { signal }
  );
}

export interface AgentDeskGeneratedStarters {
  enabled: boolean;
  starters: AgentDeskFeed["agent"]["starters"];
}

export function getAgentDeskGeneratedStarters(
  input: {
    agent_id: string;
    locale?: string;
    space_id: string;
  },
  signal?: AbortSignal
): Promise<AgentDeskGeneratedStarters> {
  const query = new URLSearchParams({
    agent_id: input.agent_id,
    space_id: input.space_id,
  });
  if (input.locale) {
    query.set("locale", input.locale);
  }
  return requestAiServiceJson<AgentDeskGeneratedStarters>(
    `/ai/v1/agent-desk/starters?${query.toString()}`,
    { signal }
  );
}

/** The agent's MEMORY.md for this Space — its own notes, human-editable. */
export interface AgentDeskMemory {
  enabled: boolean;
  max_chars: number;
  memory: string;
}

/** A personal-scope agent's pads are one row per person; no space needed. */
function memoryQuery(input: { agent_id: string; space_id: string | null }) {
  const query = new URLSearchParams({ agent_id: input.agent_id });
  if (input.space_id) {
    query.set("space_id", input.space_id);
  }
  return query.toString();
}

export function getAgentDeskMemory(
  input: { agent_id: string; space_id: string | null },
  signal?: AbortSignal
): Promise<AgentDeskMemory> {
  return requestAiServiceJson<AgentDeskMemory>(
    `/ai/v1/agent-desk/memory?${memoryQuery(input)}`,
    { signal }
  );
}

export function putAgentDeskMemory(input: {
  agent_id: string;
  memory: string;
  space_id: string | null;
}): Promise<AgentDeskMemory> {
  return requestAiServiceJson<AgentDeskMemory>(
    `/ai/v1/agent-desk/memory?${memoryQuery(input)}`,
    { body: JSON.stringify({ memory: input.memory }), method: "PUT" }
  );
}

/** The agent's TASKS.md for this Space — its own open items and goals, human-editable. */
export interface AgentDeskTasks {
  enabled: boolean;
  max_chars: number;
  tasks: string;
}

export function getAgentDeskTasks(
  input: { agent_id: string; space_id: string | null },
  signal?: AbortSignal
): Promise<AgentDeskTasks> {
  return requestAiServiceJson<AgentDeskTasks>(
    `/ai/v1/agent-desk/tasks?${memoryQuery(input)}`,
    { signal }
  );
}

export function putAgentDeskTasks(input: {
  agent_id: string;
  space_id: string | null;
  tasks: string;
}): Promise<AgentDeskTasks> {
  return requestAiServiceJson<AgentDeskTasks>(
    `/ai/v1/agent-desk/tasks?${memoryQuery(input)}`,
    { body: JSON.stringify({ tasks: input.tasks }), method: "PUT" }
  );
}

export interface AgentDeskWelcome {
  created: boolean;
  thread_id: string;
}

/** Open the desk if needed and leave a first message when the hire is still silent. */
export function postAgentDeskWelcome(input: {
  agent_id: string;
  locale?: string;
  space_id: string;
}): Promise<AgentDeskWelcome> {
  const query = new URLSearchParams({
    agent_id: input.agent_id,
    space_id: input.space_id,
  });
  if (input.locale) {
    query.set("locale", input.locale);
  }
  return requestAiServiceJson<AgentDeskWelcome>(
    `/ai/v1/agent-desk/welcome?${query.toString()}`,
    { method: "POST" }
  );
}
