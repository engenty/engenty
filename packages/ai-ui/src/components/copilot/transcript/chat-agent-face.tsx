"use client";

// The face beside an agent's bubbles: the agent's own portrait or blob, the
// same one its desk header and the Space roster show. Rows without an author
// are the desk's own agent's — the Copilot's blob on the Copilot's desk.

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { resolveAgentEngenty } from "@engenty/ai-core/browser";
import { BlobAvatar } from "@engenty/ui-core";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useAiAgentsQuery } from "../../../lib/admin/ai-runtime-queries.js";
import { AgentFace } from "../../agent-face.js";

export type ChatDeskAgent = Pick<
  AgentDeskAgent,
  "engenty" | "id" | "name" | "role"
>;

const ChatDeskAgentContext = createContext<ChatDeskAgent | null>(null);

export const ChatDeskAgentProvider = ChatDeskAgentContext.Provider;

type RuntimeAgent = NonNullable<
  ReturnType<typeof useAiAgentsQuery>["data"]
>["agents"][number];

const ChatAgentsContext = createContext<ReadonlyMap<
  string,
  RuntimeAgent
> | null>(null);

/**
 * The agents roster, read once for a whole transcript — every face looks
 * its agent up here instead of subscribing to the query itself.
 */
export function ChatAgentsProvider(props: {
  children: ReactNode;
  enabled: boolean;
}) {
  const agents = useAiAgentsQuery(props.enabled);
  const byId = useMemo(
    () =>
      agents.data
        ? new Map(agents.data.agents.map((agent) => [agent.id, agent]))
        : null,
    [agents.data]
  );
  return (
    <ChatAgentsContext.Provider value={byId}>
      {props.children}
    </ChatAgentsContext.Provider>
  );
}

export function ChatAgentFace(props: {
  agentId?: string | null;
  /** Moving while the agent works: the blob wobbles, the copilot thinks. */
  animated?: boolean;
  /** Blob to wear while the roster does not know the agent yet (a new hire). */
  engenty?: string;
  name?: string | null;
  size: number;
}) {
  const desk = useContext(ChatDeskAgentContext);
  const agents = useContext(ChatAgentsContext);
  const agentId = props.agentId ?? desk?.id ?? null;
  const agent = agentId ? agents?.get(agentId) : undefined;
  const deskAgent = desk && agentId === desk.id ? desk : null;
  if (deskAgent?.role === "copilot") {
    return (
      <BlobAvatar
        character="ember"
        className="[&_.blob-shadow]:hidden"
        size={props.size}
        state={props.animated ? "thinking" : "idle"}
      />
    );
  }
  return (
    <AgentFace
      animated={props.animated}
      avatarUrl={agent?.avatarUrl}
      kind={
        deskAgent
          ? deskAgent.engenty
          : agentId
            ? resolveAgentEngenty(agentId, agent?.engenty ?? props.engenty)
            : "round"
      }
      name={props.name ?? deskAgent?.name ?? undefined}
      size={props.size}
    />
  );
}
