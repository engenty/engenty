import { describe, expect, it } from "vitest";
import { CONNECTOR_ACTION_SPACE_POLICY } from "./runtime.js";

describe("connector action spacePolicy", () => {
  it("declares account_mounted without a connection UUID key", () => {
    // `account` is a label, not a connection id; execute still intersects
    // candidates with Space mounts. Core must not treat the label as a UUID.
    expect(CONNECTOR_ACTION_SPACE_POLICY).toEqual({
      kind: "account_mounted",
    });
  });
});
