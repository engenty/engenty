import {
  ActionSchema,
  DynamicStringSchema,
  scrapeSchemaBehavior,
} from "@a2ui/web_core/v0_9";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Regression guard for the zod-3 pin (root package.json scoped overrides).
 *
 * The A2UI generic binder introspects component schemas via zod-3 internals
 * (`_def.typeName`). Under zod 4 those keys are renamed (`_def.type`), so the
 * binder silently recognizes nothing — actions never become dispatch closures
 * and `{path}` data-bindings never resolve, while literal/objectRef surfaces
 * keep rendering. A workspace-wide `"zod": "4.4.3"` override once defeated the
 * catalog's zod-3 pin and broke exactly this. If this test fails, the a2ui
 * stack has drifted back onto zod 4 — re-check the scoped `@a2ui/*` /
 * `@engenty/a2ui-catalog` zod overrides.
 */

describe("A2UI binder schema contract (zod 3)", () => {
  it("this package's zod exposes the _def.typeName the binder reads", () => {
    // zod 4 makes this `undefined` (it uses `_def.type` instead).
    expect(z.object({ a: z.string() })._def.typeName).toBe("ZodObject");
    expect(z.string().optional()._def.typeName).toBe("ZodOptional");
  });

  it("resolves an action field to ACTION and a dynamic field to DYNAMIC", () => {
    const behavior = scrapeSchemaBehavior(
      z.object({
        action: ActionSchema.optional(),
        title: DynamicStringSchema.optional(),
      })
    );
    expect(behavior.shape?.action).toEqual({ type: "ACTION" });
    expect(behavior.shape?.title).toEqual({ type: "DYNAMIC" });
  });
});
