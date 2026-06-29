import { describe, expect, it } from "vitest";
import { formatCopilotSessionShortId } from "./session-label.js";

describe("formatCopilotSessionShortId", () => {
  it("uses head and tail so nearby v7 ids differ", () => {
    const a = "019e24a1-3ecf-7aa8-bc8e-30081b003458";
    const b = "019e24a1-4ecf-7aa8-bc8e-30081b003459";
    expect(formatCopilotSessionShortId(a)).not.toBe(
      formatCopilotSessionShortId(b)
    );
  });
});
