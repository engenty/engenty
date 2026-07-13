import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  isModelFeedableMime,
  latestUserAttachments,
} from "../api/agent-session-runs-routes.js";

function runInput(messages: unknown[]): RunAgentInput {
  return { messages } as unknown as RunAgentInput;
}

const imagePart = {
  type: "image",
  source: { type: "url", value: "https://x/y.png", mimeType: "image/png" },
  metadata: {
    engenty_attachment: {
      filename: "y.png",
      mimeType: "image/png",
      size: 10,
      storageKey: "tenants/t1/chat/uploads/1_y.png",
    },
  },
};

describe("latestUserAttachments", () => {
  it("extracts image/document refs from the latest user turn", () => {
    const refs = latestUserAttachments(
      runInput([
        { role: "assistant", content: "hi" },
        {
          role: "user",
          content: [{ type: "text", text: "look" }, imagePart],
        },
      ])
    );
    expect(refs).toEqual([
      {
        filename: "y.png",
        mimeType: "image/png",
        storageKey: "tenants/t1/chat/uploads/1_y.png",
      },
    ]);
  });

  it("only reads the most recent user message", () => {
    const refs = latestUserAttachments(
      runInput([
        { role: "user", content: [imagePart] },
        { role: "user", content: "no attachments here" },
      ])
    );
    expect(refs).toEqual([]);
  });

  it("skips parts without an engenty storage key", () => {
    const refs = latestUserAttachments(
      runInput([
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", value: "https://x/z.png" },
            },
          ],
        },
      ])
    );
    expect(refs).toEqual([]);
  });

  it("gates model-feedable MIME types", () => {
    expect(isModelFeedableMime("image/png")).toBe(true);
    expect(isModelFeedableMime("application/pdf")).toBe(true);
    expect(isModelFeedableMime("application/zip")).toBe(false);
    expect(isModelFeedableMime("text/plain")).toBe(false);
  });
});
