// A run speaks on its own task through these tools: they must call the task op
// that exists with the key it takes, and a question must end the run.

import { describe, expect, it, vi } from "vitest";
import { createTaskSelfTools } from "../../ai/tools/task-self-tools.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function setup() {
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

    await run(tools.task_comment, {
      content: "hi",
      id: "99999999-9999-4999-8999-999999999999",
    });

    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ id: TASK_ID });
  });

  it("posts a question and signals that the run must end", async () => {
    const { invoke, questions, tools } = setup();

    await run(tools.task_ask_user, { question: "Supplier A or B?" });

    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ kind: "question" });
    expect(questions).toEqual(["Supplier A or B?"]);
  });
});
