/**
 * Which Engenty answers a channel turn.
 *
 * One shared bot, many Engenties: a message reaches a specific agent by its
 * handle (`@sales what's open?`, `/to sales what's open?`), or by the
 * binding's default agent when the workspace was bound to one. Anything else
 * goes to the shared front door, `engenty.remote`.
 *
 * A row is addressable only when it opted in (`remoteEnabled`). A channel
 * turn that lands on an agent nobody exposed is a leak, so a handle that
 * names an unexposed or unknown agent is answered with a refusal — never
 * silently routed to the front door, which would run the request anyway
 * under a different mouth.
 */

import type { AgentConfig } from "@engenty/ai-core";

export const REMOTE_FRONT_DOOR_AGENT_ID = "engenty.remote";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** The handle a channel addresses an agent by: the row's, else the id's tail. */
export function remoteHandleFor(
  config: Pick<AgentConfig, "id"> & {
    remoteHandle?: string | null;
  }
): string {
  const explicit = config.remoteHandle?.trim().toLowerCase();
  if (explicit && HANDLE_PATTERN.test(explicit)) {
    return explicit;
  }
  const tail = (config.id.split(".").at(-1) ?? config.id).toLowerCase();
  const normalized = tail
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return HANDLE_PATTERN.test(normalized) ? normalized : config.id.toLowerCase();
}

export interface ParsedRemoteAddress {
  /** Lower-cased handle the message named. */
  handle: string;
  /** The message with the address stripped, trimmed. */
  text: string;
}

/**
 * `@handle rest` or `/to handle rest` at the start of a message. Only a
 * leading address counts — an `@name` mid-sentence is a mention, not a
 * routing instruction. Slack renders user mentions as `<@U…>` which never
 * matches the handle grammar, so those pass through untouched.
 */
export function parseRemoteAddress(text: string): ParsedRemoteAddress | null {
  const trimmed = text.trim();
  const at =
    /^@([A-Za-z0-9][A-Za-z0-9_-]{0,31})(?:[:,]|\s|$)\s*([\s\S]*)$/.exec(
      trimmed
    );
  if (at) {
    return { handle: at[1].toLowerCase(), text: at[2].trim() };
  }
  const to = /^\/to\s+@?([A-Za-z0-9][A-Za-z0-9_-]{0,31})\b\s*([\s\S]*)$/i.exec(
    trimmed
  );
  if (to) {
    return { handle: to[1].toLowerCase(), text: to[2].trim() };
  }
  return null;
}

export type RemoteTargetResolution =
  /** The shared front door — `engenty.remote` — answers. */
  | { kind: "front-door"; text: string }
  /** A specific Engenty answers, assembled as itself. */
  | { agent: AgentConfig; kind: "agent"; text: string }
  /** The message named an agent that is not reachable from channels. */
  | { handle: string; kind: "unreachable" };

export interface RemoteTargetInput {
  /** The binding's default agent (`module_remote.bindings.agent_id`). */
  bindingAgentId: string | null | undefined;
  /** All agents the tenant has; the handle lookup walks this list. */
  listAgents: () => Promise<AgentConfig[]>;
  text: string;
}

function isRemoteReachable(config: AgentConfig): boolean {
  return config.remoteEnabled === true;
}

export async function resolveRemoteTarget(
  input: RemoteTargetInput
): Promise<RemoteTargetResolution> {
  const address = parseRemoteAddress(input.text);
  if (address) {
    const agents = await input.listAgents();
    const match = agents.find(
      (config) =>
        config.id !== REMOTE_FRONT_DOOR_AGENT_ID &&
        remoteHandleFor(config) === address.handle
    );
    if (!(match && isRemoteReachable(match))) {
      return { handle: address.handle, kind: "unreachable" };
    }
    // An address with nothing after it ("@sales") still opens the turn: the
    // agent gets an empty prompt and greets, same as a bare mention.
    return { agent: match, kind: "agent", text: address.text || input.text };
  }

  const bindingAgentId = input.bindingAgentId?.trim();
  if (bindingAgentId && bindingAgentId !== REMOTE_FRONT_DOOR_AGENT_ID) {
    const agents = await input.listAgents();
    const bound = agents.find((config) => config.id === bindingAgentId);
    // A binding may name an agent that later turned remote off (or was
    // deleted). The turn still has to be answered by someone the person
    // expects to be there, so it falls back to the front door — logged by
    // the caller, not swallowed here.
    if (bound && isRemoteReachable(bound)) {
      return { agent: bound, kind: "agent", text: input.text };
    }
  }
  return { kind: "front-door", text: input.text };
}

/** The reply for an address nobody answers to. */
export function unreachableAgentReply(handle: string): string {
  return `No Engenty answers to @${handle} from here. Ask an admin to turn on "Reachable from channels" for it, or write without the @ to talk to the assistant.`;
}
