import { describe, expect, it } from "vitest";
import {
  buildCopilotUserHomeMount,
  buildTenantSkillsMount,
  copilotUserWorkspaceKey,
  copilotUserWorkspaceStoragePrefix,
  copilotUserWorkspaceTenantRelativeDisplayPath,
} from "./copilot-workspace.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("copilotUserWorkspaceKey", () => {
  it("builds user-scoped workspace key and storage prefix", () => {
    expect(copilotUserWorkspaceKey(USER_ID)).toBe(
      `agent:engenty.copilot:user:${USER_ID}`
    );
    expect(copilotUserWorkspaceStoragePrefix(TENANT_ID, USER_ID)).toBe(
      `tenants/${TENANT_ID}/ai/workspace/agents/engenty.copilot/users/${USER_ID}`
    );
    expect(
      copilotUserWorkspaceTenantRelativeDisplayPath(TENANT_ID, USER_ID)
    ).toBe(`ai/workspace/agents/engenty.copilot/users/${USER_ID}/`);
  });

  it("builds copilot mount specs", () => {
    expect(buildCopilotUserHomeMount(USER_ID)).toEqual({
      fileStorageRelativePath: `ai/workspace/agents/engenty.copilot/users/${USER_ID}/`,
      mountPath: "/home",
    });
    expect(buildTenantSkillsMount()).toEqual({
      fileStorageRelativePath: "ai/skills/",
      mountPath: "/tenant-skills",
      readOnly: true,
    });
  });

  it("rejects empty user id", () => {
    expect(() => copilotUserWorkspaceKey("  ")).toThrow(
      "copilot_user_id_invalid"
    );
  });
});
