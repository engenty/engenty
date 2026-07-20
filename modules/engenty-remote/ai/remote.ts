// engenty.remote — chat-tuned front agent for external messengers.
// Same dynamic-dispatch toolset as the coordinator (catalog search/execute),
// different voice: short, precise, platform-safe formatting, deep links
// instead of rich UI. Persistent-by-design: tenant + scope resolve per event
// from the run context (see apps/ai remote-channels runtime), never at
// assembly time.

import type { AgentConfig } from "@engenty/ai-core";
import {
  loadAgentManifest,
  readAgentTextAsset,
  resolveChatModelId,
} from "@engenty/ai-core";

export const ENGENTY_REMOTE_AGENT_ID = "engenty.remote";

// Tools: catalog meta-tools resolve the tenant's gateway operations at call
// time (runtime context), which is what makes a persistent channel agent
// workable across tenants. registry lookup for delegation to specialists.
export const REMOTE_TOOL_IDS = [
  "engenty_tools_search",
  "engenty_tools_discover",
  "engenty_tool_execute",
  "registry_agents_list",
];

const remoteAssets = {
  agentId: ENGENTY_REMOTE_AGENT_ID,
  // Unlike coordinator (only ever loaded via jiti from source by apps/core),
  // this file is ALSO imported by apps/ai through the package exports — i.e.
  // from dist, where tsup places the shared chunk at the dist root. Cover all
  // three shapes: source (ai/ → agents/), dist entry (dist/ai/remote.js →
  // ../../ai/agents), dist chunk (dist/chunk-*.js → ../ai/agents).
  candidateRootSegments: [
    ["agents"],
    ["..", "..", "ai", "agents"],
    ["..", "ai", "agents"],
  ],
  importMetaUrl: import.meta.url,
} as const;

export function readRemoteAgentsMarkdown(): string {
  return readAgentTextAsset(remoteAssets, "AGENTS.md");
}

export function readRemoteSoulMarkdown(): string {
  return readAgentTextAsset(remoteAssets, "SOUL.md");
}

export function getRemoteManifest() {
  return loadAgentManifest(remoteAssets);
}

function buildRemoteSystemPrompt(): string {
  return [readRemoteAgentsMarkdown(), readRemoteSoulMarkdown()]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export const remoteAgentConfig: AgentConfig = {
  description:
    "Chat-tuned front agent for external messengers (Slack, Telegram, WhatsApp, Teams). Answers briefly, uses the full engenty tool catalog, links into the app instead of rendering rich UI.",
  id: ENGENTY_REMOTE_AGENT_ID,
  instructions: buildRemoteSystemPrompt(),
  // Chat purpose: conversational quality over routing latency; messenger
  // turns are short so cost stays bounded by the brevity contract.
  model: resolveChatModelId({ purpose: "chat" }),
  name: "Remote",
  skillIds: [],
  source: "module",
  toolIds: REMOTE_TOOL_IDS,
  // Staff preset: /home (agent-scoped rw), /shared (tenant rw), /skills (ro).
  // No sandbox — Remote only calls gateway operations.
  workspace: { enabled: true, preset: "staff" },
};
