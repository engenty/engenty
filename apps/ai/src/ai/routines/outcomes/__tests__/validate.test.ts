import { describe, expect, it } from "vitest";
import { RoutineValidationError } from "../../routine-validation.js";
import { validateAgainstJsonSchema } from "../validate.js";

describe("validateAgainstJsonSchema", () => {
  it("accepts an empty object against the empty config schema", () => {
    expect(
      validateAgainstJsonSchema(
        {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        {},
        "desk.chat config"
      )
    ).toEqual({});
  });

  it("rejects a missing required config field", () => {
    expect(() =>
      validateAgainstJsonSchema(
        {
          additionalProperties: false,
          properties: { to: { type: "string" } },
          required: ["to"],
          type: "object",
        },
        {},
        "email config"
      )
    ).toThrow(RoutineValidationError);
  });
});
