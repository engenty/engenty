// A resolved `requestDecision` must survive the transcript rebuild.
//
// Mastra persists the row as `tool-invocation` with everything nested under
// `toolInvocation.*`, while the renderer reads the flat `dynamic-tool` shape.
// If the flattening is skipped the row loses its tool name, and an answered
// decision degrades into an anonymous "Used 1 tool" disclosure — the question
// and the answer both vanish from the transcript on reload.
//
// The fixture is a verbatim row from ai.thread_message.
import { describe, expect, it } from "vitest";
import { agUiMessagesToCopilotMessages } from "./copilot-adapter.js";

const persistedPart = {
  type: "tool-invocation",
  toolInvocation: {
    args: {
      body: "Welche Farbe möchtest du auswählen?",
      title: "Farbe auswählen",
      choices: [
        { id: "rot", label: "Rot", description: null },
        { id: "blau", label: "Blau", description: null },
        { id: "gruen", label: "Grün", description: null },
      ],
      multiSelect: false,
    },
    state: "result",
    result: { choice_id: "blau", choice_label: "Blau" },
    toolName: "requestDecision",
    toolCallId: "call_UTGgemapYC3FFIztXu5l50MK",
  },
};

describe("a persisted requestDecision row rebuilds as an answered decision", () => {
  const [message] = agUiMessagesToCopilotMessages([
    {
      id: "assistant-1",
      role: "assistant",
      content: "",
      // The transcript rides in metadata, not on `parts`.
      metadata: { transcript_parts: [persistedPart] },
    } as never,
  ]);

  const toolPart = message?.parts?.find(
    (part) => (part as { type?: string }).type === "dynamic-tool"
  ) as
    | { input?: unknown; output?: unknown; toolName?: string; state?: string }
    | undefined;

  it("keeps the tool name, so the row is recognisable as a decision", () => {
    // Without this the row reads as an unnamed tool and collapses.
    expect(toolPart?.toolName).toBe("requestDecision");
  });

  it("keeps the QUESTION, which lives only in the args", () => {
    expect(toolPart?.input).toMatchObject({ title: "Farbe auswählen" });
  });

  it("keeps the ANSWER", () => {
    expect(toolPart?.output).toMatchObject({ choice_id: "blau" });
  });
});

// The end-to-end shape a reload actually produces: the API hands back
// `parts`, ai-core lifts them into `metadata.transcript_parts`, and the
// adapter rebuilds the transcript from there. The decision row sits beside a
// `reasoning` part, and the assistant's answer is a SEPARATE later message.
describe("a reloaded thread still shows the answered decision", () => {
  const sessionMessages = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "lass mich wählen" }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", reasoning: "picking colours" },
        {
          type: "tool-invocation",
          toolInvocation: {
            args: {
              title: "Wähle eine Farbe",
              choices: [
                { id: "blau", label: "Blau" },
                { id: "rot", label: "Rot" },
              ],
            },
            state: "result",
            result: { choice_id: "blau", choice_label: "Blau" },
            toolName: "requestDecision",
            toolCallId: "call_ae937156bd444d25b8a5f834",
          },
        },
      ],
    },
    {
      id: "a2",
      role: "assistant",
      parts: [{ type: "text", text: "Ausgewählt: Blau" }],
    },
  ];

  it("keeps a dynamic-tool part for the decision", async () => {
    const { buildAgUiMessagesFromSessionMessages } = await import(
      "@engenty/ai-core/browser"
    );
    const agUi = buildAgUiMessagesFromSessionMessages(sessionMessages as never);
    const copilot = agUiMessagesToCopilotMessages(agUi as never);
    const toolParts = copilot.flatMap((message) =>
      (message.parts ?? []).filter(
        (part) => (part as { type?: string }).type === "dynamic-tool"
      )
    );
    expect(
      toolParts.map((part) => (part as { toolName?: string }).toolName)
    ).toContain("requestDecision");
  });
});
