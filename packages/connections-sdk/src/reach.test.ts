import { describe, expect, it } from "vitest";
import {
  connectionVisibleToUser,
  connectorPrefixesForAgent,
  isAccountReachableInRun,
  shouldMigrateOrgAccountToAllSpaces,
} from "./reach.js";

const owned = {
  all_spaces: false,
  id: "c-mine",
  owner_user_id: "user-1",
};
const allSpaces = {
  all_spaces: true,
  id: "c-org",
  owner_user_id: "admin",
};
const other = {
  all_spaces: false,
  id: "c-other",
  owner_user_id: "user-2",
};

describe("connectionVisibleToUser", () => {
  it("shows owned and all-spaces accounts, not a colleague's", () => {
    expect(connectionVisibleToUser(owned, "user-1")).toBe(true);
    expect(connectionVisibleToUser(allSpaces, "user-1")).toBe(true);
    expect(connectionVisibleToUser(other, "user-1")).toBe(false);
  });
});

describe("isAccountReachableInRun", () => {
  it("unions agent grants with space mounts (river rule)", () => {
    expect(
      isAccountReachableInRun({
        agentGrantedIds: new Set(["c-other"]),
        agentId: "engenty.copilot",
        connection: other,
        mountedIds: new Set(["c-org"]),
      })
    ).toBe(true);
    expect(
      isAccountReachableInRun({
        agentGrantedIds: new Set(),
        agentId: "engenty.copilot",
        connection: other,
        mountedIds: new Set(["c-org"]),
      })
    ).toBe(false);
  });

  it("treats all-spaces as mounted everywhere", () => {
    expect(
      isAccountReachableInRun({
        connection: allSpaces,
        mountedIds: new Set(),
      })
    ).toBe(true);
  });

  it("on a global agent run, only grants and all-spaces — not every owned mailbox", () => {
    expect(
      isAccountReachableInRun({
        agentGrantedIds: new Set(),
        agentId: "engenty.copilot",
        connection: owned,
        mountedIds: null,
      })
    ).toBe(false);
    expect(
      isAccountReachableInRun({
        agentGrantedIds: new Set(["c-mine"]),
        agentId: "engenty.copilot",
        connection: owned,
        mountedIds: null,
      })
    ).toBe(true);
    expect(
      isAccountReachableInRun({
        agentGrantedIds: new Set(),
        agentId: "engenty.copilot",
        connection: allSpaces,
        mountedIds: null,
      })
    ).toBe(true);
  });
});

describe("connectorPrefixesForAgent", () => {
  it("empty preferred list is the space plus grants", () => {
    expect(
      connectorPrefixesForAgent({
        allSpacesPrefixes: new Set(["slack"]),
        grantPrefixes: new Set(["gmail"]),
        hasSpace: true,
        preferredPrefixes: new Set(),
        spacePrefixes: new Set(["gcal"]),
      })
    ).toEqual(new Set(["gcal", "slack", "gmail"]));
  });

  it("non-empty preferred list intersects the space, then adds grants", () => {
    expect(
      connectorPrefixesForAgent({
        allSpacesPrefixes: new Set(["slack"]),
        grantPrefixes: new Set(["gmail"]),
        hasSpace: true,
        preferredPrefixes: new Set(["gcal", "gmail"]),
        spacePrefixes: new Set(["gcal", "gdrive"]),
      })
    ).toEqual(new Set(["gcal", "gmail"]));
  });

  it("outside a space, all-spaces plus grants are the whole surface", () => {
    expect(
      connectorPrefixesForAgent({
        allSpacesPrefixes: new Set(["slack"]),
        grantPrefixes: new Set(["gmail"]),
        hasSpace: false,
        preferredPrefixes: new Set(),
        spacePrefixes: new Set(["gcal"]),
      })
    ).toEqual(new Set(["slack", "gmail"]));
  });
});

describe("shouldMigrateOrgAccountToAllSpaces", () => {
  it("matches the SQL: org with no mount becomes all-spaces", () => {
    expect(
      shouldMigrateOrgAccountToAllSpaces({
        hasSpaceMount: false,
        sharing: "org",
      })
    ).toBe(true);
    expect(
      shouldMigrateOrgAccountToAllSpaces({
        hasSpaceMount: true,
        sharing: "org",
      })
    ).toBe(false);
    expect(
      shouldMigrateOrgAccountToAllSpaces({
        hasSpaceMount: false,
        sharing: "personal",
      })
    ).toBe(false);
  });
});
