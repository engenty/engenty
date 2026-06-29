import { describe, expect, it } from "vitest";
import { resolveGenerativeUiToolPhase } from "./tool-call-generative-ui-card.js";

const generativeOutput = {
  __type: "generative-ui",
  spec: {
    elements: {
      btn: { props: { label: "Go" }, type: "Button" },
    },
    root: "btn",
  },
};

describe("resolveGenerativeUiToolPhase", () => {
  it("stays interactive while the tool is still running", () => {
    expect(
      resolveGenerativeUiToolPhase({
        output: generativeOutput,
        state: "running",
      })
    ).toBe("interactive");
  });

  it("collapses after submitted output metadata", () => {
    expect(
      resolveGenerativeUiToolPhase({
        output: { ...generativeOutput, phase: "submitted" },
        state: "completed",
      })
    ).toBe("submitted");
  });

  it("marks readonly when output phase is readonly", () => {
    expect(
      resolveGenerativeUiToolPhase({
        output: { ...generativeOutput, phase: "readonly" },
        state: "completed",
      })
    ).toBe("readonly");
  });

  it("keeps interactive renderer when completed without submit marker", () => {
    expect(
      resolveGenerativeUiToolPhase({
        output: generativeOutput,
        state: "completed",
      })
    ).toBe("interactive");
  });
});
