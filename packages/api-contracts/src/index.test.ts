import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiPaginatedMetaSchema,
  getApiErrorCode,
  getApiErrorMessage,
  normalizeSuccessPayload,
  parseApiSuccess,
} from "./index.js";

describe("api-contracts", () => {
  it("parses success envelopes", () => {
    const parsed = parseApiSuccess(
      {
        ok: true,
        data: { id: "contact-1" },
      },
      z.object({ id: z.string() })
    );

    expect(parsed.data.id).toBe("contact-1");
  });

  it("normalizes paginated payloads into data plus meta", () => {
    const normalized = normalizeSuccessPayload({
      data: [{ id: "contact-1" }],
      total: 12,
      page: 2,
      pageSize: 25,
    });

    expect(normalized).toEqual({
      ok: true,
      data: [{ id: "contact-1" }],
      meta: {
        total: 12,
        page: 2,
        pageSize: 25,
      },
    });
    expect(apiPaginatedMetaSchema.parse(normalized.meta)).toEqual({
      total: 12,
      page: 2,
      pageSize: 25,
    });
  });

  it("normalizes single data wrappers", () => {
    expect(normalizeSuccessPayload({ data: ["a", "b"] })).toEqual({
      ok: true,
      data: ["a", "b"],
    });
  });

  it("reads structured error details", () => {
    const error = {
      ok: false,
      error: {
        code: "approval_required",
        message: "Approval required",
      },
    };

    expect(getApiErrorCode(error)).toBe("approval_required");
    expect(getApiErrorMessage(error)).toBe("Approval required");
  });
});
