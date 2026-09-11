// Which comment answered which question.
//
// `open-question.ts` answers "is the task waiting on someone", which only needs
// the tail of the thread. This answers the reader's question instead: an
// answer on its own is unreadable. "Hans" says nothing; "Hans" under "Wie
// heißt du?" says everything, and by the time anyone scrolls back the agent has
// usually posted two more comments between the two.
//
// The pairing is not stored — the question IS a comment and so is the answer,
// which is what keeps the record honest (see PLAN-task-thread-unification.md).
// So it is derived, by the same rule a person reads the thread with: the next
// thing somebody ELSE said.
import type { TaskComment } from "../../src/schema/types.js";

/** Author identity for pairing — an agent key, a user id, or "" for neither. */
function authorOf(comment: TaskComment): string {
  return comment.created_by_agent_type_key ?? comment.created_by_user_id ?? "";
}

/**
 * Answering comment id → the question comment it answers.
 *
 * A question is answered by the next comment from a DIFFERENT author. An agent
 * that asks again before anyone replies has superseded its own question, not
 * answered it — otherwise a double `task_ask_user` would pair question #1 with
 * question #2 and hang the real answer off the wrong one.
 */
export function resolveAnsweredQuestions(
  comments: readonly TaskComment[]
): Map<string, TaskComment> {
  const ordered = [...comments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const answers = new Map<string, TaskComment>();
  let pending: TaskComment | null = null;
  for (const comment of ordered) {
    if (comment.kind === "question") {
      pending = comment;
      continue;
    }
    if (!pending) {
      continue;
    }
    if (authorOf(comment) === authorOf(pending)) {
      continue;
    }
    answers.set(comment.id, pending);
    pending = null;
  }
  return answers;
}

/** One line of the question, for the quoted header above an answer. */
export function quoteQuestion(content: string, maxLength = 120): string {
  const firstLine = content.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= maxLength) {
    return firstLine;
  }
  return `${firstLine.slice(0, maxLength - 1)}…`;
}
