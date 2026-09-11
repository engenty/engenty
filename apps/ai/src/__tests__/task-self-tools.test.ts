// The tools that let a run speak on its own task. Two things must hold: they
// call the op that actually exists with the key it actually takes (the flow
// mirror shipped for months calling a nonexistent one), and asking a question
// signals the step to end the run rather than throwing at the model.

import { describe, expect, it, vi } from "vitest";
import { createTaskSelfTools } from "../../ai/tools/task-self-tools.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function setup() {
  // Rest params so `tsc` gives `calls` a real arg tuple — see the mock in
  // jobs/__tests__/task-needs-input.test.ts.
  const invoke = vi.fn(async (..._args: unknown[]) => ({}));
  const questions: string[] = [];
  const tools = createTaskSelfTools({
    agentTypeKey: "engenty.coordinator",
    invoke,
    onQuestion: (q) => questions.push(q),
    taskId: TASK_ID,
  });
  return { invoke, questions, tools };
}

/** Mastra hands `execute` a context object; these tools only read the input. */
function run(tool: { execute?: unknown }, input: unknown) {
  return (tool.execute as (i: unknown) => Promise<unknown>)(input);
}

describe("task self tools", () => {
  it("comments on its own task, attributed to the agent", async () => {
    const { invoke, tools } = setup();

    await run(tools.task_comment, { content: "Found 3 candidates." });

    expect(invoke).toHaveBeenCalledWith("tasks_add_comment", {
      content: "Found 3 candidates.",
      created_by_agent_type_key: "engenty.coordinator",
      id: TASK_ID,
      kind: "progress",
    });
  });

  it("cannot be pointed at another task", async () => {
    const { invoke, tools } = setup();

    // The id is bound at construction; a task id in the input is ignored.
    await run(tools.task_comment, {
      content: "hi",
      id: "99999999-9999-4999-8999-999999999999",
    });

    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ id: TASK_ID });
  });

  it("posts a question and signals that the run must end", async () => {
    const { invoke, questions, tools } = setup();

    await run(tools.task_ask_user, {
      context: "Both are in stock.",
      question: "Supplier A or B?",
    });

    const posted = invoke.mock.calls[0]?.[1] as {
      content: string;
      kind: string;
    };
    expect(posted.content).toContain("Supplier A or B?");
    expect(posted.content).toContain("Both are in stock.");
    // The KIND is what makes it a question — not a marker in the text, which
    // anyone could type and any rewording could drop.
    expect(posted.kind).toBe("question");
    expect(posted.content).not.toContain("❓");
    expect(questions).toEqual(["Supplier A or B?"]);
  });

  it("carries the answer shape so the card can render a control", async () => {
    const { invoke, tools } = setup();

    await run(tools.task_ask_user, {
      answer_type: "single_choice",
      options: [{ label: "red", value: "#E63946" }, { value: "#2A9D8F" }],
      question: "Which colour?",
    });

    const posted = invoke.mock.calls[0]?.[1] as {
      metadata: { answer_type: string; options: unknown[] };
    };
    expect(posted.metadata.answer_type).toBe("single_choice");
    expect(posted.metadata.options).toHaveLength(2);
  });

  it("refuses a choice with no options instead of asking the unanswerable", async () => {
    const { invoke, questions, tools } = setup();

    const result = (await run(tools.task_ask_user, {
      answer_type: "multi_choice",
      question: "Which ones?",
    })) as { asked: boolean; error?: string };

    expect(result.asked).toBe(false);
    expect(result.error).toBe("options_required_for_choice");
    // Nothing posted and the run does NOT park — the model can call again.
    expect(invoke).not.toHaveBeenCalled();
    expect(questions).toEqual([]);
  });

  it("keeps a confirm free of options", async () => {
    const { invoke, tools } = setup();

    await run(tools.task_ask_user, {
      answer_type: "confirm",
      question: "Shall I send it?",
    });

    const posted = invoke.mock.calls[0]?.[1] as {
      metadata: Record<string, unknown>;
    };
    expect(posted.metadata).toEqual({ answer_type: "confirm" });
  });

  it("reports the question even when the model asks twice", async () => {
    const { questions, tools } = setup();

    await run(tools.task_ask_user, { question: "First?" });
    await run(tools.task_ask_user, { question: "Second?" });

    // The step keeps the first — that is the one the run stopped on.
    expect(questions[0]).toBe("First?");
  });
});
