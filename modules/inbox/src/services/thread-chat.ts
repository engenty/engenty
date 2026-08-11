// Ask questions about one thread. Grounded in the stored digests (already
// stripped of signatures and quoted history), so the context is a fraction of
// the raw bodies and the answers stay on-thread.
import { generateText } from "ai";
import type {
  InboxMessage,
  InboxMessageDigest,
  InboxThread,
} from "../schema/types.js";

const MAX_CONTEXT_CHARS = 40_000;
const MAX_ANSWER_CHARS = 8000;

export interface InboxThreadChatTurn {
  content: string;
  role: "assistant" | "user";
}

export interface AnswerThreadQuestionInput {
  digests: InboxMessageDigest[];
  history: InboxThreadChatTurn[];
  messages: InboxMessage[];
  /** Resolved classifier-tier model id. */
  modelId: string;
  question: string;
  thread: InboxThread;
}

export async function answerThreadQuestion(
  input: AnswerThreadQuestionInput
): Promise<string> {
  const digestByMessageId = new Map(
    input.digests.map((digest) => [digest.message_id, digest.content_md])
  );
  const transcript = input.messages
    .map((message) => {
      const content =
        digestByMessageId.get(message.id)?.trim() || message.snippet || "";
      return `[${message.received_at ?? message.created_at}] ${
        message.from_name ?? message.from_email ?? "?"
      } <${message.from_email ?? ""}>:\n${content}`;
    })
    .join("\n\n")
    .slice(-MAX_CONTEXT_CHARS);

  const { text } = await generateText({
    model: input.modelId,
    messages: [
      {
        role: "system",
        content: [
          "You answer questions about ONE email thread and help the user act on it.",
          "Ground every answer in the thread below. If the thread does not contain the answer, say so plainly instead of guessing.",
          "When asked to draft a reply, write the reply text itself — ready to paste, in the thread's language, matching its register.",
          "Be concise and concrete. Markdown is fine. Never invent facts, dates, names, or commitments that are not in the thread.",
          "",
          `Subject: ${input.thread.subject ?? "(none)"}`,
          `Participants: ${input.thread.participants.join(", ") || "(none)"}`,
          "",
          "Thread (chronological, stripped to content):",
          "---",
          transcript || "(empty)",
          "---",
        ].join("\n"),
      },
      ...input.history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: "user" as const, content: input.question },
    ],
  });

  const answer = text.trim();
  if (!answer) {
    throw new Error("inbox thread chat returned an empty answer");
  }
  return answer.slice(0, MAX_ANSWER_CHARS);
}
