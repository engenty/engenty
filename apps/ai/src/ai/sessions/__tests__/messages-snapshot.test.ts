import { describe, expect, it } from "vitest";
import type { ThreadMessageRow } from "../../../dal/threads/index.js";
import {
  buildSessionMessagesSnapshotFromRows,
  mergeAssistantTranscriptPartsForSnapshot,
  orderRowsForTranscriptSnapshot,
} from "../messages-snapshot.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000003";

function makeRow(
  input: Partial<ThreadMessageRow> & Pick<ThreadMessageRow, "id" | "role">
): ThreadMessageRow {
  return {
    author_user_id: null,
    created_at: "2026-05-21T12:00:00.000Z",
    parts: [{ type: "text", text: "hello" }],
    tenant_id: tenantId,
    thread_id: threadId,
    ...input,
  };
}

describe("messages snapshot ordering", () => {
  it("places the submitted user turn before assistant rows when created_at inverts order", () => {
    const rows = orderRowsForTranscriptSnapshot({
      rows: [
        makeRow({
          id: "assistant-1",
          created_at: "2026-05-21T12:00:01.000Z",
          role: "assistant",
          parts: [
            { type: "text", text: "Wähle eine der drei Farben aus." },
            {
              type: "dynamic-tool",
              toolCallId: "decision-1",
              toolName: "requestDecision",
              state: "output-available",
              output: {
                artifact_id: "artifact-1",
                artifact_type: "decision",
                choices: [
                  { id: "red", label: "Rot" },
                  { id: "blue", label: "Blau" },
                  { id: "green", label: "Grün" },
                ],
                title: "Farbauswahl",
              },
            },
          ],
        }),
        makeRow({
          id: "user-1",
          created_at: "2026-05-21T12:00:02.000Z",
          role: "user",
          parts: [{ type: "text", text: "lass mich aus drei farben wählen" }],
        }),
      ],
      submittedUserText: "lass mich aus drei farben wählen",
      tenantId,
      threadId,
    });

    expect(rows.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("projects decision widgets inline on the assistant turn after the user message", () => {
    const messages = buildSessionMessagesSnapshotFromRows({
      resourceId: "user-1",
      threadId,
      rows: [
        makeRow({
          id: "assistant-1",
          created_at: "2026-05-21T12:00:01.000Z",
          role: "assistant",
          parts: [
            { type: "text", text: "Wähle eine der drei Farben aus." },
            {
              type: "dynamic-tool",
              toolCallId: "decision-1",
              toolName: "requestDecision",
              state: "output-available",
              output: {
                artifact_id: "artifact-1",
                artifact_type: "decision",
                choices: [
                  { id: "red", label: "Rot" },
                  { id: "blue", label: "Blau" },
                  { id: "green", label: "Grün" },
                ],
                title: "Farbauswahl",
              },
            },
          ],
        }),
        makeRow({
          id: "user-1",
          created_at: "2026-05-21T12:00:02.000Z",
          role: "user",
          parts: [{ type: "text", text: "lass mich aus drei farben wählen" }],
        }),
      ],
      submittedUserText: "lass mich aus drei farben wählen",
    });

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(messages[1]?.metadata?.transcript_parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({ toolName: "requestDecision" }),
      ])
    );
  });

  it("synthesizes an assistant row for snapshot when Mastra has not persisted it yet", () => {
    const rows = mergeAssistantTranscriptPartsForSnapshot({
      messageId: "assistant-stream-1",
      rows: [
        makeRow({
          id: "user-1",
          created_at: "2026-05-21T12:00:00.000Z",
          role: "user",
          parts: [{ type: "text", text: "lass mich aus drei farben wählen" }],
        }),
      ],
      tenantId,
      threadId,
      transcriptParts: [
        { type: "text", text: "Wähle eine der drei Farben aus." },
        {
          type: "dynamic-tool",
          toolCallId: "decision-1",
          toolName: "requestDecision",
          state: "output-available",
          output: {
            artifact_id: "artifact-1",
            artifact_type: "decision",
            choices: [
              { id: "red", label: "Rot" },
              { id: "blue", label: "Blau" },
              { id: "green", label: "Grün" },
            ],
            title: "Farbauswahl",
          },
        },
      ],
    });

    expect(rows.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(rows[1]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "requestDecision" }),
      ])
    );
  });
});
