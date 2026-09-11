import { describe, expect, it } from "vitest";
import type { AiSessionScope } from "../types.js";
import { resolveEngentyWorkspaceRuntimeSpec } from "../workspace-runtime-spec.js";

const scope: AiSessionScope = {
  tenantId: "tenant-spec",
  userId: "user-spec",
};

const mounts = [
  {
    fileStorageRelativePath: "ai/skills/",
    mountPath: "/skills",
    readOnly: true,
  },
];

describe("resolveEngentyWorkspaceRuntimeSpec", () => {
  it("forwards allowedSkillNames onto the runtime spec", () => {
    const spec = resolveEngentyWorkspaceRuntimeSpec({
      agentId: "engenty.copilot",
      allowedSkillNames: ["projects-management", "pr-review"],
      mounts,
      scope,
    });
    expect(spec.allowedSkillNames).toEqual([
      "projects-management",
      "pr-review",
    ]);
  });

  it("omits allowedSkillNames for a global run (no filter)", () => {
    const spec = resolveEngentyWorkspaceRuntimeSpec({
      agentId: "engenty.copilot",
      mounts,
      scope,
    });
    expect(spec.allowedSkillNames).toBeUndefined();
    expect("allowedSkillNames" in spec).toBe(false);
  });

  // The `/data` mount forwards this as `x-engenty-agent-id`, and core matches
  // it against uuid grant columns — sending `agentConfig.id` instead failed
  // every agent-driven data call with a Postgres cast error.
  it("carries the core principal uuid apart from the agent key", () => {
    const spec = resolveEngentyWorkspaceRuntimeSpec({
      agentId: "engenty.copilot",
      coreAgentId: "00000000-0000-4000-8000-000000000042",
      mounts,
      scope,
    });
    expect(spec.coreAgentId).toBe("00000000-0000-4000-8000-000000000042");
    expect(spec.agentConfig.id).toBe("engenty.copilot");
  });

  it("omits the core principal uuid when it could not be resolved", () => {
    const spec = resolveEngentyWorkspaceRuntimeSpec({
      agentId: "engenty.copilot",
      mounts,
      scope,
    });
    expect("coreAgentId" in spec).toBe(false);
  });

  it("forwards an empty list for unresolved fail-closed", () => {
    const spec = resolveEngentyWorkspaceRuntimeSpec({
      agentId: "engenty.copilot",
      allowedSkillNames: [],
      mounts,
      scope,
    });
    expect(spec.allowedSkillNames).toEqual([]);
  });
});
