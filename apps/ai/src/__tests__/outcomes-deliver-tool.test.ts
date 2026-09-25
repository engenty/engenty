import { describe, expect, it, vi } from "vitest";
import { createOutcomesDeliverTool } from "../../ai/tools/outcomes-deliver-tool.js";
import type { RoutineOutcomeRow } from "../dal/routines/routine-outcome-store.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ROUTINE = "33333333-3333-4333-8333-333333333333";

const binding: RoutineOutcomeRow = {
  config: {},
  created_at: "",
  description: null,
  enabled: true,
  id: "66666666-6666-4666-8666-666666666666",
  mode: "agent",
  provider_id: "notification.high",
  routine_id: ROUTINE,
  tenant_id: TENANT,
  updated_at: "",
};

const disabled: RoutineOutcomeRow = {
  ...binding,
  enabled: false,
  id: "77777777-7777-4777-8777-777777777777",
};

function deliverTool(routines = { get: vi.fn(async () => null) }) {
  return createOutcomesDeliverTool({
    bindings: [binding, disabled],
    graphRunId: "33333333-3333-4333-8333-333333333333",
    requestId: "22222222-2222-4222-8222-222222222222",
    routineId: ROUTINE,
    routines,
    tenantId: TENANT,
    threadId: "88888888-8888-4888-8888-888888888888",
  }).outcomes_deliver as {
    description: string;
    execute: (input: unknown, ctx: unknown) => Promise<unknown>;
  };
}

describe("outcomes_deliver", () => {
  it.each([
    ["a binding of another routine", "99999999-9999-4999-8999-999999999999"],
    ["a disabled binding of this routine", disabled.id],
  ])("refuses %s", async (_label, outcomeId) => {
    // Refused before the delivery path loads the routine.
    const routines = { get: vi.fn(async () => null) };
    const result = await deliverTool(routines).execute(
      { outcome_id: outcomeId, payload: {} },
      {}
    );
    expect(result).toMatchObject({ already: false, delivered: false });
    expect(routines.get).not.toHaveBeenCalled();
  });

  it("names only the enabled agent-mode bindings the agent can deliver to", () => {
    const { description } = deliverTool();
    expect(description).toContain(binding.id);
    expect(description).not.toContain(disabled.id);
  });
});
