import { describe, expect, it } from "vitest";
import type { SpaceGateContext } from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import { inheritChildSpace } from "../child-space.js";

const marketing: SpaceGateContext = {
  allConnectorPrefixes: new Set(),
  connectorPrefixes: new Set(),
  moduleIds: new Set(["projects"]),
  readOnlyModuleIds: new Set(),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

const company: SpaceGateContext = {
  ...marketing,
  spaceId: "019fe8ec-0000-0000-0000-000000000002",
};

const unresolved: SpaceGateContext = {
  claimed_space_id: marketing.spaceId,
  kind: "unresolved",
  reason: "forbidden",
};

describe("inheritChildSpace", () => {
  it("lets a child inherit the parent Space", () => {
    expect(inheritChildSpace({ parent: marketing })).toEqual(marketing);
  });

  it("refuses to broaden a resolved parent into tenant-global", () => {
    expect(inheritChildSpace({ parent: marketing, requested: null })).toEqual(
      marketing
    );
  });

  it("refuses to switch to a different Space", () => {
    expect(
      inheritChildSpace({ parent: marketing, requested: company })
    ).toEqual(marketing);
  });

  it("keeps an unresolved parent unresolved — never global", () => {
    expect(inheritChildSpace({ parent: unresolved, requested: null })).toEqual(
      unresolved
    );
    expect(
      inheritChildSpace({ parent: unresolved, requested: marketing })
    ).toEqual(unresolved);
  });

  it("allows a global parent to narrow to a Space", () => {
    expect(inheritChildSpace({ parent: null, requested: marketing })).toEqual(
      marketing
    );
  });
});
