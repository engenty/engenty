import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
} from "../agent-provider/host-keys.js";

export type EngentyThreadHostListMode = "many" | "single" | "none";

export interface EngentyThreadHostProfile {
  /** Registry agent slug used when creating threads for this host. */
  agentId: string;
  hostKey: string;
  /** Default page size for `GET /ai/threads` when `listMode === "many"`. */
  listLimit: number;
  listMode: EngentyThreadHostListMode;
}

const HOST_PROFILES: Record<string, EngentyThreadHostProfile> = {
  [ENGENTY_COPILOT_HOST_KEY]: {
    agentId: ACTIVE_COPILOT_AGENT_ID,
    hostKey: ENGENTY_COPILOT_HOST_KEY,
    listLimit: 80,
    listMode: "many",
  },
};

const DEFAULT_SINGLE_HOST_PROFILE = (
  hostKey: string,
  agentId: string
): EngentyThreadHostProfile => ({
  agentId,
  hostKey,
  listLimit: 20,
  listMode: "single",
});

export function resolveEngentyThreadHostProfile(
  hostKey: string,
  agentId?: string | null
): EngentyThreadHostProfile {
  const trimmed = hostKey.trim();
  const known = HOST_PROFILES[trimmed];
  if (known) {
    return known;
  }
  const resolvedAgentId =
    agentId?.trim() || trimmed.split(":")[0] || "engenty.copilot";
  if (trimmed.startsWith("chatbot:")) {
    return {
      agentId: resolvedAgentId,
      hostKey: trimmed,
      listLimit: 20,
      listMode: "single",
    };
  }
  if (trimmed.includes(":action:")) {
    return DEFAULT_SINGLE_HOST_PROFILE(trimmed, resolvedAgentId);
  }
  if (trimmed === "kb:search") {
    return {
      agentId: agentId?.trim() || "knowledge-base.manager",
      hostKey: trimmed,
      listLimit: 80,
      listMode: "many",
    };
  }
  return DEFAULT_SINGLE_HOST_PROFILE(trimmed, resolvedAgentId);
}
