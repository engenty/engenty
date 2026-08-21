import { describe, expect, it } from "vitest";
import { getFrontendToolInputValidationError } from "../validate-frontend-tool-input.js";

describe("getFrontendToolInputValidationError", () => {
  it("requires navigate to include an internal path", () => {
    expect(getFrontendToolInputValidationError("navigate", {})).toMatch(
      /requires input/
    );
    expect(
      getFrontendToolInputValidationError("navigate", {
        to: "/mdl/contacts",
      })
    ).toBeNull();
  });

  it("rejects external navigate targets", () => {
    expect(
      getFrontendToolInputValidationError("navigate", {
        to: "https://example.com",
      })
    ).toMatch(/internal application paths/);
  });
});
