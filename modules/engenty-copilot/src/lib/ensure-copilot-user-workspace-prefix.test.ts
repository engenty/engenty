import { describe, expect, it, vi } from "vitest";
import {
  copilotUserWorkspaceKeepObjectKey,
  ensureCopilotUserWorkspacePrefix,
} from "./ensure-copilot-user-workspace-prefix.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ensureCopilotUserWorkspacePrefix", () => {
  it("uploads .keep when prefix marker is missing", async () => {
    const exists = vi.fn(async () => false);
    const upload = vi.fn(async () => undefined);

    const prefix = await ensureCopilotUserWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      USER_ID
    );

    expect(prefix).toBe(
      `tenants/${TENANT_ID}/ai/workspace/agents/engenty.copilot/users/${USER_ID}`
    );
    expect(upload).toHaveBeenCalledWith(
      copilotUserWorkspaceKeepObjectKey(TENANT_ID, USER_ID),
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

    await ensureCopilotUserWorkspacePrefix(
      { exists, upload },
      TENANT_ID,
      USER_ID
    );

    expect(upload).not.toHaveBeenCalled();
  });
});
