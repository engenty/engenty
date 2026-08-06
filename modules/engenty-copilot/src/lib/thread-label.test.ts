import { describe, expect, it } from "vitest";
import { formatCopilotThreadShortId } from "./thread-label.js";

describe("formatCopilotThreadShortId", () => {
  it("uses head and tail so nearby v7 ids differ", () => {
    const a = "019e24a1-3ecf-7aa8-bc8e-30081b003458";
    const b = "019e24a1-4ecf-7aa8-bc8e-30081b003459";
    expect(formatCopilotThreadShortId(a)).not.toBe(
      formatCopilotThreadShortId(b)
    );
  });
});
