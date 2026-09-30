/**
 * Which memory entries a run sees and writes — decided here and nowhere else.
 * The rendered block and the `memory_note` / `memory_forget` tools both read
 * this one answer, so what an agent is shown and what it may change never
 * disagree.
 *
 * - `company`: every run that knows where it is.
 * - `space`: runs in that Space.
 * - `user`: only on a person's private line — never in a room, a shared
 *   Space thread or an unattended run, where others read the transcript.
 * - `agent`: the agent's own notes, keyed on its person (personal agents),
 *   the Space it runs in, or the company when it runs outside a Space.
 *
 * A run whose Space could not be resolved sees nothing: a failed Space must
 * not become the company.
 */

import type { MemoryScope } from "@engenty/ai-core";
import {
  isGlobalConnectorGate,
  isUnresolvedSpaceGate,
  type SpaceGateContext,
} from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import type { MemoryKey } from "../../dal/memory/index.js";
import { threadKind } from "../../dal/threads/types.js";
import type { RunSpaceResolution } from "../sessions/run-space.js";

/** Where a run happens, as far as memory is concerned. */
export type MemoryPlace =
  | { kind: "company" }
  | { kind: "space"; spaceId: string }
  | { kind: "unresolved" };

export interface MemoryRunIdentity {
  agentId: string;
  agentScope?: "personal" | "shared" | null;
  place: MemoryPlace;
  /**
   * The person on the other end, when the run is that person's private line
   * with the agent. Null in rooms, shared Space threads and unattended runs.
   */
  privateSpeakerUserId: string | null;
  tenantId: string;
  /** The human the run acts for (`scopeAttributionUserId`); null for a service. */
  userId: string | null;
}

export type MemoryKeys = Partial<Record<MemoryScope, MemoryKey>>;

export function memoryPlaceFromResolution(
  resolution: RunSpaceResolution
): MemoryPlace {
  if (resolution.kind === "resolved") {
    return { kind: "space", spaceId: resolution.space.spaceId };
  }
  return resolution.kind === "global"
    ? { kind: "company" }
    : { kind: "unresolved" };
}

/** The same answer from a delegated run's tool gate; no gate is a run outside a Space. */
export function memoryPlaceFromGate(
  space: SpaceGateContext | null | undefined
): MemoryPlace {
  if (isUnresolvedSpaceGate(space)) {
    return { kind: "unresolved" };
  }
  if (!space || isGlobalConnectorGate(space)) {
    return { kind: "company" };
  }
  return { kind: "space", spaceId: space.spaceId };
}

/**
 * Whether only the person speaking reads this thread: a DM, or a desk thread
 * that is theirs alone (not Space-keyed, `sharedRoom`). Never a room, a pair,
 * a run, or a shared Space desk. No thread row at all (a messenger channel)
 * is not private either.
 */
export function isPrivateLine(input: {
  sharedRoom: boolean;
  thread?: { route_context?: Record<string, unknown> | null } | null;
}): boolean {
  if (!input.thread) {
    return false;
  }
  const kind = threadKind({ route_context: input.thread.route_context ?? {} });
  return kind === "dm" || (kind === "desk" && !input.sharedRoom);
}

/**
 * The keys a writer nobody asked — a chapter cut, the observer — may write:
 * only those whose readers are already the conversation's readers. A private
 * line keeps what it learns for that person — the `user` scope, and a
 * personal agent's own notes; a shared conversation (a Space desk) keeps it
 * for the Space — `space`, and a shared agent's notes. Nothing goes to the
 * company without an approval, so never from here.
 */
export function unaskedWriteKeys(
  keys: MemoryKeys,
  input: {
    agentScope?: "personal" | "shared" | null;
    privateLine: boolean;
  }
): MemoryKeys {
  const personal = input.agentScope === "personal";
  if (input.privateLine) {
    return {
      ...(keys.user ? { user: keys.user } : {}),
      ...(personal && keys.agent ? { agent: keys.agent } : {}),
    };
  }
  return {
    ...(keys.space ? { space: keys.space } : {}),
    ...(!personal && keys.agent ? { agent: keys.agent } : {}),
  };
}

/** The keys a chapter cut of a DM or a desk may write (`unaskedWriteKeys`). */
export function memoryKeysForChapter(input: {
  agentId: string;
  agentScope?: "personal" | "shared" | null;
  kind: "desk" | "dm";
  spaceId: string | null;
  tenantId: string;
  userId: string;
}): MemoryKeys {
  const place: MemoryPlace = input.spaceId
    ? { kind: "space", spaceId: input.spaceId }
    : { kind: "company" };
  const privateLine = input.kind === "dm";
  const keys = memoryKeysForRun({
    agentId: input.agentId,
    agentScope: input.agentScope,
    place,
    privateSpeakerUserId: privateLine ? input.userId : null,
    tenantId: input.tenantId,
    userId: input.userId,
  });
  return unaskedWriteKeys(keys, {
    agentScope: input.agentScope,
    privateLine,
  });
}

/** The keys this run may read and write, by scope. Empty when it may not. */
export function memoryKeysForRun(identity: MemoryRunIdentity): MemoryKeys {
  const { place } = identity;
  if (place.kind === "unresolved") {
    return {};
  }
  const keys: MemoryKeys = { company: { scope: "company" } };
  if (place.kind === "space") {
    keys.space = { scope: "space", spaceId: place.spaceId };
  }
  if (identity.privateSpeakerUserId) {
    keys.user = { scope: "user", userId: identity.privateSpeakerUserId };
  }
  if (identity.agentScope === "personal") {
    // A personal agent's notes follow its person across Spaces; without a
    // person (a service run) it has none.
    if (identity.userId) {
      keys.agent = {
        agentId: identity.agentId,
        scope: "agent",
        spaceId: null,
        userId: identity.userId,
      };
    }
  } else {
    keys.agent = {
      agentId: identity.agentId,
      scope: "agent",
      spaceId: place.kind === "space" ? place.spaceId : null,
      userId: null,
    };
  }
  return keys;
}
