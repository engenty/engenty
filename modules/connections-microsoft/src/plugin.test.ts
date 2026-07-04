import {
  __resetConnectorRegistryForTests,
  connectorOperationId,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { microsoftOneDriveConnector } from "./onedrive.js";
import { microsoftOutlookConnector } from "./outlook.js";

const connectors = [microsoftOutlookConnector, microsoftOneDriveConnector];

afterEach(() => {
  __resetConnectorRegistryForTests();
});

describe("connections-microsoft connectors", () => {
  it("registers both definitions without id/action collisions", () => {
    for (const connector of connectors) {
      expect(() => registerConnectorDefinition(connector)).not.toThrow();
    }
  });

  it("has unique action ids within each connector", () => {
    for (const connector of connectors) {
      const ids = connector.actions.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("only uses valid action groups", () => {
    for (const connector of connectors) {
      for (const action of connector.actions) {
        expect(["read", "write", "destructive"]).toContain(action.group);
      }
    }
  });

  it("projects the expected outlook operation ids", () => {
    const operationIds = microsoftOutlookConnector.actions.map((a) =>
      connectorOperationId(microsoftOutlookConnector, a.id)
    );
    expect(operationIds).toEqual([
      "outlook_search_messages",
      "outlook_get_message",
      "outlook_list_mail_folders",
      "outlook_list_events",
      "outlook_get_event",
      "outlook_create_draft",
      "outlook_move_message",
      "outlook_create_event",
      "outlook_update_event",
      "outlook_send_message",
      "outlook_delete_message",
      "outlook_delete_event",
    ]);
  });

  it("projects the expected onedrive operation ids", () => {
    const operationIds = microsoftOneDriveConnector.actions.map((a) =>
      connectorOperationId(microsoftOneDriveConnector, a.id)
    );
    expect(operationIds).toEqual([
      "onedrive_search_files",
      "onedrive_get_item",
      "onedrive_list_children",
      "onedrive_read_file_content",
      "onedrive_upload_file",
    ]);
  });

  it("declares provider scopes on every action", () => {
    for (const connector of connectors) {
      for (const action of connector.actions) {
        expect(
          action.providerScopes,
          `${connector.id}/${action.id}`
        ).toBeDefined();
        expect(action.providerScopes!.length).toBeGreaterThan(0);
      }
    }
  });

  it("carries write-capable scopes on all non-read actions", () => {
    const writeScopePattern =
      /\.(ReadWrite|Send)(\.|$)|^Files\.ReadWrite$|^Mail\.Send$/;
    for (const connector of connectors) {
      for (const action of connector.actions) {
        if (action.group === "read") {
          continue;
        }
        expect(
          action.providerScopes!.some((s) => writeScopePattern.test(s)),
          `${connector.id}/${action.id} scopes: ${action.providerScopes!.join(",")}`
        ).toBe(true);
      }
    }
  });

  it("uses the shared Microsoft OAuth config on both connectors", () => {
    for (const connector of connectors) {
      const oauth2 = connector.auth.oauth2;
      expect(connector.auth.kind).toBe("oauth2");
      expect(oauth2.authUrl).toBe(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
      );
      expect(oauth2.tokenUrl).toBe(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token"
      );
      expect(oauth2.clientIdEnv).toBe("MICROSOFT_OAUTH_CLIENT_ID");
      expect(oauth2.clientSecretEnv).toBe("MICROSOFT_OAUTH_CLIENT_SECRET");
      expect(oauth2.baseScopes).toEqual([
        "openid",
        "email",
        "offline_access",
        "User.Read",
      ]);
    }
  });
});
