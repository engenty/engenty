import { describe, expect, it } from "vitest";
import { ENGENTY_SERVICE_ERROR_CODES } from "./service-error-codes.js";

describe("ENGENTY_SERVICE_ERROR_CODES", () => {
  it("exposes stable numeric operator-facing codes", () => {
    expect(ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE).toBe("50001");
    expect(ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE).toBe("50002");
    expect(ENGENTY_SERVICE_ERROR_CODES.SETUP_BACKEND_ERROR).toBe("50003");
  });

  it("uses purely numeric strings (no ENG_* prefixes)", () => {
    for (const code of Object.values(ENGENTY_SERVICE_ERROR_CODES)) {
      expect(code).toMatch(/^\d+$/);
    }
  });
});
