import type { AgentConfig } from "@engenty/ai-core";

/** Matches `@engenty/engenty-remote/ai/remote` so apps/ai typechecks without it. */
export const ENGENTY_REMOTE_AGENT_ID = "engenty.remote";

const SPEC: string = "@engenty/engenty-remote/ai/remote";

export async function loadRemoteAgentConfig(): Promise<AgentConfig | null> {
  try {
    const mod = (await import(SPEC)) as {
      remoteAgentConfig: AgentConfig;
    };
    return mod.remoteAgentConfig;
  } catch {
    return null;
  }
}
