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

  it("requires offer_file_downloads files with keys", () => {
    expect(
      getFrontendToolInputValidationError("offer_file_downloads", {})
    ).toMatch(/requires input/);
    expect(
      getFrontendToolInputValidationError("offer_file_downloads", {
        files: [{ key: "tenants/t1/ai/workspace/report.csv" }],
      })
    ).toBeNull();
    expect(
      getFrontendToolInputValidationError("offer_file_downloads", {
        files: [{ name: "report.csv" }],
      })
    ).toMatch(/non-empty key/);
  });
});
