// A connection belongs to one Space: its tools run only where that connector
// is mounted, even though every connector shares one connections-* module.

import { describe, expect, it } from "vitest";
import {
  callSpaceIdFor,
  checkOperationAgainstSpace,
  type SpaceGateContext,
  type SpaceGateSurface,
} from "../../ai/tools/engenty-tools/lib/space-gate.js";

/** Mounts Gmail but not Drive. */
const marketing: SpaceGateSurface = {
  allConnectorPrefixes: new Set(["gmail", "gdrive"]),
  connectorPrefixes: new Set(["gmail"]),
  moduleIds: new Set(["tasks"]),
  readOnlyModuleIds: new Set(),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

describe("callSpaceIdFor", () => {
  const personal = "019fe8ec-0000-0000-0000-00000000000f";
  const copilotInMarketing = { ...marketing, resourceSpaceId: personal };

  it("names the resource Space for connector and connections calls", () => {
    expect(
      callSpaceIdFor({ operationId: "gmail_send" }, copilotInMarketing)
    ).toBe(personal);
    expect(
      callSpaceIdFor(
        { moduleId: "connections", operationId: "connections_list_accounts" },
        copilotInMarketing
      )
    ).toBe(personal);
  });

  it("names the Space the run stands in for everything else", () => {
    expect(
      callSpaceIdFor(
        { moduleId: "tasks", operationId: "tasks_create" },
        copilotInMarketing
      )
    ).toBe(marketing.spaceId);
    expect(callSpaceIdFor({ operationId: "gmail_send" }, marketing)).toBe(
      marketing.spaceId
    );
  });
});

function connectorCall(operationId: string, space: SpaceGateContext) {
  return checkOperationAgainstSpace({
    moduleId: "connections-google",
    operationId,
    readOnly: true,
    space,
  });
}

describe("connector mounts", () => {
  it("allows a mounted connector and refuses an unmounted one", () => {
    expect(connectorCall("gmail_search_threads", marketing)).toBeNull();
    expect(connectorCall("gdrive_files_list", marketing)?.error).toBe(
      "connector_not_in_space"
    );
  });

  it("attributes an operation to the longest matching connector prefix", () => {
    const shortMounted: SpaceGateSurface = {
      ...marketing,
      allConnectorPrefixes: new Set(["google", "google_drive"]),
      connectorPrefixes: new Set(["google"]),
    };
    expect(connectorCall("google_drive_list_files", shortMounted)?.error).toBe(
      "connector_not_in_space"
    );
  });

  it("refuses connectors on a run outside any Space but keeps modules open", () => {
    const global = {
      allConnectorPrefixes: new Set(["gmail", "gdrive"]),
      connectorPrefixes: new Set<string>(),
      kind: "global" as const,
    };
    expect(connectorCall("gmail_search_threads", global)?.error).toBe(
      "connector_not_in_space"
    );
    expect(
      checkOperationAgainstSpace({
        moduleId: "offers",
        operationId: "offers_list",
        readOnly: true,
        space: global,
      })
    ).toBeNull();
  });
});
