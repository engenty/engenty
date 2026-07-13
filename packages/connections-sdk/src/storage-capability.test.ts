import { describe, expect, it, vi } from "vitest";
import { defineConnector } from "./runtime.js";
import type {
  ConnectorActionContext,
  ConnectorStorageCapability,
} from "./types.js";

const ctx = {} as ConnectorActionContext;

const entry = {
  kind: "file" as const,
  mime_type: "text/plain",
  modified_at: null,
  name: "a.txt",
  ref: "a.txt",
  size: 1,
};

function capability(
  overrides: Partial<ConnectorStorageCapability> = {}
): ConnectorStorageCapability {
  return {
    delete: vi.fn(async () => ({ deleted: true, ref: "a.txt" })),
    write: vi.fn(async () => entry),
    ...overrides,
  };
}

function connectorWith(storage: ConnectorStorageCapability) {
  return defineConnector({
    actions: [],
    auth: { kind: "browser" },
    description: "Test storage",
    id: "test-storage",
    moduleId: "connections-test",
    name: "Test Storage",
    storage,
    toolPrefix: "teststore",
  });
}

describe("storage capability", () => {
  it("synthesizes write/destructive actions with policy-relevant groups", () => {
    const def = connectorWith(capability());
    const byId = new Map(def.actions.map((a) => [a.id, a]));
    expect([...byId.keys()].sort()).toEqual(["files_delete", "files_write"]);
    expect(byId.get("files_write")?.group).toBe("write");
    expect(byId.get("files_delete")?.group).toBe("destructive");
  });

  it("adds files_move only when move is provided", () => {
    const def = connectorWith(capability({ move: vi.fn(async () => entry) }));
    const moveAction = def.actions.find((a) => a.id === "files_move");
    expect(moveAction?.group).toBe("write");
  });

  it("delegates write to the capability and rejects ambiguous content", async () => {
    const storage = capability();
    const def = connectorWith(storage);
    const write = def.actions.find((a) => a.id === "files_write");

    await write?.handler(
      { content_text: "hello", folder_ref: null, name: "a.txt" },
      ctx
    );
    expect(storage.write).toHaveBeenCalledWith(ctx, {
      content_text: "hello",
      folder_ref: null,
      name: "a.txt",
    });

    expect(() =>
      write?.handler({ folder_ref: null, name: "a.txt" }, ctx)
    ).toThrow(/exactly one of/);
    expect(() =>
      write?.handler(
        {
          content_base64: "aGk=",
          content_text: "hi",
          folder_ref: null,
          name: "a.txt",
        },
        ctx
      )
    ).toThrow(/exactly one of/);
  });
});
