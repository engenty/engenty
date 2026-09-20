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
  it("lists only published wizards", () => {
    const rows = selectSpaceHomeWorkflows([
      graph({ id: "wizard", surface: "wizard" }),
      graph({ id: "draft", status: "draft", surface: "wizard" }),
      graph({ id: "chat", surface: "chat" }),
      graph({ id: "untagged" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["wizard"]);
  });
});
