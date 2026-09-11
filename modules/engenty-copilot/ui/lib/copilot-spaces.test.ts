import { describe, expect, it } from "vitest";
import { type CopilotSpaceRef, copilotSpaceOrder } from "./copilot-spaces.js";

function space(
  overrides: Partial<CopilotSpaceRef> & Pick<CopilotSpaceRef, "id" | "name">
): CopilotSpaceRef {
  return {
    key: overrides.key ?? overrides.id,
    ownerUserId: null,
    ...overrides,
  };
}

describe("copilotSpaceOrder", () => {
  it("puts the personal space first, then the rest by name", () => {
    expect(
      copilotSpaceOrder([
        space({ id: "game", name: "game" }),
        space({ id: "personal", name: "Matthias", ownerUserId: "user-1" }),
        space({ id: "company", name: "Company" }),
        space({ id: "agent", name: "agent test" }),
      ])
    ).toEqual(["personal", "agent", "company", "game"]);
  });
});
