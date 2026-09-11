import { describe, expect, it } from "vitest";
import {
  createSpeakerTurnProcessor,
  wrapUserTurnText,
} from "../speaker-turn-processor.js";

interface Msg {
  content: {
    metadata?: Record<string, unknown>;
    parts?: Array<{ text?: string; type?: string }>;
  };
  resourceId?: string;
  role: string;
  threadId?: string;
}

function message(role: string, text: string, resourceId?: string): Msg {
  return {
    content: { parts: [{ text, type: "text" }] },
    ...(resourceId ? { resourceId } : {}),
    role,
  };
}

function textOf(msg: Msg): string {
  return msg.content.parts?.map((part) => part.text ?? "").join("") ?? "";
}

async function run(
  processor: ReturnType<typeof createSpeakerTurnProcessor>,
  messages: Msg[]
) {
  return (await processor.processInput?.({
    messages,
  } as never)) as unknown as Msg[];
}

describe("wrapUserTurnText", () => {
  it("wraps plain text and is idempotent", () => {
    const wrapped = wrapUserTurnText({
      authorId: "u-1",
      authorName: "Ada",
      text: "hello",
    });
    expect(wrapped).toContain('author_name="Ada"');
    expect(wrapped).toContain("hello");
    expect(
      wrapUserTurnText({
        authorId: "u-1",
        authorName: "Ada",
        text: wrapped,
      })
    ).toBe(wrapped);
  });
});

describe("createSpeakerTurnProcessor", () => {
  it("wraps user turns with server-resolved names and leaves assistant text alone", async () => {
    const processor = createSpeakerTurnProcessor({
      currentUserId: "u-1",
      resolveNames: async () => new Map([["u-2", "Bob"]]),
    });
    const out = await run(processor, [
      message("user", "from Bob", "u-2"),
      message("assistant", "ok"),
      message("user", "from Ada", "u-1"),
    ]);
    expect(textOf(out[0] as Msg)).toContain('author_name="Bob"');
    expect(textOf(out[0] as Msg)).toContain("from Bob");
    expect(textOf(out[1] as Msg)).toBe("ok");
    expect(textOf(out[2] as Msg)).toContain('author_id="u-1"');
  });

  it("does not treat a conversation-keyed resourceId as the speaker", async () => {
    const threadId = "thread-shared";
    const processor = createSpeakerTurnProcessor({
      currentUserId: "u-1",
      currentUserName: "Ada",
      resolveNames: async () => new Map(),
    });
    const out = await run(processor, [
      {
        content: { parts: [{ text: "hello", type: "text" }] },
        resourceId: threadId,
        role: "user",
        threadId,
      },
    ]);
    expect(textOf(out[0] as Msg)).toContain('author_id="u-1"');
    expect(textOf(out[0] as Msg)).toContain('author_name="Ada"');
  });

  it("does not treat a space-keyed resourceId as the speaker", async () => {
    const spaceId = "space-shared";
    const processor = createSpeakerTurnProcessor({
      currentUserId: "u-1",
      currentUserName: "Ada",
      resolveNames: async () => new Map(),
      spaceId,
    });
    const out = await run(processor, [
      {
        content: { parts: [{ text: "hello", type: "text" }] },
        resourceId: spaceId,
        role: "user",
        threadId: "thread-1",
      },
    ]);
    expect(textOf(out[0] as Msg)).toContain('author_id="u-1"');
    expect(textOf(out[0] as Msg)).toContain('author_name="Ada"');
  });

  it("does not wrap an unattended user-role prompt as a human turn", async () => {
    const processor = createSpeakerTurnProcessor({
      currentUserId: null,
      resolveNames: async () => new Map(),
    });
    const out = await run(processor, [
      message("user", "Aktienkurse alle 10 Minuten"),
    ]);
    expect(textOf(out[0] as Msg)).toBe("Aktienkurse alle 10 Minuten");
    expect(textOf(out[0] as Msg)).not.toContain("<turn ");
  });

  it("does not wrap a recalled row that recorded no author", async () => {
    const processor = createSpeakerTurnProcessor({
      currentUserId: "u-1",
      currentUserName: "Ada",
      resolveNames: async () => new Map(),
    });
    const out = await run(processor, [
      {
        content: {
          metadata: { author_user_id: null },
          parts: [{ text: "run the tick", type: "text" }],
        },
        resourceId: "space-shared",
        role: "user",
        threadId: "thread-1",
      },
    ]);
    expect(textOf(out[0] as Msg)).toBe("run the tick");
    expect(textOf(out[0] as Msg)).not.toContain("<turn ");
  });

  it("still wraps a recalled human turn when the run itself is headless", async () => {
    const processor = createSpeakerTurnProcessor({
      currentUserId: null,
      resolveNames: async () => new Map([["u-2", "Bob"]]),
    });
    const out = await run(processor, [
      {
        content: {
          metadata: { author_user_id: "u-2" },
          parts: [{ text: "please check quotes", type: "text" }],
        },
        role: "user",
      },
    ]);
    expect(textOf(out[0] as Msg)).toContain('author_name="Bob"');
    expect(textOf(out[0] as Msg)).toContain("please check quotes");
  });
});
