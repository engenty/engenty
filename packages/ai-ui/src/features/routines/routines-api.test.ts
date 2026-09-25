import { describe, expect, it } from "vitest";
import { toRoutinePayload } from "./routines-api.js";

describe("toRoutinePayload outcomes", () => {
  it("omits outcomes when unset so a PATCH leaves existing bindings", () => {
    expect(toRoutinePayload({ name: "Daily sort" })).toEqual({
      name: "Daily sort",
    });
  });

  it("sends outcomes on create and as a replace-all PATCH, including []", () => {
    expect(
      toRoutinePayload({
        name: "Daily sort",
        outcomes: [
          { mode: "always", provider_id: "notification.high" },
          {
            config: { to: "ops@example.com" },
            mode: "agent",
            provider_id: "email",
          },
        ],
      }).outcomes
    ).toEqual([
      { mode: "always", provider_id: "notification.high" },
      {
        config: { to: "ops@example.com" },
        mode: "agent",
        provider_id: "email",
      },
    ]);
    expect(toRoutinePayload({ outcomes: [] }).outcomes).toEqual([]);
  });
});
