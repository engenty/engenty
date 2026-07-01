import { describe, expect, it } from "vitest";
import { formatGatewayModelPricingSummary } from "./format-gateway-model-pricing";

const labels = {
  inLabel: "in",
  outLabel: "out",
  perMtokLabel: "/ Mtok",
  unknownLabel: "Pricing unknown",
};

describe("formatGatewayModelPricingSummary", () => {
  it("formats input and output micros per Mtok", () => {
    expect(
      formatGatewayModelPricingSummary(400_000, 1_600_000, labels)
    ).toMatch(/in · .* out \/ Mtok/);
  });

  it("returns unknown label when pricing is missing", () => {
    expect(formatGatewayModelPricingSummary(null, null, labels)).toBe(
      "Pricing unknown"
    );
  });
});
