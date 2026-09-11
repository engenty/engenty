import { describe, expect, it } from "vitest";
import { createInboxRetrievalSource } from "./inbox-retrieval-source.js";

describe("inbox retrieval source — search operation policy", () => {
  it("declares user_owned (search is over the caller's messages, not mailbox listings)", () => {
    const source = createInboxRetrievalSource({
      getDb: () => ({}) as never,
    });
    expect(source.operation.spacePolicy).toEqual({ kind: "user_owned" });
  });
});
