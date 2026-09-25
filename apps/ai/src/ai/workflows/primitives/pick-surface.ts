// `pick_surface` — Jev chooses the next authored wizard gate.
//
// Pages stay in the workflow JSON. This node scores the candidate gate ids
// (and optional fields) and returns the chosen surface so the mapping after
// it can feed `approval_gate`. It never invents a component or a label.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { pickAuthoredGate } from "../pick-surface.js";
import { PICK_SURFACE_PRIMITIVE_ID } from "../primitive-ids.js";
import { approvalGateKindSchema } from "./approval-gate.js";

export { PICK_SURFACE_PRIMITIVE_ID } from "../primitive-ids.js";

const candidateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  kind: approvalGateKindSchema.default("surface"),
  payload: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
  optional_fields: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .optional(),
});

const inputSchema = z.object({
  prompt: z
    .string()
    .max(500)
    .describe("The person's request, for choosing among authored pages."),
  candidates: z.array(candidateSchema).min(1),
});

const outputSchema = z.object({
  gate_id: z.string(),
  kind: approvalGateKindSchema,
  payload: z.record(z.string(), z.unknown()),
  surface: z.object({
    components: z.array(z.record(z.string(), z.unknown())),
    data: z.record(z.string(), z.unknown()),
  }),
  title: z.string(),
});

export function createPickSurfacePrimitive() {
  return createTool({
    id: PICK_SURFACE_PRIMITIVE_ID,
    description:
      "Pick the next authored wizard page. Candidates are prepared A2UI gates; Jev chooses among them and may drop optional fields. Do not generate a new page.",
    inputSchema,
    outputSchema,
    execute: async (input) => pickAuthoredGate(input),
  });
}
