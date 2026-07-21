// The consolidation routine declaration: reconciled on boot into a
// source:"module" schedule trigger (non-deletable, per-tenant disable via the
// trigger row). Assert the declaration parses into the RoutineDefinition
// shape the scheduler consumes.

import { describe, expect, it } from "vitest";
import { memoryAiRegistration } from "../ai/registrar.js";

describe("memory AI registration", () => {
  it("declares the weekly consolidation routine as a task_template target", () => {
    const registration = memoryAiRegistration();
    expect(registration.module_id).toBe("memory");
    const routines = registration.routines ?? [];
    expect(routines).toHaveLength(1);
    const consolidate = routines[0];
    expect(consolidate).toMatchObject({
      enabled_by_default: true,
      id: "memory.consolidate",
      module_id: "memory",
      name: "Consolidate agent memory",
      schedule: "0 5 * * 1",
      suppress_if_no_op: true,
      target: {
        kind: "task_template",
        task_template: {
          agent_type_key: "engenty.copilot",
          priority: "low",
          title: "Weekly memory consolidation",
        },
      },
    });
    expect(consolidate?.description).toContain("near-duplicates");
    expect(consolidate?.description).toContain("supersedes");
    expect(consolidate?.description).toContain("~20 operations");
  });

  it("declares no agents or tools (memory tools are host-provided)", () => {
    const registration = memoryAiRegistration();
    expect(registration.agents).toEqual([]);
    expect(registration.dynamic?.agent_configs ?? []).toEqual([]);
  });
});
