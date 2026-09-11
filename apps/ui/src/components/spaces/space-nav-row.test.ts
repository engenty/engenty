import { describe, expect, it } from "vitest";
import { formatNavCount } from "./space-nav-row";

describe("formatNavCount", () => {
  it("caps at 99+", () => {
    expect(formatNavCount(0)).toBe("0");
    expect(formatNavCount(3)).toBe("3");
    expect(formatNavCount(99)).toBe("99");
    expect(formatNavCount(100)).toBe("99+");
  });
});
