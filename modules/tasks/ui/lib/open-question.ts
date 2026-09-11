// Is this task waiting on an answer, and how can it be answered?
//
// An agent that calls `task_ask_user` posts its question as a comment
// (`kind: "question"`) and the run ends with the task blocked. There is no
// "question" row to read: the question IS the comment, which is what keeps the
// loop honest — the answer is a reply comment on the same thread, and the next
// dispatch replays both.
//
// So "open" is a property of the END of the comment list, not of the task: an
// agent question that nobody has replied to yet. Anything said after it counts
// as the answer, whether or not it actually answers.
//
// The SHAPE of the answer rides in the comment's metadata, so the card can
// render buttons instead of making a person retype an option the agent already
// enumerated.

import type {
  TaskComment,
  TaskQuestionAnswerType,
  TaskQuestionOption,
} from "../../src/schema/types.js";

export interface OpenTaskQuestion {
  /** How to answer — `text` whenever the agent did not say otherwise. */
  answerType: TaskQuestionAnswerType;
  /** The comment carrying it, so the card can key off a stable id. */
  comment: TaskComment;
  /** Present only for the choice types, already validated as non-empty. */
  options: TaskQuestionOption[];
  /** The question text. */
  question: string;
}

/**
 * A choice with no options is unanswerable — the card would render an empty
 * list and strand the run. Degrade to a text box instead: the question is
 * still readable and the person can still reply.
 */
function resolveAnswerType(
  requested: TaskQuestionAnswerType | undefined,
  options: TaskQuestionOption[]
): TaskQuestionAnswerType {
  const wantsOptions =
    requested === "single_choice" || requested === "multi_choice";
  if (wantsOptions && options.length === 0) {
    return "text";
  }
  return requested ?? "text";
}

/**
 * The unanswered question at the tail of the thread, or null.
 *
 * Deliberately not gated on `task.status === "blocked"`: someone can move a
 * task while a question stands, and hiding the reply box because the status
 * moved would strand the answer with nowhere to go.
 */
export function resolveOpenTaskQuestion(
  comments: TaskComment[] | undefined
): OpenTaskQuestion | null {
  if (!comments?.length) {
    return null;
  }
  const newest = [...comments]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
  if (newest?.kind !== "question") {
    return null;
  }
  const options = (newest.metadata?.options ?? []).filter((option) =>
    option.value?.trim()
  );
  return {
    answerType: resolveAnswerType(newest.metadata?.answer_type, options),
    comment: newest,
    options,
    question: newest.content.trim(),
  };
}

/** What a picked option posts as the answer. */
export function taskQuestionOptionLabel(option: TaskQuestionOption): string {
  return option.label?.trim() || option.value;
}
