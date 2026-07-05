import { describe, expect, it, vi } from "vitest";
import { defineConnector } from "./runtime.js";
import type {
  ConnectorActionContext,
  ConnectorFilesCapability,
} from "./types.js";

const ctx = {} as ConnectorActionContext;

function capability(
  overrides: Partial<ConnectorFilesCapability> = {}
): ConnectorFilesCapability {
  return {
    list: vi.fn(async () => ({ entries: [], next_cursor: null })),
    read: vi.fn(async () => ({
      content: "",
      kind: "text" as const,
      mime_type: null,
      name: null,
      size: null,
      truncated: false,
    })),
    stat: vi.fn(async () => ({
      kind: "folder" as const,
      mime_type: null,
      modified_at: null,
      name: "root",
      ref: "r",
      size: null,
    })),
    ...overrides,
  };
}

describe("files capability", () => {
  it("synthesizes read actions from a files capability", () => {
    const def = defineConnector({
      actions: [],
      auth: { kind: "browser" },
      description: "Local files",
      files: capability(),
      id: "local-files",
      moduleId: "connections-local-files",
      name: "Local Files",
      toolPrefix: "local",
    });
    const ids = def.actions.map((a) => a.id).sort();
    expect(ids).toEqual(["files_list", "files_read", "files_stat"]);
    expect(def.actions.every((a) => a.group === "read")).toBe(true);
  });

  it("adds files_search only when search is provided", () => {
    const def = defineConnector({
      actions: [],
      auth: { kind: "browser" },
      description: "Local files",
      files: capability({ search: vi.fn(async () => ({ entries: [], next_cursor: null })) }),
      id: "local-files",
      moduleId: "connections-local-files",
      name: "Local Files",
      toolPrefix: "local",
    });
    expect(def.actions.map((a) => a.id)).toContain("files_search");
  });

  it("delegates handlers to the capability with the action context", async () => {
    const files = capability();
    const def = defineConnector({
      actions: [],
      auth: { kind: "browser" },
      description: "Local files",
      files,
      id: "local-files",
      moduleId: "connections-local-files",
      name: "Local Files",
      toolPrefix: "local",
    });
    const list = def.actions.find((a) => a.id === "files_list");
    await list?.handler({ folder_ref: null }, ctx);
    expect(files.list).toHaveBeenCalledWith(ctx, { folder_ref: null });
  });
});
