import { describe, expect, it } from "vitest";
import { createKbRetrievalSource } from "./kb-retrieval-source.js";

describe("kb retrieval source — search operation policy", () => {
  it("declares space_owned so synthesized search injects current_space", () => {
    const source = createKbRetrievalSource({
      getDb: () => ({}) as never,
      resolveRepos: () => ({ settings: {} }) as never,
    });
    expect(source.operation.spacePolicy).toEqual({ kind: "space_owned" });
  });
});
