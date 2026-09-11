import { describe, expect, it } from "vitest";
import {
  firstSuccessfulDeskPath,
  spaceAgentDeskPath,
  spaceRootPath,
} from "./hire-spaces";

describe("hire space paths", () => {
  it("builds the space desk URL", () => {
    expect(spaceAgentDeskPath("marketing", "sales.researcher")).toBe(
      "/s/marketing/agents/sales.researcher"
    );
    expect(spaceRootPath("a/b")).toBe("/s/a%2Fb");
  });

  it("returns the first successful mount's desk and null when all fail", () => {
    const spaces = [
      { id: "space-1", key: "alpha" },
      { id: "space-2", key: "beta" },
    ];
    expect(
      firstSuccessfulDeskPath(
        [
          { ok: false, spaceId: "space-1" },
          { ok: true, spaceId: "space-2" },
        ],
        spaces,
        "sales.researcher"
      )
    ).toBe("/s/beta/agents/sales.researcher");
    expect(
      firstSuccessfulDeskPath(
        [{ ok: false, spaceId: "space-1" }],
        spaces,
        "sales.researcher"
      )
    ).toBeNull();
  });
});
