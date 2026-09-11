// How many turns agents may take in a room without a person saying a word.
//
// Depth used to bound the cost of agents talking to agents (a colleague could
// not message on). Rooms bound it where the money is spent instead: every
// agent turn counts, a human message resets the count, and at the budget the
// room pauses and asks. State lives in the thread's metadata so it survives
// restarts and every window reads the same number.

export const ROOM_TURN_BUDGET = 12;

/**
 * How many agents a room holds — Grok Bot's cap. One is enough: a named
 * room with one agent is not that agent's desk. Six at most: a room is a
 * shared outcome with visible hand-offs, not a broadcast list. People are
 * not counted.
 */
export const ROOM_MIN_AGENTS = 1;
export const ROOM_MAX_AGENTS = 6;

/** What the room is for, in the thread's metadata: one sentence every turn reads. */
export const ROOM_PURPOSE_KEY = "room_purpose";
export const ROOM_PURPOSE_MAX_CHARS = 500;

export function readRoomPurpose(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const raw = metadata?.[ROOM_PURPOSE_KEY];
  const text = typeof raw === "string" ? raw.trim() : "";
  return text ? text.slice(0, ROOM_PURPOSE_MAX_CHARS) : null;
}

export const ROOM_AGENT_TURNS_KEY = "agent_turns_since_human";
export const ROOM_PAUSED_KEY = "room_paused";

export interface RoomTurnState {
  agentTurns: number;
  paused: boolean;
}

export function readRoomTurnState(
  metadata: Record<string, unknown> | null | undefined
): RoomTurnState {
  const raw = metadata?.[ROOM_AGENT_TURNS_KEY];
  const agentTurns =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : 0;
  return { agentTurns, paused: metadata?.[ROOM_PAUSED_KEY] === true };
}

/** The patch a human message applies: the count restarts, a pause lifts. */
export const HUMAN_TURN_ROOM_PATCH = {
  [ROOM_AGENT_TURNS_KEY]: 0,
  [ROOM_PAUSED_KEY]: false,
} as const;

/** True when a room with this state may not take another agent turn. */
export function roomBudgetSpent(
  state: RoomTurnState,
  budget = ROOM_TURN_BUDGET
): boolean {
  return state.paused || state.agentTurns >= budget;
}
