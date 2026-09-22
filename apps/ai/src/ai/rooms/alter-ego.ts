// The alter ego: a person's copilot, seen by others.
//
// The copilot's own conversation with its person — the river — is private.
// But the copilot may step into a room on that person's behalf: it opens one
// from the river, or is added to one. There it is not "the copilot"; it is
// "Matthias' Copilot", a member the others can address and read like any
// specialist, while nothing of the river shows through.
//
// Two facts carry it:
// - the membership row (`ai.thread_agent.on_behalf_of_user_id`): whose
//   copilot sits in this room — set when it enters, read for every turn it
//   takes there, so the answer never depends on who triggered the turn;
// - the rows it writes (`thread_message.metadata`): the same person, by id
//   and by name, so a transcript read anywhere says who was speaking.

import type { ThreadStore } from "../../dal/threads/index.js";
import { resolveUserDisplayNames } from "../sessions/user-display-names.js";

export const MESSAGE_ON_BEHALF_OF_USER_KEY = "on_behalf_of_user_id";
export const MESSAGE_ON_BEHALF_OF_USER_NAME_KEY = "on_behalf_of_user_name";

export interface AlterEgo {
  userId: string;
  userName: string | null;
}

/** The person this agent sits in the room for, or null: not an alter ego. */
export async function resolveAlterEgo(input: {
  agentId: string;
  store: Pick<ThreadStore, "listAgentMembers">;
  tenantId: string;
  threadId: string;
}): Promise<AlterEgo | null> {
  const members = await input.store.listAgentMembers({
    tenantId: input.tenantId,
    threadId: input.threadId,
  });
  const userId = members.find(
    (member) => member.agent_id === input.agentId
  )?.on_behalf_of_user_id;
  if (!userId) {
    return null;
  }
  const names = await resolveUserDisplayNames([userId]);
  return { userId, userName: names.get(userId) ?? null };
}

/** Message metadata for a row the alter ego writes. */
export function alterEgoMetadata(
  alterEgo: AlterEgo | null | undefined
): Record<string, unknown> {
  if (!alterEgo) {
    return {};
  }
  return {
    [MESSAGE_ON_BEHALF_OF_USER_KEY]: alterEgo.userId,
    ...(alterEgo.userName
      ? { [MESSAGE_ON_BEHALF_OF_USER_NAME_KEY]: alterEgo.userName }
      : {}),
  };
}

/**
 * How the alter ego is named where the server writes prose — the message
 * header a colleague reads, a notification's line: "Matthias' Copilot",
 * never a second anonymous "Engenty Copilot". Falls back to the agent's
 * own name when the person's is unknown.
 */
export function alterEgoDisplayName(
  alterEgo: AlterEgo | null | undefined,
  agentName: string
): string {
  const name = alterEgo?.userName?.trim();
  if (!name) {
    return agentName;
  }
  return /[sxzß]$/i.test(name) ? `${name}' Copilot` : `${name}'s Copilot`;
}
