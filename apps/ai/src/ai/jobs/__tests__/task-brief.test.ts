import { describe, expect, it } from "vitest";
import { buildTaskBrief, ROUTINE_BRIEF_COMMENT_CAP } from "../task-brief.js";

describe("buildTaskBrief", () => {
  it("adds the routine run protocol when trigger_id is set", () => {
    const brief = buildTaskBrief({
      identifier: "ENG-1",
      title: "Heartbeat",
      trigger_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(brief).toContain("## Routine run protocol");
    expect(brief).toContain("ROUTINE_OK");
  });

  it("caps prior comments for routine tasks", () => {
    const comments = Array.from(
      { length: ROUTINE_BRIEF_COMMENT_CAP + 5 },
      (_, i) => ({
        content: `comment ${i}`,
        created_by_agent_type_key: "engenty.coordinator",
      })
    );
    const brief = buildTaskBrief({
      comments,
      identifier: "ENG-1",
      title: "Heartbeat",
      trigger_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(brief).toContain("comment 5");
    expect(brief).not.toContain("comment 0");
    expect(brief).toContain("Older history");
  });

  it("does not add the protocol for non-routine tasks", () => {
    const brief = buildTaskBrief({
      identifier: "ENG-2",
      title: "One-shot",
    });
    expect(brief).not.toContain("## Routine run protocol");
    expect(brief).toContain("Complete this task using your tools");
  });

  it("adds workspace guidance for non-routine tasks", () => {
    const brief = buildTaskBrief({
      identifier: "ENG-2",
      title: "One-shot",
    });
    expect(brief).toContain("## Workspace & outputs");
    expect(brief).toContain("artifact_write");
    expect(brief).toContain("workspace_list_files");
  });

  it("adds a goal context section with open sibling tasks", () => {
    const brief = buildTaskBrief({
      goal_id: "22222222-2222-4222-8222-222222222222",
      goal_sibling_titles: ["Sibling A", "Sibling B"],
      goal_status: "active",
      goal_title: "Ship the thing",
      identifier: "ENG-3",
      title: "Do a part",
    });
    expect(brief).toContain("## Goal context");
    expect(brief).toContain("Goal: Ship the thing (active)");
    expect(brief).toContain("- Sibling A");
    expect(brief).toContain("- Sibling B");
  });

  it("omits the goal section when no goal title is given", () => {
    const brief = buildTaskBrief({
      goal_id: "22222222-2222-4222-8222-222222222222",
      identifier: "ENG-4",
      title: "No goal meta",
    });
    expect(brief).not.toContain("## Goal context");
  });
});
