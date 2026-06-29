import { describe, expect, it } from "vitest";
import type { ToolCallCardProps } from "./tool-call-card.types";
import {
  clearToolCallUiRegistrationsForTests,
  registerToolCallUi,
  resolveToolCallUiCard,
} from "./tool-call-ui-registry";

function StubCard(_props: ToolCallCardProps) {
  return null;
}

describe("resolveToolCallUiCard", () => {
  it("returns a registered card for matching resolved tool names", () => {
    clearToolCallUiRegistrationsForTests();
    registerToolCallUi({
      id: "contacts_load_contact",
      priority: 10,
      match: (ctx) => ctx.resolvedToolName === "loadContact",
      Card: StubCard,
    });

    expect(
      resolveToolCallUiCard({
        toolName: "engenty_tool_execute",
        resolvedToolName: "loadContact",
      })
    ).toBe(StubCard);
    expect(
      resolveToolCallUiCard({
        toolName: "engenty_tool_execute",
        resolvedToolName: "contacts_search",
      })
    ).toBeNull();
  });
});
