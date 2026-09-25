import { describe, expect, it } from "vitest";
import {
  type SpaceHomeExtensionAccount,
  selectSpaceHomeExtensionRows,
  spaceAddAccountPath,
} from "./space-home-extensions";

const account = (
  overrides: Partial<SpaceHomeExtensionAccount> = {}
): SpaceHomeExtensionAccount => ({
  connectorId: "google-gmail",
  connectorName: "Gmail",
  id: "conn-gmail",
  label: "me@example.com",
  ...overrides,
});

describe("selectSpaceHomeExtensionRows", () => {
  it("lists the space's accounts, plugins, and skills — not modules", () => {
    const rows = selectSpaceHomeExtensionRows(
      [
        { resourceKey: "mod-tasks", resourceType: "module" },
        { resourceKey: "skill-custom", resourceType: "skill" },
        { resourceKey: "google-gmail", resourceType: "plugin" },
      ],
      [account()],
      {
        plugins: new Map([["google-gmail", "Gmail"]]),
        skills: new Map([["skill-custom", "Triage"]]),
      }
    );
    expect(rows.map((row) => row.label)).toEqual([
      "Gmail",
      "me@example.com",
      "Triage",
    ]);
    expect(rows.map((row) => row.kind)).toEqual([
      "plugin",
      "connection",
      "skill",
    ]);
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
