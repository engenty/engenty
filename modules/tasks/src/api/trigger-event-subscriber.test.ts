import { describe, expect, it } from "vitest";
import { eventFilterMatches } from "./trigger-event-subscriber.js";

describe("eventFilterMatches", () => {
  it("matches everything when no filter is set", () => {
    expect(eventFilterMatches(null, { type: "person" })).toBe(true);
    expect(eventFilterMatches({}, {})).toBe(true);
  });

  it("matches shallow scalar values strictly", () => {
    const payload = { count: 2, tenant_id: "t1", type: "person" };
    expect(eventFilterMatches({ type: "person" }, payload)).toBe(true);
    expect(eventFilterMatches({ count: 2, type: "person" }, payload)).toBe(
      true
    );
    expect(eventFilterMatches({ type: "organisation" }, payload)).toBe(false);
    expect(eventFilterMatches({ count: "2" }, payload)).toBe(false);
    expect(eventFilterMatches({ missing: "x" }, payload)).toBe(false);
  });

  it("compares object values structurally", () => {
    const payload = { changed_fields: ["email", "phone"] };
    expect(
      eventFilterMatches({ changed_fields: ["email", "phone"] }, payload)
    ).toBe(true);
    expect(eventFilterMatches({ changed_fields: ["email"] }, payload)).toBe(
      false
    );
  });
});
