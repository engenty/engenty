// Who sees and writes which memory entries. Ways this can fail, each a test:
// - a person's `user` facts reach a transcript other people read
// - one Space's entries reach a run in another Space
// - a run whose Space failed to resolve is treated as the company
// - an agent's notes are keyed on the wrong audience (a shared agent on the
//   person, a personal agent on the Space)
// - a chapter cut writes past its conversation's readers (a DM into the
//   Space, a desk into the person, anything into the company)
import { describe, expect, it } from "vitest";
import {
  isPrivateLine,
  memoryKeysForChapter,
  memoryKeysForRun,
  memoryPlaceFromResolution,
} from "../memory-scopes.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceA = "00000000-0000-4000-8000-00000000000a";
const spaceB = "00000000-0000-4000-8000-00000000000b";

describe("memoryKeysForRun", () => {
  it("opens the user scope only on a private line", () => {
    const base = {
      agentId: "contacts.manager",
      place: { kind: "space", spaceId: spaceA } as const,
      tenantId,
      userId,
    };
    expect(
      memoryKeysForRun({ ...base, privateSpeakerUserId: userId }).user
    ).toEqual({ scope: "user", userId });
    expect(
      memoryKeysForRun({ ...base, privateSpeakerUserId: null }).user
    ).toBeUndefined();
  });

  it("keys the space scope on the run's own Space", () => {
    const keys = memoryKeysForRun({
      agentId: "contacts.manager",
      place: { kind: "space", spaceId: spaceB },
      privateSpeakerUserId: null,
      tenantId,
      userId,
    });
    expect(keys.space).toEqual({ scope: "space", spaceId: spaceB });
    expect(keys.agent).toEqual({
      agentId: "contacts.manager",
      scope: "agent",
      spaceId: spaceB,
      userId: null,
    });
  });

  it("gives an unresolved Space nothing — not the company", () => {
    const keys = memoryKeysForRun({
      agentId: "contacts.manager",
      place: memoryPlaceFromResolution({
        claimed_space_id: spaceA,
        kind: "unresolved",
        reason: "forbidden",
      }),
      privateSpeakerUserId: userId,
      tenantId,
      userId,
    });
    expect(keys).toEqual({});
  });

  it("keys a run outside any Space on the company, with no space scope", () => {
    const keys = memoryKeysForRun({
      agentId: "contacts.manager",
      place: memoryPlaceFromResolution({ kind: "global" }),
      privateSpeakerUserId: null,
      tenantId,
      userId,
    });
    expect(keys.company).toEqual({ scope: "company" });
    expect(keys.space).toBeUndefined();
    expect(keys.agent).toEqual({
      agentId: "contacts.manager",
      scope: "agent",
      spaceId: null,
      userId: null,
    });
  });

  it("keys a personal agent's notes on its person, wherever the run is", () => {
    const inA = memoryKeysForRun({
      agentId: "engenty.copilot",
      agentScope: "personal",
      place: { kind: "space", spaceId: spaceA },
      privateSpeakerUserId: userId,
      tenantId,
      userId,
    });
    const inB = memoryKeysForRun({
      agentId: "engenty.copilot",
      agentScope: "personal",
      place: { kind: "space", spaceId: spaceB },
      privateSpeakerUserId: userId,
      tenantId,
      userId,
    });
    expect(inA.agent).toEqual({
      agentId: "engenty.copilot",
      scope: "agent",
      spaceId: null,
      userId,
    });
    expect(inB.agent).toEqual(inA.agent);
  });

  it("gives a personal agent run by a service no notes of its own", () => {
    const keys = memoryKeysForRun({
      agentId: "engenty.copilot",
      agentScope: "personal",
      place: { kind: "space", spaceId: spaceA },
      privateSpeakerUserId: null,
      tenantId,
      userId: null,
    });
    expect(keys.agent).toBeUndefined();
  });
});

describe("isPrivateLine", () => {
  it("counts a DM as private, even with a Space-keyed specialist", () => {
    expect(
      isPrivateLine({
        sharedRoom: true,
        thread: { route_context: { dm: true } },
      })
    ).toBe(true);
  });

  it("does not count what other people read as private", () => {
    // A specialist's shared desk in a Space.
    expect(
      isPrivateLine({ sharedRoom: true, thread: { route_context: {} } })
    ).toBe(false);
    expect(
      isPrivateLine({
        sharedRoom: false,
        thread: { route_context: { room: true } },
      })
    ).toBe(false);
    expect(
      isPrivateLine({
        sharedRoom: false,
        thread: { route_context: { routine_id: "r" } },
      })
    ).toBe(false);
    // A messenger channel has no thread row of ours to prove it private.
    expect(isPrivateLine({ sharedRoom: false, thread: null })).toBe(false);
  });
});

describe("memoryKeysForChapter", () => {
  it("keeps a private line's facts for the person, never the Space or company", () => {
    const shared = memoryKeysForChapter({
      agentId: "contacts.manager",
      agentScope: "shared",
      kind: "dm",
      spaceId: spaceA,
      tenantId,
      userId,
    });
    expect(Object.keys(shared)).toEqual(["user"]);

    const personal = memoryKeysForChapter({
      agentId: "engenty.copilot",
      agentScope: "personal",
      kind: "dm",
      spaceId: null,
      tenantId,
      userId,
    });
    expect(Object.keys(personal).toSorted()).toEqual(["agent", "user"]);
  });

  it("keeps a Space desk's facts for the Space, never the person or company", () => {
    const keys = memoryKeysForChapter({
      agentId: "contacts.manager",
      agentScope: "shared",
      kind: "desk",
      spaceId: spaceA,
      tenantId,
      userId,
    });
    expect(Object.keys(keys).toSorted()).toEqual(["agent", "space"]);
    expect(keys.space).toEqual({ scope: "space", spaceId: spaceA });
  });
});
