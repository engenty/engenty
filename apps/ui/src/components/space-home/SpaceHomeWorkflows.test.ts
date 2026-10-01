import type { WorkflowDto } from "@engenty/ai-ui";
import { describe, expect, it } from "vitest";
import { selectSpaceHomeWorkflows } from "./SpaceHomeWorkflows";

function graph(patch: Partial<WorkflowDto>): WorkflowDto {
  return {
    context_type: null,
    created_at: "",
    current_version: 1,
    description: null,
    id: "g",
    module_id: null,
    name: "n",
    status: "active",
    updated_at: "",
    ...patch,
  };
}

describe("selectSpaceHomeWorkflows", () => {
  it("lists only published wizards whose owner is mounted in the Space", () => {
    const rows = selectSpaceHomeWorkflows(
      [
        graph({ id: "wizard", owner_agent_id: "mounted", surface: "wizard" }),
        graph({ id: "elsewhere", owner_agent_id: "other", surface: "wizard" }),
        graph({ id: "library", owner_agent_id: null, surface: "wizard" }),
        graph({
          id: "draft",
          owner_agent_id: "mounted",
          status: "draft",
          surface: "wizard",
        }),
        graph({ id: "chat", owner_agent_id: "mounted", surface: "chat" }),
      ],
      new Set(["mounted"])
    );
    expect(rows.map((row) => row.id)).toEqual(["wizard"]);
  });
});
