import { describe, expect, it, vi } from "vitest";
import {
  ensureTaskWorkspacePrefix,
  taskWorkspaceKeepObjectKey,
} from "./ensure-task-workspace-prefix.js";
import { taskWorkspaceStoragePrefix } from "./task-workspace.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SPACE_ID = "55555555-5555-4555-8555-555555555555";
const IDENTIFIER = "ENG-142";

describe("ensureTaskWorkspacePrefix", () => {
  it("uploads .keep when marker is missing", async () => {
    const exists = vi.fn(async () => false);
    const upload = vi.fn(async () => undefined);

    const prefix = await ensureTaskWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      SPACE_ID,
      IDENTIFIER
    );

    expect(prefix).toBe(
      taskWorkspaceStoragePrefix(TENANT_ID, SPACE_ID, IDENTIFIER)
    );
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(
      taskWorkspaceKeepObjectKey(TENANT_ID, SPACE_ID, IDENTIFIER),
      new Uint8Array(0),
      {
        contentType: "application/octet-stream",
        upsert: false,
      }
    );
  });

  it("skips upload when .keep already exists", async () => {
    const exists = vi.fn(async () => true);
    const upload = vi.fn(async () => undefined);

    await ensureTaskWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      SPACE_ID,
      IDENTIFIER
    );

    expect(exists).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not delete or overwrite existing workspace objects on re-run", async () => {
    const exists = vi.fn(async () => true);
    const upload = vi.fn(async () => undefined);

    await ensureTaskWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      SPACE_ID,
      IDENTIFIER
    );
    await ensureTaskWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      SPACE_ID,
      IDENTIFIER
    );

    expect(upload).not.toHaveBeenCalled();
  });
});
