import { describe, expect, it } from "vitest";
import { resolveCopilotSpaceId } from "./copilot-space";

const SPACES = [
  { id: "space-company", key: "company" },
  { id: "space-marketing", key: "marketing" },
  { id: "space-mine", key: "matthias" },
];

describe("resolveCopilotSpaceId", () => {
  it("uses the space in the URL", () => {
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/marketing/copilot",
        spaces: SPACES,
      })
    ).toBe("space-marketing");
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/company/offers/ENG-041",
        spaces: SPACES,
      })
    ).toBe("space-company");
  });

  it("is nowhere outside a space — the turn is everywhere, not in a default", () => {
    for (const pathname of ["/copilot", "/mdl/contacts", "/settings"]) {
      expect(resolveCopilotSpaceId({ pathname, spaces: SPACES })).toBeNull();
    }
  });

  it("does not guess a space for a key nobody has", () => {
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/deleted-space/copilot",
        spaces: SPACES,
      })
    ).toBeNull();
  });
});
