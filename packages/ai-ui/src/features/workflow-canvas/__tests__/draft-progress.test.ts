import { describe, expect, it } from "vitest";
import { extractDraftedSteps, humanizeEntryId } from "../draft-progress.js";

const FULL_REPLY = JSON.stringify({
  graph: [
    { id: "prep-check", mapConfig: "…", type: "mapping" },
    { id: "check-inbox", toolId: "engenty_tool", type: "tool" },
    {
      steps: [
        { id: "file-receipt", toolId: "engenty_tool", type: "tool" },
        { id: "ask-review", toolId: "approval_gate", type: "tool" },
      ],
      type: "conditional",
    },
    {
      opts: { concurrency: 1 },
      step: { id: "book-expense", type: "tool" },
      type: "foreach",
    },
    {
      loopType: "dowhile",
      step: { id: "chase-reply", type: "tool" },
      type: "loop",
    },
    { id: "wait-3-days", type: "sleep" },
  ],
  input_schema: { properties: {}, type: "object" },
  output_schema: { properties: {}, type: "object" },
});

describe("humanizeEntryId", () => {
  it("turns kebab and snake ids into a sentence-cased label", () => {
    expect(humanizeEntryId("draft-invoice")).toBe("Draft invoice");
    expect(humanizeEntryId("send_reminder_email")).toBe("Send reminder email");
  });
});

describe("extractDraftedSteps", () => {
  it("collects entry ids depth-first, skipping mappings", async () => {
    await expect(extractDraftedSteps(FULL_REPLY)).resolves.toEqual([
      { key: "check-inbox", label: "Check inbox" },
      { key: "file-receipt", label: "File receipt" },
      { key: "ask-review", label: "Ask review" },
      { key: "book-expense", label: "Book expense" },
      { key: "chase-reply", label: "Chase reply" },
      { key: "wait-3-days", label: "Wait 3 days" },
    ]);
  });

  it("reads a truncated reply, keeping only entries whose id AND type have streamed", async () => {
    // Cut right before ask-review's toolId: its id has fully appeared, but its
    // `type` has not — so it must wait (it could still turn out to be a
    // mapping), while the two complete entries before it show.
    const cut = FULL_REPLY.indexOf('"toolId":"approval_gate"');
    const steps = await extractDraftedSteps(FULL_REPLY.slice(0, cut));
    expect(steps.map((step) => step.key)).toEqual([
      "check-inbox",
      "file-receipt",
    ]);
  });

  it("only ever appends across growing prefixes of the same reply", async () => {
    let previous: string[] = [];
    for (let end = 0; end <= FULL_REPLY.length; end += 37) {
      const steps = await extractDraftedSteps(FULL_REPLY.slice(0, end));
      const keys = steps.map((step) => step.key);
      expect(keys.slice(0, previous.length)).toEqual(previous);
      previous = keys;
    }
  });

  it("tolerates a code fence and prose before the JSON", async () => {
    const fenced = `Here you go:\n\`\`\`json\n${FULL_REPLY}`;
    const steps = await extractDraftedSteps(fenced);
    expect(steps.some((step) => step.key === "check-inbox")).toBe(true);
  });

  it("returns an empty list for prose, garbage, and empty input", async () => {
    await expect(extractDraftedSteps("")).resolves.toEqual([]);
    await expect(extractDraftedSteps("Thinking about it…")).resolves.toEqual(
      []
    );
    await expect(extractDraftedSteps("{{{not json")).resolves.toEqual([]);
  });

  it("ignores a graph that is not an array", async () => {
    await expect(
      extractDraftedSteps('{"graph": {"id": "not-a-list"}}')
    ).resolves.toEqual([]);
  });
});
