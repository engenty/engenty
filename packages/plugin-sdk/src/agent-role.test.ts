// The rule moved off id strings onto the DECLARED kind: the caller resolves
// the agent in the registry and hands the object in. apps/ai's registry
// decoration derives the display role from the same declarations, so a change
// here changes what write paths accept — keep both in mind.
import { describe, expect, it } from "vitest";
import { canAgentOwnTrigger } from "./agent-role.js";

describe("canAgentOwnTrigger — runtime-created triggers", () => {
  // Recurring work belongs to somebody the user can see in their Space. Only a
  // specialist qualifies: Copilot answers a person who is present. When none
  // fits, the caller hires one — that is the whole point of the rule, and the
  // rejection message says so.
  it("refuses interface agents", () => {
    expect(
      canAgentOwnTrigger({ id: "engenty.copilot", kind: "interface" })
    ).toBe(false);
    expect(
      canAgentOwnTrigger({ id: "engenty.coordinator", kind: "interface" })
    ).toBe(false);
  });

  it("refuses chat surfaces and delegated sub-agents", () => {
    expect(
      canAgentOwnTrigger({ id: "support.answers", kind: "chat_surface" })
    ).toBe(false);
    expect(canAgentOwnTrigger({ id: "engenty.cli", kind: "delegated" })).toBe(
      false
    );
  });

  it("allows a specialist that exists to do the job", () => {
    expect(
      canAgentOwnTrigger({ id: "contacts.importer", kind: "specialist" })
    ).toBe(true);
  });

  it("treats a missing kind as specialist", () => {
    expect(canAgentOwnTrigger({ id: "contacts.importer" })).toBe(true);
  });
});

describe("canAgentOwnTrigger — module-declared triggers", () => {
  // Module declarations are reviewed like code. Memory consolidation still
  // runs as the copilot. Applying the runtime (custom-routine) rule here
  // would break that on the next declaration sync.
  it("lets a module keep its declared interface owner", () => {
    expect(
      canAgentOwnTrigger({ id: "engenty.copilot", kind: "interface" }, "module")
    ).toBe(true);
  });

  it("still refuses chat surfaces and delegated sub-agents", () => {
    expect(
      canAgentOwnTrigger(
        { id: "support.answers", kind: "chat_surface" },
        "module"
      )
    ).toBe(false);
    expect(
      canAgentOwnTrigger({ id: "engenty.cli", kind: "delegated" }, "module")
    ).toBe(false);
  });
});
