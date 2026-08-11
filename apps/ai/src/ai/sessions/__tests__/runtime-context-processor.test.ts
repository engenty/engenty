// The prompt-cache invariant: the per-run runtime context must land in the
// message TAIL, never in the system prompt.
//
// It is the most volatile text in the request (pathname, selection, list
// filters, row previews, the core-fetched module list). In the instructions it
// sat at the head of the provider's cacheable prefix, so a navigation mid-thread
// invalidated the ~9k tool block and the ~8k of recalled history behind it.
import { describe, expect, it } from "vitest";
import { createRuntimeContextProcessor } from "../runtime-context-processor.js";

interface Msg {
  content: unknown;
  role: string;
}

function message(role: string, text: string): Msg {
  return { content: { format: 2, parts: [{ text, type: "text" }] }, role };
}

function textOf(msg: Msg): string {
  const parts = (msg.content as { parts?: Array<{ text?: string }> }).parts;
  return parts?.map((part) => part.text ?? "").join("") ?? "";
}

function run(
  processor: ReturnType<typeof createRuntimeContextProcessor>,
  messages: Msg[]
) {
  return processor.processInput?.({ messages } as never) as unknown as Msg[];
}

describe("createRuntimeContextProcessor", () => {
  it("inserts the context directly before the current user turn", () => {
    const processor = createRuntimeContextProcessor("pathname: /mdl/tasks");
    const out = run(processor, [
      message("user", "older question"),
      message("assistant", "older answer"),
      message("user", "what page am I on?"),
    ]);

    expect(out.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "system",
      "user",
    ]);
    // The last message stays the user's words — that is what the model answers.
    expect(textOf(out.at(-1) as Msg)).toBe("what page am I on?");
    expect(textOf(out[2] as Msg)).toBe("pathname: /mdl/tasks");
  });

  it("leaves the head of the prompt untouched", () => {
    // The whole point: history before the current turn is byte-identical, so
    // the prefix (system + tools + history) stays cached across navigations.
    const history = [message("user", "a"), message("assistant", "b")];
    const first = run(createRuntimeContextProcessor("pathname: /mdl/tasks"), [
      ...history,
      message("user", "q"),
    ]);
    const second = run(
      createRuntimeContextProcessor("pathname: /mdl/contacts"),
      [...history, message("user", "q")]
    );

    expect(first.slice(0, 2)).toEqual(second.slice(0, 2));
    expect(textOf(first[2] as Msg)).not.toBe(textOf(second[2] as Msg));
  });

  it("appends when the turn does not end on a user message", () => {
    const out = run(createRuntimeContextProcessor("ctx"), [
      message("assistant", "resumed mid-turn"),
    ]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "system"]);
  });

  it("is a no-op for empty context", () => {
    const messages = [message("user", "q")];
    expect(run(createRuntimeContextProcessor("   "), messages)).toEqual(
      messages
    );
  });
});
