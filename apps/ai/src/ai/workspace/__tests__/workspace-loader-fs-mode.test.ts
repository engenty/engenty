import { afterEach, describe, expect, it } from "vitest";
import { parseEngentyWorkspaceRuntimeSpec } from "../contracts.js";
import { createEngentyAgentWorkspace } from "../loader.js";

describe("resolveEngentyWorkspaceFsMode", () => {
  afterEach(() => {
    delete process.env.ENGENTY_WORKSPACE_FS;
  });

  it("uses local offline mounts when ENGENTY_WORKSPACE_FS=local", async () => {
    process.env.ENGENTY_WORKSPACE_FS = "local";
    const spec = parseEngentyWorkspaceRuntimeSpec({
      agentConfig: {
        id: "demo",
        instructions: "",
        model: "openai/gpt-4.1-mini",
        name: "Demo",
        tenantId: "tenant-1",
      },
      basePath: "/tmp/engenty-workspace-test",
      mounts: [
        {
          fileStorageRelativePath: "ai/workspace/tasks/ENG-1/",
          mountPath: "/task",
        },
      ],
    });

    const { workspaceFsMode } = await createEngentyAgentWorkspace(spec);
    expect(workspaceFsMode).toBe("local");
  });

  it("omits root mount for copilot profile", async () => {
    process.env.ENGENTY_WORKSPACE_FS = "local";
    const spec = parseEngentyWorkspaceRuntimeSpec({
      agentConfig: {
        id: "engenty.copilot",
        instructions: "",
        model: "openai/gpt-4.1-mini",
        name: "Copilot",
        tenantId: "tenant-1",
      },
      basePath: "/tmp/engenty-copilot-home",
      bm25: true,
      enableSkillSearch: true,
      omitRootMount: true,
      skillDiscoveryPaths: ["/tenant-skills"],
      mounts: [
        {
          fileStorageRelativePath:
            "ai/workspace/agents/engenty.copilot/users/user-1/",
          mountPath: "/home",
        },
        {
          fileStorageRelativePath: "ai/skills/",
          mountPath: "/tenant-skills",
          readOnly: true,
        },
      ],
    });

    const { workspace, skillDiscoveryPaths } =
      await createEngentyAgentWorkspace(spec);
    expect(workspace).toBeDefined();
    expect(skillDiscoveryPaths).toEqual(["/tenant-skills"]);
  });
});
