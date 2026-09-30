// What the observer may change in working memory. Ways this can fail:
// - a reply naming a scope the conversation may not write (the Space, from a
//   DM) lands there
// - a field outside the scope's schema is stored
// - null does not clear a field that no longer holds
// - an unreadable reply breaks the run instead of changing nothing
import { applyWorkingMemoryPatch } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import type {
  MemoryKey,
  WorkingMemoryRow,
  WorkingMemoryStore,
} from "../../../dal/memory/index.js";
import { unaskedWriteKeys } from "../memory-scopes.js";
import { createWorkingMemoryExtractor } from "../working-memory.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceId = "00000000-0000-4000-8000-00000000000a";

function fakeStore() {
  const rows = new Map<string, WorkingMemoryRow>();
  const id = (key: MemoryKey) => JSON.stringify(key);
  const store: WorkingMemoryStore = {
    deleteForAgent: async () => undefined,
    get: async ({ key }) => rows.get(id(key)) ?? null,
    patch: async ({ key, patch }) => {
      const state = applyWorkingMemoryPatch(
        rows.get(id(key))?.state ?? {},
        patch
      );
      rows.set(id(key), {
        state,
        updated_at: new Date().toISOString(),
        updated_by_user_id: userId,
      });
      return state;
    },
  };
  return { state: (key: MemoryKey) => rows.get(id(key))?.state, store };
}

const userKey: MemoryKey = { scope: "user", userId };
const spaceKey: MemoryKey = { scope: "space", spaceId };
const runKeys = {
  company: { scope: "company" } as MemoryKey,
  space: spaceKey,
  user: userKey,
};

async function observe(
  store: WorkingMemoryStore,
  privateLine: boolean,
  reply: unknown
) {
  const extractor = createWorkingMemoryExtractor({
    keys: unaskedWriteKeys(runKeys, { agentScope: "shared", privateLine }),
    store,
    tenantId,
    userId,
  });
  await extractor?.onExtracted?.({ current: reply } as never);
}

describe("working memory from the observer", () => {
  it("keeps a DM's changes for the person, never the Space", async () => {
    const { state, store } = fakeStore();
    await observe(
      store,
      true,
      JSON.stringify({
        space: { current_focus: "Q4 offer" },
        user: { current_focus: "Q4 offer", language: "German" },
      })
    );
    expect(state(userKey)).toEqual({
      current_focus: "Q4 offer",
      language: "German",
    });
    expect(state(spaceKey)).toBeUndefined();
  });

  it("stores only the scope's own fields, and null clears one", async () => {
    const { state, store } = fakeStore();
    await observe(store, false, '{"space": {"purpose": "Sales", "mood": "x"}}');
    await observe(
      store,
      false,
      '{"space": {"current_focus": "ACME", "purpose": null}}'
    );
    expect(state(spaceKey)).toEqual({ current_focus: "ACME" });
  });

  it("changes nothing on an unreadable reply", async () => {
    const { state, store } = fakeStore();
    await observe(store, true, "the user seems busy");
    await observe(store, true, "null");
    expect(state(userKey)).toBeUndefined();
  });
});
