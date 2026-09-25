// @vitest-environment jsdom
import {
  ActionSchema,
  DynamicStringSchema,
  scrapeSchemaBehavior,
} from "@a2ui/web_core/v0_9";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEngentyA2uiCatalog } from "./catalog.js";

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

function shapeOf(name: string) {
  const implementation = createEngentyA2uiCatalog().components.get(name);
  if (!implementation) {
    throw new Error(`catalog has no component ${name}`);
  }
  const behavior = scrapeSchemaBehavior(implementation.schema);
  if (behavior.type !== "OBJECT") {
    throw new Error(`expected an OBJECT behavior node, got ${behavior.type}`);
  }
  return behavior.shape;
}

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
    if (behavior.type !== "OBJECT") {
      throw new Error(`expected an OBJECT behavior node, got ${behavior.type}`);
    }
    expect(behavior.shape.action).toEqual({ type: "ACTION" });
    expect(behavior.shape.title).toEqual({ type: "DYNAMIC" });
  });

  it("Form's submit is an ACTION and its children are STRUCTURAL", () => {
    const shape = shapeOf("Form");
    expect(shape.submit).toEqual({ type: "ACTION" });
    expect(shape.children).toEqual({ type: "STRUCTURAL" });
  });

  it("every input's value is DYNAMIC so the binder generates setValue", () => {
    for (const name of [
      "TextField",
      "TextArea",
      "NumberField",
      "Select",
      "MultipleChoice",
      "CheckBox",
      "DateInput",
      "ObjectPicker",
    ]) {
      expect(shapeOf(name).value, name).toEqual({ type: "DYNAMIC" });
    }
    expect(shapeOf("Table").rows).toEqual({ type: "DYNAMIC" });
    expect(shapeOf("BarChart").points).toEqual({ type: "DYNAMIC" });
    expect(shapeOf("DonutChart").slices).toEqual({ type: "DYNAMIC" });
    expect(shapeOf("Metric").sparkline).toEqual({ type: "DYNAMIC" });
  });
});
