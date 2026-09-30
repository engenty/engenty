import { describe, expect, it } from "vitest";
import {
  type SpaceHomeExtensionAccount,
  selectSpaceHomeExtensionRows,
} from "./space-home-extensions";

const account = (
  overrides: Partial<SpaceHomeExtensionAccount> = {}
): SpaceHomeExtensionAccount => ({
  connectedBy: null,
  connectorId: "google-gmail",
  connectorName: "Gmail",
  id: "conn-gmail",
  label: "me@example.com",
  status: "active",
  ...overrides,
});

describe("selectSpaceHomeExtensionRows", () => {
  it("lists the space's accounts and plugins — not modules or skills", () => {
    const rows = selectSpaceHomeExtensionRows(
      [
        { resourceKey: "mod-tasks", resourceType: "module" },
        { resourceKey: "skill-custom", resourceType: "skill" },
        { resourceKey: "slack", resourceType: "plugin" },
      ],
      [account()],
      { plugins: new Map([["slack", "Slack"]]) }
    );
    expect(rows.map((row) => row.label)).toEqual(["me@example.com", "Slack"]);
    expect(rows.map((row) => row.status)).toEqual(["active", "pending"]);
  });

  it("shows an enabled plugin once its account is connected, as the account", () => {
    const rows = selectSpaceHomeExtensionRows(
      [{ resourceKey: "google-gmail", resourceType: "plugin" }],
      [account()]
    );
    expect(rows.map((row) => row.kind)).toEqual(["connection"]);
  });

  it("sorts by the label a person reads", () => {
    const rows = selectSpaceHomeExtensionRows(
      [],
      [
        account({ id: "a", label: "zeta@example.com" }),
        account({ id: "b", label: "alpha@example.com" }),
      ]
    );
    expect(rows.map((row) => row.label)).toEqual([
      "alpha@example.com",
      "zeta@example.com",
    ]);
  });
});
