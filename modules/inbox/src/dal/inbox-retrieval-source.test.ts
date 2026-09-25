import { describe, expect, it } from "vitest";
import { createInboxRetrievalSource } from "./inbox-retrieval-source.js";

describe("inbox retrieval source — search operation policy", () => {
  it("follows the mailbox's Space (account_mounted + space visibility)", () => {
    const source = createInboxRetrievalSource({
      getDb: () => ({}) as never,
    });
    expect(source.operation.spacePolicy).toEqual({ kind: "account_mounted" });
    expect(source.visibility).toBe("space");
  });
});
