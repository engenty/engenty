import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildFrontendToolDefinitionFromZod } from "../zod-frontend-tool.js";

const themeSpec = {
  description: "Switch the app color theme.",
  name: "shell_set_theme",
  safety: "safe" as const,
  schema: z.object({ theme: z.enum(["light", "dark", "system"]) }),
  title: "Set theme",
};

describe("buildFrontendToolDefinitionFromZod", () => {
  it("generates a JSON Schema matching the hand-written shape (no $schema)", () => {
    const def = buildFrontendToolDefinitionFromZod(themeSpec);
    expect(def.name).toBe("shell_set_theme");
    expect(def.parameters).toEqual({
      additionalProperties: false,
      properties: {
        theme: { enum: ["light", "dark", "system"], type: "string" },
      },
      required: ["theme"],
      type: "object",
    });
    expect(def.parameters).not.toHaveProperty("$schema");
  });

  it("threads title into engenty metadata; availability defaults to enabled", () => {
    const def = buildFrontendToolDefinitionFromZod(themeSpec);
    expect(def.metadata.engenty).toMatchObject({
      availability: "enabled",
      title: "Set theme",
    });
  });

  it("omits optional fields from required and honors explicit availability", () => {
    const def = buildFrontendToolDefinitionFromZod({
      availability: "remote",
      description: "Navigate to an internal path.",
      name: "navigate",
      schema: z.object({ to: z.string(), replace: z.boolean().optional() }),
    });
    expect(def.parameters.required).toEqual(["to"]);
    expect(def.metadata.engenty.availability).toBe("remote");
  });
});
