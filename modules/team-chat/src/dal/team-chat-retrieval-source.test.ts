import { describe, expect, it } from "vitest";
import { createTeamChatRetrievalSource } from "./team-chat-retrieval-source.js";

describe("team-chat retrieval source — search operation policy", () => {
  it("declares tenant_shared so synthesized search matches channel semantics", () => {
    const source = createTeamChatRetrievalSource({
      getDb: () => ({}) as never,
    });
    expect(source.operation.spacePolicy).toEqual({ kind: "tenant_shared" });
  });
});
