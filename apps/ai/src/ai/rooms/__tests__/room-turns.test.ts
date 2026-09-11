import { describe, expect, it } from "vitest";
import {
  ROOM_AGENT_TURNS_KEY,
  ROOM_PAUSED_KEY,
  ROOM_TURN_BUDGET,
  readRoomTurnState,
  roomBudgetSpent,
} from "../room-turns.js";

describe("room turn budget", () => {
  it("reads a missing or malformed state as fresh", () => {
    expect(readRoomTurnState(undefined)).toEqual({
      agentTurns: 0,
      paused: false,
    });
    expect(
      readRoomTurnState({ [ROOM_AGENT_TURNS_KEY]: "9", [ROOM_PAUSED_KEY]: 1 })
    ).toEqual({ agentTurns: 0, paused: false });
    expect(readRoomTurnState({ [ROOM_AGENT_TURNS_KEY]: -2 })).toEqual({
      agentTurns: 0,
      paused: false,
    });
  });

  it("is spent at the budget or when paused, whichever comes first", () => {
    expect(
      roomBudgetSpent({ agentTurns: ROOM_TURN_BUDGET - 1, paused: false })
    ).toBe(false);
    expect(
      roomBudgetSpent({ agentTurns: ROOM_TURN_BUDGET, paused: false })
    ).toBe(true);
    expect(roomBudgetSpent({ agentTurns: 0, paused: true })).toBe(true);
  });
});
