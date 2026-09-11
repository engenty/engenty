import { describe, expect, it } from "vitest";
import { AGENT_ENGENTY_KINDS, resolveAgentEngenty } from "./agent-engenty.js";

describe("resolveAgentEngenty", () => {
  it("keeps a stored preference", () => {
    expect(resolveAgentEngenty("knowledge-base.manager", "oval")).toBe("oval");
  });

  it("ignores unknown stored values and hashes the id", () => {
    const hashed = resolveAgentEngenty("knowledge-base.manager");
    expect(hashed).toBe(
      resolveAgentEngenty("knowledge-base.manager", "not-a-blob")
    );
    expect(AGENT_ENGENTY_KINDS).toContain(hashed);
    expect(resolveAgentEngenty("aaa")).not.toBe(resolveAgentEngenty("bbb"));
  });
});
