import { describe, expect, it } from "vitest";
import type {
  TaskComment,
  TaskCommentKind,
  TaskCommentMetadata,
} from "../../src/schema/types.js";
import { resolveOpenTaskQuestion } from "./open-question.js";

let seq = 0;
function comment(
  content: string,
  kind: TaskCommentKind,
  metadata: TaskCommentMetadata = {},
  createdAt?: string
): TaskComment {
  seq += 1;
  const byAgent = kind !== "note";
  return {
    content,
    created_at: createdAt ?? `2026-08-16T10:0${seq}:00.000Z`,
    created_by_agent_type_key: byAgent ? "engenty.coordinator" : null,
    created_by_user_id: byAgent ? null : "u-1",
    id: `c-${seq}`,
    kind,
    metadata,
    scope_id: "s",
    task_id: "t",
    tenant_id: "tn",
  };
}

describe("the question at the end of the thread", () => {
  it("finds an agent question", () => {
    const open = resolveOpenTaskQuestion([
      comment("Started looking.", "progress"),
      comment("Which supplier?", "question"),
    ]);

    expect(open?.question).toBe("Which supplier?");
  });

  it("is closed once a person replied under it", () => {
    expect(
      resolveOpenTaskQuestion([
        comment("Which supplier?", "question"),
        comment("B, they deliver faster.", "note"),
      ])
    ).toBeNull();
  });

  it("ignores a question a later agent comment moved past", () => {
    expect(
      resolveOpenTaskQuestion([
        comment("Which supplier?", "question"),
        comment("Never mind, found it in the notes.", "result"),
      ])
    ).toBeNull();
  });

  it("does not treat a person's question mark as an agent question", () => {
    expect(
      resolveOpenTaskQuestion([comment("❓ what does this mean", "note")])
    ).toBeNull();
  });

  it("reads the newest comment, not the last one in array order", () => {
    const open = resolveOpenTaskQuestion([
      comment("Which office?", "question", {}, "2026-08-16T12:00:00.000Z"),
      comment("Looking into it.", "progress", {}, "2026-08-16T09:00:00.000Z"),
    ]);

    expect(open?.question).toBe("Which office?");
  });

  it("handles a task with no comments", () => {
    expect(resolveOpenTaskQuestion([])).toBeNull();
    expect(resolveOpenTaskQuestion(undefined)).toBeNull();
  });
});

describe("how the question can be answered", () => {
  it("defaults to a text box when the agent said nothing", () => {
    const open = resolveOpenTaskQuestion([comment("Why?", "question")]);
    expect(open?.answerType).toBe("text");
    expect(open?.options).toEqual([]);
  });

  it("carries a confirm through without options", () => {
    const open = resolveOpenTaskQuestion([
      comment("Shall I send it?", "question", { answer_type: "confirm" }),
    ]);
    expect(open?.answerType).toBe("confirm");
  });

  it("carries choices and their labels", () => {
    const open = resolveOpenTaskQuestion([
      comment("Which colour?", "question", {
        answer_type: "single_choice",
        options: [
          { label: "red", value: "#E63946" },
          { label: "teal", value: "#2A9D8F" },
        ],
      }),
    ]);

    expect(open?.answerType).toBe("single_choice");
    expect(open?.options).toHaveLength(2);
    expect(open?.options[0]).toEqual({ label: "red", value: "#E63946" });
  });

  it("degrades a choice with no options to a text box", () => {
    // Otherwise the card renders an empty list and the run is stranded with
    // no way to answer at all.
    const open = resolveOpenTaskQuestion([
      comment("Which one?", "question", { answer_type: "single_choice" }),
    ]);

    expect(open?.answerType).toBe("text");
  });

  it("degrades when every option is blank", () => {
    const open = resolveOpenTaskQuestion([
      comment("Which one?", "question", {
        answer_type: "multi_choice",
        options: [{ value: "  " }],
      }),
    ]);

    expect(open?.answerType).toBe("text");
    expect(open?.options).toEqual([]);
  });
});
