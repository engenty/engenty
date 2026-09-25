import { describe, expect, it } from "vitest";
import { buildTaskBrief } from "../task-brief.js";

describe("buildTaskBrief", () => {
  it("briefs the work item a specialist was asked to do", () => {
    const brief = buildTaskBrief({
      comments: [
        { content: "comment 0", created_by_agent_type_key: "engenty.copilot" },
      ],
      identifier: "ENG-1",
      title: "Order the parts",
    });
    expect(brief).toContain("# Task ENG-1: Order the parts");
    expect(brief).toContain("Complete this task using your tools");
    expect(brief).toContain("- **engenty.copilot:** comment 0");
    expect(brief).toContain(
      "Write under `/task` when the run is task-bound, otherwise your own `/home`"
    );
  });

  it("keeps every prior comment — nothing here lives forever", () => {
    const comments = Array.from({ length: 15 }, (_, i) => ({
      content: `comment ${i}`,
      created_by_agent_type_key: "engenty.coordinator",
    }));
    const brief = buildTaskBrief({
      comments,
      identifier: "ENG-1",
      title: "Order the parts",
    });
    expect(brief).toContain("comment 0");
    expect(brief).toContain("comment 14");
    expect(brief).not.toContain("Older history");
  });

  it("never speaks the retired routine protocol", () => {
    const brief = buildTaskBrief({
      identifier: "ENG-2",
      title: "One-shot",
    });
    expect(brief).not.toContain("## Routine run protocol");
    expect(brief).not.toContain("ROUTINE_OK");
    expect(brief).not.toContain("standing host");
  });

  it("adds workspace guidance", () => {
    const brief = buildTaskBrief({
      identifier: "ENG-2",
      title: "One-shot",
    });
    expect(brief).toContain("## Workspace & outputs");
    expect(brief).toContain("artifact_write");
    // The Mastra names, not the retired prefix tools: an agent told about a
    // tool it does not have burns a turn discovering that.
    expect(brief).toContain("mastra_workspace_list_files");
    expect(brief).not.toContain("`workspace_list_files`");
    expect(brief).toContain("`/routine` and `/project` appear only when bound");
    expect(brief).toContain("`/company` is the company's, read-only");
    expect(brief).toContain(
      "`/data` is mounted module records, never workspace scratch"
    );
    expect(brief).toContain("`/data/Files`");
    expect(brief).not.toContain("tenants/…");
  });

  it("never speaks the retired goal tier", () => {
    // Goals are gone from the hierarchy: a brief that still framed the work
    // under one would send the specialist looking for a container and a set of
    // tools that no longer exist.
    const brief = buildTaskBrief({
      contexts: [{ context_id: "c-1", context_type: "contacts:contact" }],
      identifier: "ENG-3",
      title: "Do a part",
    });
    expect(brief).not.toContain("## Goal context");
    expect(brief).not.toContain("## Goal artifacts");
    expect(brief).not.toContain("`/goal`");
    expect(brief).toContain("## Linked context");
    expect(brief).toContain("- contacts:contact: c-1");
  });

  it("tells the agent to verify the deliverable before completing", () => {
    const brief = buildTaskBrief({ identifier: "ENG-8", title: "One-shot" });
    expect(brief).toContain("verify the deliverable actually exists");
    expect(brief).toContain("report the failure honestly");
  });
});
