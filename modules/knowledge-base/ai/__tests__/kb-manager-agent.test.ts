import { describe, expect, it } from "vitest";
import {
  createKbManagerInstructionDocuments,
  readKbManagerAgentsMarkdown,
} from "../kb-manager-agent.js";

describe("kb manager instruction documents", () => {
  it("seeds the AGENTS.md identity document", () => {
    const documents = createKbManagerInstructionDocuments();
    expect(documents.map((document) => document.key)).toEqual([
      "knowledge_base_manager_agents",
    ]);
    expect(readKbManagerAgentsMarkdown().trim().length).toBeGreaterThan(100);
  });
});
