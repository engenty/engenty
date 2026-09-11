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
  /**
   * This host's ACTIVE thread is remembered per space (PLAN-space-chats.md).
   *
   * True for the copilot, and true of nothing else so far, because the copilot
   * is the one host that appears in every space under a single host key: the
   * dock opens on any page, and its persisted active thread is keyed by host
   * key alone. Without this, walking from Company into Marketing and opening
   * the dock resumes the Company thread — and the run's tools, connectors and
   * `/data` root come from the THREAD's space (`resolveRunSpace`), so the agent
   * quietly works in Company while the address bar says Marketing.
   *
   * The fix belongs on the STORAGE key, never on the host key: host key answers
   * "which UI surface", space answers "where", and minting `engenty:copilot@…`
   * as a host key would repoint every existing thread's binding and break every
   * host that is not space-aware.
   */
  spaceBound?: boolean;
}

const HOST_PROFILES: Record<string, EngentyThreadHostProfile> = {
  [ENGENTY_COPILOT_HOST_KEY]: {
    agentId: ACTIVE_COPILOT_AGENT_ID,
    hostKey: ENGENTY_COPILOT_HOST_KEY,
    listLimit: 80,
    listMode: "many",
    spaceBound: true,
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
