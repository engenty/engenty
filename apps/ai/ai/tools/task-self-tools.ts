// The task a run is working is that run's output channel — the headless
// equivalent of the chat thread.
//
// A specialist reaches its business tools through the SPACE (a contacts space
// mounts contacts ops, and nothing else). That narrowing is correct for the
// records an agent may touch, and wrong for the task it was dispatched onto: a
// run in a contacts-only space could read contacts but had no way to say
// anything about what it was doing, ask a question, or record a partial
// result. It could only end and let the finalize step mirror a status — which
// is exactly why runs kept landing in review having "done nothing".
//
// So these ride as extraTools (like artifacts and workspace files): bound to
// THIS run's task id at construction, never mounted from a space, and never
// able to touch another task. `task_comment` is progress and output;
// `task_ask_user` is the needs-input edge — it posts the question and tells the
// step to end the run, because the answer arrives as a comment on a LATER
// dispatch (the brief already replays prior comments).
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ModuleOperationInvoker } from "../../src/ai/sessions/task-workspace-hook.js";

export const TASK_COMMENT_TOOL_ID = "task_comment";
export const TASK_ASK_USER_TOOL_ID = "task_ask_user";

/** Mirrors `taskQuestionAnswerTypeSchema` in modules/tasks (wire contract). */
const answerTypeSchema = z.enum([
  "text",
  "confirm",
  "single_choice",
  "multi_choice",
]);

const optionSchema = z.object({
  /** Shown to the person; falls back to `value`. */
  label: z.string().max(200).optional(),
  /** Posted verbatim as the answer, so make it readable on its own. */
  value: z.string().min(1).max(200),
});

export interface TaskSelfToolsDeps {
  /** Attribution for the comments this run writes. */
  agentTypeKey: string;
  invoke: ModuleOperationInvoker;
  /**
   * Called when the agent asks the human something. The specialist step ends
   * the run on this signal rather than the tool throwing — a throw would land
   * as a tool error the model would try to work around.
   */
  onQuestion: (question: string) => void;
  taskId: string;
}

/** The brief section that tells a specialist these exist. */
export const TASK_SELF_TOOLS_GUIDANCE = `## Reporting & questions
- Report progress, findings and results ON THIS TASK with \`${TASK_COMMENT_TOOL_ID}\` — that is where the person watching sees your work. Comment as you go for anything long-running; do not save everything for the final message.
- Need a decision, missing detail or approval to continue? Call \`${TASK_ASK_USER_TOOL_ID}\` with one concrete question, then STOP. The run ends and the task waits for a human; their answer reaches you as a comment when the task is picked up again. Never guess a requirement you could ask about, and never ask for something you can look up yourself.
- Choose the narrowest \`answer_type\`: \`confirm\` for yes/no, \`single_choice\`/\`multi_choice\` with \`options\` when you already know the alternatives, \`text\` only when the answer is genuinely open. With options, DO NOT list them in the question text — they are rendered as buttons and repeating them reads as a duplicate.`;

export function createTaskSelfTools(deps: TaskSelfToolsDeps) {
  const addComment = async (
    content: string,
    kind: "progress" | "question",
    metadata?: Record<string, unknown>
  ) => {
    await deps.invoke("tasks_add_comment", {
      content,
      created_by_agent_type_key: deps.agentTypeKey,
      // The op names the task `id`, not `task_id`.
      id: deps.taskId,
      // What the comment IS travels as a column, not as a leading emoji —
      // nothing downstream parses the text to find the open question.
      kind,
      ...(metadata ? { metadata } : {}),
    });
  };

  const taskComment = createTool({
    id: TASK_COMMENT_TOOL_ID,
    description:
      "Write a comment on the task you are working on — your progress, findings, partial results and the final outcome. This is how the person watching sees your work; markdown is rendered. Use it for anything worth keeping on the task, not for internal reasoning.",
    inputSchema: z.object({
      content: z.string().min(1).max(20_000),
    }),
    outputSchema: z.object({ posted: z.boolean() }),
    execute: async (input) => {
      await addComment(input.content, "progress");
      return { posted: true };
    },
  });

  const taskAskUser = createTool({
    id: TASK_ASK_USER_TOOL_ID,
    description:
      "Ask the human who owns this task a question you cannot answer yourself, then end your turn. The question is posted on the task, the run stops, and the task waits for a reply — you will see the answer as a comment when the task runs again. Ask ONE concrete question and include the context needed to answer it. Pick the narrowest answer_type that fits: 'confirm' for a yes/no, 'single_choice' or 'multi_choice' with `options` when you already know the alternatives (do NOT also list them in the question text — they are rendered as buttons), 'text' only when the answer is genuinely open.",
    inputSchema: z.object({
      /**
       * How the person answers. Anything but `text` renders a control, so the
       * options must not be repeated in the question prose.
       */
      answer_type: answerTypeSchema.default("text"),
      /** What you already did, so the reply is informed. */
      context: z.string().max(4000).optional(),
      /** Required for single_choice / multi_choice; ignored otherwise. */
      options: z.array(optionSchema).min(2).max(12).optional(),
      question: z.string().min(1).max(4000),
    }),
    outputSchema: z.object({
      asked: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async (input) => {
      const needsOptions =
        input.answer_type === "single_choice" ||
        input.answer_type === "multi_choice";
      if (needsOptions && !input.options?.length) {
        // Returned, not thrown: the model can fix this by calling again with
        // options, where a throw would read as a broken tool.
        return { asked: false, error: "options_required_for_choice" };
      }
      const body = input.context?.trim()
        ? `${input.question}\n\n${input.context.trim()}`
        : input.question;
      await addComment(body, "question", {
        answer_type: input.answer_type,
        ...(needsOptions && input.options ? { options: input.options } : {}),
      });
      deps.onQuestion(input.question);
      return { asked: true };
    },
  });

  return {
    [TASK_ASK_USER_TOOL_ID]: taskAskUser,
    [TASK_COMMENT_TOOL_ID]: taskComment,
  };
}
