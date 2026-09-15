import { describe, expect, it } from "vitest";
import {
  type SpaceHomeExtensionAccount,
  selectSpaceHomeExtensionRows,
  spaceAddAccountPath,
} from "./space-home-extensions";

const meta = (
  overrides: Partial<SpaceHomeExtensionAccount> = {}
): SpaceHomeExtensionAccount => ({
  connectorId: "google-gmail",
  connectorName: "Gmail",
  label: "me@example.com",
  ...overrides,
});

describe("selectSpaceHomeExtensionRows", () => {
  it("lists mounted accounts by the mailbox, not the connector", () => {
    const rows = selectSpaceHomeExtensionRows(
      [
        { resourceKey: "mod-tasks", resourceType: "module" },
        { resourceKey: "conn-gmail", resourceType: "connection" },
        { resourceKey: "skill-custom", resourceType: "skill" },
      ],
      new Map([["conn-gmail", meta()]])
    );
    expect(rows).toEqual([
      {
        connectorId: "google-gmail",
        connectorName: "Gmail",
        id: "conn-gmail",
        label: "me@example.com",
      },
    ]);
  });

  it("keeps a mount whose account the viewer cannot see", () => {
    const rows = selectSpaceHomeExtensionRows(
      [{ resourceKey: "conn-hidden", resourceType: "connection" }],
      new Map()
    );
    expect(rows).toEqual([
      {
        connectorId: null,
        connectorName: null,
        id: "conn-hidden",
        label: "conn-hidden",
      },
    ]);
  });

  it("sorts by the label a person reads", () => {
    const rows = selectSpaceHomeExtensionRows(
      [
        { resourceKey: "b", resourceType: "connection" },
        { resourceKey: "a", resourceType: "connection" },
      ],
      new Map([
        ["a", meta({ label: "zeta@example.com" })],
        ["b", meta({ label: "alpha@example.com" })],
      ])
    );
    expect(rows.map((row) => row.label)).toEqual([
      "alpha@example.com",
      "zeta@example.com",
    ]);
  });
});

describe("spaceAddAccountPath", () => {
  it("carries the space and the page to return to", () => {
    expect(spaceAddAccountPath("space-1", "/s/game")).toBe(
      "/settings/connections?back=%2Fs%2Fgame&space=space-1"
    );
  });

  it("opens one provider when a connector id is given", () => {
    expect(spaceAddAccountPath("space-1", "/s/game", "google-gmail")).toBe(
      "/settings/connections/google-gmail?back=%2Fs%2Fgame&space=space-1"
    );
  });
});
