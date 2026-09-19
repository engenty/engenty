import { describe, expect, it } from "vitest";
import {
  companionWhoFromOptionId,
  companionWhoOptionId,
} from "./copilot-who-chooser";

describe("companion who option ids", () => {
  it("round-trips copilot and a hired Engenty", () => {
    expect(companionWhoFromOptionId("copilot")).toEqual({
      kind: "copilot",
    });
    expect(companionWhoFromOptionId("agent-1")).toEqual({
      agentId: "agent-1",
      kind: "engenty",
    });
    expect(companionWhoOptionId({ kind: "copilot" })).toBe("copilot");
    expect(companionWhoOptionId({ agentId: "agent-1", kind: "engenty" })).toBe(
      "agent-1"
    );
  });
});
