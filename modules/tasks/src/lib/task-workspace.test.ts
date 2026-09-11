import { describe, expect, it } from "vitest";
import {
  parseTaskWorkspaceKey,
  taskIdentifierFromStoragePrefix,
  taskWorkspaceDisplayPath,
  taskWorkspaceKey,
  taskWorkspaceKeySchema,
  taskWorkspaceStoragePrefix,
} from "./task-workspace.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SPACE_ID = "55555555-5555-4555-8555-555555555555";
const IDENTIFIER = "ENG-142";

describe("taskWorkspaceKey", () => {
  it("round-trips workspace key and storage prefix", () => {
    const workspaceKey = taskWorkspaceKey(IDENTIFIER);
    expect(workspaceKey).toBe("task:ENG-142");
    expect(parseTaskWorkspaceKey(workspaceKey)).toEqual({
      type: "task",
      identifier: IDENTIFIER,
    });

    const storagePrefix = taskWorkspaceStoragePrefix(
      TENANT_ID,
      SPACE_ID,
      IDENTIFIER
    );
    expect(storagePrefix).toBe(
      `tenants/${TENANT_ID}/spaces/${SPACE_ID}/ai/workspace/tasks/${IDENTIFIER}`
    );
    expect(taskIdentifierFromStoragePrefix(storagePrefix)).toBe(IDENTIFIER);
    expect(taskIdentifierFromStoragePrefix(`${storagePrefix}/notes.md`)).toBe(
      IDENTIFIER
    );
    // The display path stays space-RELATIVE: the space id is a routing detail.
    expect(taskWorkspaceDisplayPath(TENANT_ID, SPACE_ID, IDENTIFIER)).toBe(
      `ai/workspace/tasks/${IDENTIFIER}/`
    );
  });

  it("rejects malformed workspace keys", () => {
    expect(parseTaskWorkspaceKey("task:eng-142")).toBeNull();
    expect(parseTaskWorkspaceKey("task:ENG142")).toBeNull();
    expect(parseTaskWorkspaceKey("goal:ENG-142")).toBeNull();
    expect(parseTaskWorkspaceKey("task:")).toBeNull();
    expect(() => taskWorkspaceKey("bad")).toThrow("task_identifier_invalid");
    expect(taskWorkspaceKeySchema.safeParse("task:ENG-142").success).toBe(true);
    expect(taskWorkspaceKeySchema.safeParse("task:bad").success).toBe(false);
  });
});

describe("taskIdentifierFromStoragePrefix", () => {
  it("parses tenant-relative and full storage prefixes", () => {
    expect(
      taskIdentifierFromStoragePrefix(`ai/workspace/tasks/${IDENTIFIER}/`)
    ).toBe(IDENTIFIER);
    expect(
      taskIdentifierFromStoragePrefix(
        `tenants/${TENANT_ID}/ai/workspace/tasks/${IDENTIFIER}/file.txt`
      )
    ).toBe(IDENTIFIER);
    expect(
      taskIdentifierFromStoragePrefix(
        `tenants/${TENANT_ID}/ai/workspace/tasks/${IDENTIFIER}`
      )
    ).toBe(IDENTIFIER);
  });

  it("returns null for unrelated prefixes", () => {
    expect(
      taskIdentifierFromStoragePrefix("inbox/message/file.pdf")
    ).toBeNull();
    expect(
      taskIdentifierFromStoragePrefix(
        `tenants/${TENANT_ID}/ai/workspace/agents/supervisor/`
      )
    ).toBeNull();
    expect(
      taskIdentifierFromStoragePrefix("ai/workspace/tasks/bad-id/")
    ).toBeNull();
  });
});
