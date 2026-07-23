import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { triggerCreateInputSchema, triggerUpdateInputSchema } from "./zod.js";

// A module routine's whole ROUTINE.md body is stored as the trigger
// description — that body is the operating procedure the executing agent
// reads. A cap sized for a label (the original 1000 chars) rejected the create
// outright, which took the entire scheduler reconcile down with it, so every
// scheduled trigger stopped firing. Guard the real shape, not an arbitrary
// number.
const COORDINATOR_ROUTINE = fileURLToPath(
  new URL(
    "../../../engenty-coordinator/ai/routines/heartbeat/ROUTINE.md",
    import.meta.url
  )
);

function routineBody(): string {
  const raw = readFileSync(COORDINATOR_ROUTINE, "utf8");
  return raw.split(/^---$/m).slice(2).join("---").trim();
}

describe("trigger description limit", () => {
  it("accepts a real ROUTINE.md body on create", () => {
    const body = routineBody();
    expect(body.length).toBeGreaterThan(1000);
    const parsed = triggerCreateInputSchema.safeParse({
      description: body,
      kind: "schedule",
      name: "Coordinator heartbeat",
      task_template: {
        agent_type_key: "engenty.coordinator",
        name: "Coordinator heartbeat",
        title: "Coordinator heartbeat",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a real ROUTINE.md body on update", () => {
    const parsed = triggerUpdateInputSchema.safeParse({
      description: routineBody(),
    });
    expect(parsed.success).toBe(true);
  });
});
