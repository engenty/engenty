import {
  __resetConnectorRegistryForTests,
  connectorOperationId,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
  calendarConnector,
  driveConnector,
  gmailConnector,
  googleConnectors,
} from "./definitions.js";

const VALID_GROUPS = ["read", "write", "destructive"] as const;

const EXPECTED_GROUPS: Record<string, Record<string, string>> = {
  "google-calendar": {
    create_event: "write",
    delete_event: "destructive",
    get_event: "read",
    list_calendars: "read",
    list_events: "read",
    update_event: "write",
  },
  "google-drive": {
    create_file: "write",
    get_file_metadata: "read",
    read_file_content: "read",
    search_files: "read",
  },
  "google-gmail": {
    create_draft: "write",
    get_thread: "read",
    list_drafts: "read",
    list_labels: "read",
    modify_labels: "write",
    search_threads: "read",
    send_message: "destructive",
    trash_message: "destructive",
  },
};

beforeEach(() => {
  __resetConnectorRegistryForTests();
});

describe("connections-google connector definitions", () => {
  it("exposes the three Google connectors with the expected identity", () => {
    expect(googleConnectors.map((c) => c.id)).toEqual([
      "google-gmail",
      "google-drive",
      "google-calendar",
    ]);
    for (const connector of googleConnectors) {
      expect(connector.moduleId).toBe("connections-google");
      expect(connector.auth.kind).toBe("oauth2");
      expect(connector.auth.oauth2.clientIdEnv).toBe("GOOGLE_OAUTH_CLIENT_ID");
      expect(connector.auth.oauth2.clientSecretEnv).toBe(
        "GOOGLE_OAUTH_CLIENT_SECRET"
      );
    }
    expect(gmailConnector.toolPrefix).toBe("gmail");
    expect(driveConnector.toolPrefix).toBe("gdrive");
    expect(calendarConnector.toolPrefix).toBe("gcal");
  });

  it("registers all connectors without duplicate ids or actions", () => {
    for (const connector of googleConnectors) {
      expect(() => registerConnectorDefinition(connector)).not.toThrow();
    }
  });

  it("has unique action ids per connector", () => {
    for (const connector of googleConnectors) {
      const ids = connector.actions.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("uses only valid action groups", () => {
    for (const connector of googleConnectors) {
      for (const action of connector.actions) {
        expect(VALID_GROUPS).toContain(action.group);
      }
    }
  });

  it("assigns the expected group to every action", () => {
    for (const connector of googleConnectors) {
      const expected = EXPECTED_GROUPS[connector.id];
      expect(expected).toBeDefined();
      const actual = Object.fromEntries(
        connector.actions.map((a) => [a.id, a.group])
      );
      expect(actual).toEqual(expected);
    }
  });

  it("projects the expected operation ids", () => {
    expect(
      gmailConnector.actions.map((a) =>
        connectorOperationId(gmailConnector, a.id)
      )
    ).toEqual([
      "gmail_search_threads",
      "gmail_get_thread",
      "gmail_list_labels",
      "gmail_list_drafts",
      "gmail_create_draft",
      "gmail_modify_labels",
      "gmail_send_message",
      "gmail_trash_message",
    ]);
    expect(
      driveConnector.actions.map((a) =>
        connectorOperationId(driveConnector, a.id)
      )
    ).toEqual([
      "gdrive_search_files",
      "gdrive_get_file_metadata",
      "gdrive_read_file_content",
      "gdrive_create_file",
    ]);
    expect(
      calendarConnector.actions.map((a) =>
        connectorOperationId(calendarConnector, a.id)
      )
    ).toEqual([
      "gcal_list_calendars",
      "gcal_list_events",
      "gcal_get_event",
      "gcal_create_event",
      "gcal_update_event",
      "gcal_delete_event",
    ]);
  });

  it("declares provider scopes on every non-read action", () => {
    for (const connector of googleConnectors) {
      for (const action of connector.actions) {
        if (action.group === "read") {
          continue;
        }
        expect(
          action.providerScopes,
          `${connector.id}/${action.id} must declare providerScopes`
        ).toBeDefined();
        expect(action.providerScopes?.length).toBeGreaterThan(0);
        for (const scope of action.providerScopes ?? []) {
          expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
        }
      }
    }
  });

  it("keeps read-only listing/fetch actions in the read group", () => {
    const readActionIds: Record<string, string[]> = {
      "google-calendar": ["list_calendars", "list_events", "get_event"],
      "google-drive": ["search_files", "get_file_metadata", "read_file_content"],
      "google-gmail": [
        "search_threads",
        "get_thread",
        "list_labels",
        "list_drafts",
      ],
    };
    for (const connector of googleConnectors) {
      for (const id of readActionIds[connector.id] ?? []) {
        const action = connector.actions.find((a) => a.id === id);
        expect(action, `${connector.id}/${id} missing`).toBeDefined();
        expect(action?.group).toBe("read");
      }
    }
  });
});
