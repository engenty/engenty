import { describe, expect, it } from "vitest";
import {
  type PendingSendTranscriptMessage,
  resolvePendingUserInsertIndex,
  resolvePendingUserPartsForTranscript,
  resolvePendingUserTextForTranscript,
} from "./pending-send-transcript.js";

describe("resolvePendingUserTextForTranscript", () => {
  it("returns pending text when the transcript does not yet include it", () => {
    expect(
      resolvePendingUserTextForTranscript([], {
        startedAt: 1,
        text: "hi",
        transcriptInsertIndex: 0,
      })
    ).toBe("hi");
  });

  it("returns null when the transcript already contains the pending user turn", () => {
    const messages: PendingSendTranscriptMessage[] = [
      {
        id: "server-user-1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
      {
        id: "server-assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
    ];

    expect(
      resolvePendingUserTextForTranscript(messages, {
        startedAt: 2,
        text: "hi",
        transcriptInsertIndex: 0,
      })
    ).toBeNull();
  });

  it("returns null when AG-UI user content already contains the pending user turn", () => {
    expect(
      resolvePendingUserTextForTranscript(
        [
          {
            id: "client-user-1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
          },
        ] as PendingSendTranscriptMessage[],
        {
          startedAt: 2,
          text: "hi",
          transcriptInsertIndex: 0,
        }
      )
    ).toBeNull();
  });

  it("returns pending text when the latest server user turn is different", () => {
    const messages: PendingSendTranscriptMessage[] = [
      {
        id: "server-user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there" }],
      },
    ];

    expect(
      resolvePendingUserTextForTranscript(messages, {
        startedAt: 3,
        text: "hi",
        transcriptInsertIndex: 2,
      })
    ).toBe("hi");
  });

  it("returns insert index clamped to transcript length", () => {
    const messages: PendingSendTranscriptMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Theme picker" }],
      },
    ];

    expect(
      resolvePendingUserInsertIndex(messages, {
        startedAt: 4,
        text: "pick theme",
        transcriptInsertIndex: 0,
      })
    ).toBe(0);
  });

  it("returns pending parts while the transcript does not yet include the turn", () => {
    const parts = [
      {
        type: "image",
        source: {
          type: "url",
          value: "https://files.example/image.png",
          mimeType: "image/png",
        },
        metadata: {
          engenty_attachment: {
            filename: "image.png",
            mimeType: "image/png",
            size: 12,
            storageKey: "ten/chat/image.png",
          },
        },
      },
    ];

    expect(
      resolvePendingUserPartsForTranscript([], {
        parts,
        startedAt: 6,
        text: "was siehst du",
        transcriptInsertIndex: 0,
      })
    ).toEqual(parts);
    expect(
      resolvePendingUserTextForTranscript([], {
        parts,
        startedAt: 6,
        text: "was siehst du",
        transcriptInsertIndex: 0,
      })
    ).toBe("was siehst du");
  });

  it("hides pending parts once the transcript already contains the user text", () => {
    const parts = [
      {
        type: "image",
        metadata: {
          engenty_attachment: {
            filename: "image.png",
            mimeType: "image/png",
            size: 12,
            storageKey: "ten/chat/image.png",
          },
        },
        source: {
          mimeType: "image/png",
          type: "url",
          value: "https://files.example/image.png",
        },
      },
    ];
    const messages: PendingSendTranscriptMessage[] = [
      {
        id: "server-user-1",
        parts: [{ type: "text", text: "was siehst du" }, ...parts],
        role: "user",
      },
    ];

    expect(
      resolvePendingUserPartsForTranscript(messages, {
        parts,
        startedAt: 7,
        text: "was siehst du",
        transcriptInsertIndex: 0,
      })
    ).toBeNull();
  });

  it("keeps an attachment-only pending bubble until storage keys appear in the transcript", () => {
    const parts = [
      {
        type: "image",
        metadata: {
          engenty_attachment: {
            filename: "image.png",
            mimeType: "image/png",
            size: 12,
            storageKey: "ten/chat/image.png",
          },
        },
        source: {
          mimeType: "image/png",
          type: "url",
          value: "https://files.example/image.png",
        },
      },
    ];

    expect(
      resolvePendingUserInsertIndex([], {
        parts,
        startedAt: 8,
        text: "",
        transcriptInsertIndex: 0,
      })
    ).toBe(0);
    expect(
      resolvePendingUserPartsForTranscript([], {
        parts,
        startedAt: 8,
        text: "",
        transcriptInsertIndex: 0,
      })
    ).toEqual(parts);
    expect(
      resolvePendingUserPartsForTranscript(
        [
          {
            id: "server-user-1",
            parts,
            role: "user",
          },
        ],
        {
          parts,
          startedAt: 8,
          text: "",
          transcriptInsertIndex: 0,
        }
      )
    ).toBeNull();
  });

  it("defaults insert index to 0 when transcriptInsertIndex is missing", () => {
    const messages: PendingSendTranscriptMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Theme picker" }],
      },
    ];

    expect(
      resolvePendingUserInsertIndex(messages, {
        startedAt: 5,
        text: "pick theme",
        transcriptInsertIndex: undefined as unknown as number,
      })
    ).toBe(0);
  });
});
