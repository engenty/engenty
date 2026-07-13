import { describe, expect, it } from "vitest";
import { computeInvoiceLines } from "./billing.js";

const teamPricing = {
  pricing: {
    base_micros: 49_000_000,
    currency: "usd",
    includedUsers: 25,
    perExtraUser_micros: 5_000_000,
  },
};

describe("computeInvoiceLines", () => {
  it("bills nothing for a package without pricing", () => {
    const r = computeInvoiceLines(
      { pricing: undefined },
      {
        userCount: 100,
        aiCostMicros: 999,
      }
    );
    expect(r.lines).toEqual([]);
    expect(r.totalMicros).toBe(0);
  });

  it("charges only the base when usage is within the included seats", () => {
    const r = computeInvoiceLines(teamPricing, {
      userCount: 10,
      aiCostMicros: 0,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].kind).toBe("base");
    expect(r.totalMicros).toBe(49_000_000);
  });

  it("adds seat overage beyond the included seats", () => {
    const r = computeInvoiceLines(teamPricing, {
      userCount: 30, // 5 over the 25 included
      aiCostMicros: 0,
    });
    const overage = r.lines.find((l) => l.kind === "seat_overage");
    expect(overage?.quantity).toBe(5);
    expect(overage?.amountMicros).toBe(5 * 5_000_000);
    expect(r.totalMicros).toBe(49_000_000 + 25_000_000);
  });

  it("passes through metered AI spend as its own line", () => {
    const r = computeInvoiceLines(teamPricing, {
      userCount: 10,
      aiCostMicros: 12_000_000,
    });
    const ai = r.lines.find((l) => l.kind === "ai_usage");
    expect(ai?.amountMicros).toBe(12_000_000);
    expect(r.totalMicros).toBe(49_000_000 + 12_000_000);
  });
});
